/*
 * Free CC BY 4.0 airport-published security wait archive.
 * Each response is a bounded sample of historical hourly posted estimates.
 * No TSA API or real-time queue guarantee is implied.
 */
import { createHash } from 'node:crypto';
import { db } from './runtime/sdk';
import { zonedInstant } from '../shared/travel/time';
import { checkpointArchiveRows, type CheckpointArchiveReceipt } from './providers/checkpointArchive';
type Observation = Record<string, unknown>;
type Queue = 'standard'|'precheck';
type TerminalStats = {
  terminal: string;
  queue: Queue;
  hourRecords: number;
  historicalMedianPosted: number;
  typicalHourlyP75: number;
  typicalHourlyP95: number|null;
  p95Records?: number;
  observedStart: string;
  observedEnd: string;
};
export type SecurityHistoryReport = {
  state?:'historical'|'stale'|'unavailable';
  archive?:CheckpointArchiveReceipt;
  lastAttemptAt?:string;
  available: boolean;
  checkedAt: string;
  airport: string;
  localDate: string;
  localHour: number;
  etHour: number|null;
  etWeekday: number|null;
  timezone: string;
  rows: TerminalStats[];
  requestedQueues: Queue[];
  limitations: string[];
  source: string;
  sourceUrl: string;
  attribution: string;
  license: string;
  message: string;
};
const timezone: Record<string,string> = {};
for (const airport of 'JFK EWR PHL MCO MIA BOS LGA BWI DCA IAD DTW CLT CLE PIT CVG CMH JAX'.split(' '))
  timezone[airport]='America/New_York';
for (const airport of 'DFW IAH HOU MSP STL'.split(' '))
  timezone[airport]='America/Chicago';
for (const airport of 'DEN SLC'.split(' '))
  timezone[airport]='America/Denver';
for (const airport of 'SEA SFO SAN PDX LAS'.split(' '))
  timezone[airport]='America/Los_Angeles';
timezone.PHX='America/Phoenix';

function parts(zone: string, at: Date) {
  return new Intl.DateTimeFormat('en-US',{
    timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
    weekday:'short',hour:'2-digit',hourCycle:'h23'
  }).formatToParts(at);
}
function easternBucket(date: string, hour: number, zone: string) {
  try {
    const utc=new Date(zonedInstant(date,String(hour).padStart(2,'0')+':00',zone));
    const pairs=parts('America/New_York',utc);
    const weekday=pairs.find(row=>row.type==='weekday')?.value||'';
    const weekIndex=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(weekday);
    const easternHour=Number(pairs.find(row=>row.type==='hour')?.value);
    return weekIndex>=0&&Number.isFinite(easternHour)?{hour:easternHour,weekday:weekIndex}:null;
  } catch { return null; }
}
type HfResponse = {
  rows?: Array<{row?:Observation}>;
  partial?: boolean;
  num_rows_total?: number;
};
const cache=new Map<string,{expires:number;value:SecurityHistoryReport}>();
const pending=new Map<string,Promise<SecurityHistoryReport>>();
function num(value: unknown): number|null {
  if(typeof value!=='number' && (typeof value!=='string'||!value.trim()))return null;
  const result=Number(value);
  return Number.isFinite(result) && result>=0 && result<=1440 ? result : null;
}
function median(values:number[]):number|null {
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length ? Math.round(sorted.length%2?
    sorted[middle]:(sorted[middle-1]+sorted[middle])/2) : null;
}
function observationTime(value:unknown):string|null {
  if(typeof value!=='string')return null;
  const stamp=value.replace(' ','T');
  try{
    const iso=/[zZ]$|[+-]\d{2}:?\d{2}$/.test(stamp)?new Date(stamp).toISOString()
      :zonedInstant(stamp.slice(0,10),stamp.slice(11,16),'America/New_York');
    return Number.isFinite(Date.parse(iso))&&Date.parse(iso)<=Date.now()+300000?iso:null;
  }catch{return null;}
}
async function loadQueue(code:string, hour:number, weekday:number, queue:Queue) {
  const viewer=async()=>{
    const where='"airport"=\''+code+'\' AND "day_of_week"='+weekday+
      ' AND "hour_of_day"='+hour+' AND "queue_type"=\''+queue+'\'';
    const target=new URL('https://datasets-server.huggingface.co/filter');
    target.searchParams.set('dataset','digitalhen/us-airport-wait-times');
    target.searchParams.set('config','hourly');
    target.searchParams.set('split','train');
    target.searchParams.set('where',where);
    target.searchParams.set('orderby','"hour_et" DESC');
    target.searchParams.set('offset','0');
    target.searchParams.set('length','100');
    const get=async ()=>{
      return fetch(target.href,{
        headers:{
          Accept:'application/json',
          'User-Agent':'FieldSalesAtlas/1.0 (open checkpoint history research)'
        },
        signal:AbortSignal.timeout(10000)
      });
    };
    let response=await get();
    // The dataset viewer can reject an ORDER BY expression even when filtering
    // is supported. Retry the same bounded matching query without sorting.
    // No archive row is fabricated if either request fails.
    if(response.status===400||response.status===422){
      target.searchParams.delete('orderby');
      response=await get();
    }
    if(!response.ok)throw Error('Historical checkpoint archive HTTP '+response.status);
    const content=await response.text();
    if(content.length>350000)throw Error('Historical response exceeds bounded request size');
    const data=JSON.parse(content) as HfResponse;
    if(!Array.isArray(data.rows))throw Error('Unexpected airport history response shape');
    return {
      observations:data.rows.map(item=>item.row).filter((row):row is Observation=>
        !!row && typeof row==='object' && !Array.isArray(row)),
      total:Number.isFinite(data.num_rows_total)?data.num_rows_total||0:0,
      partial:!!data.partial
    };
  };
  // The published file is bounded, licensed, revision-pinned and shared between
  // concurrent queue queries. Prefer it to the frequently unavailable viewer.
  // Keep the viewer as an independent fallback when the archive cannot validate.
  try{
    const archive=await checkpointArchiveRows(code,hour,weekday);
    return {observations:archive.rows.filter(row=>row.queue_type===queue).slice(0,100),total:archive.rows.length,partial:false,archive:archive.receipt};
  }catch{return {...await viewer(),archive:undefined as CheckpointArchiveReceipt|undefined};}
}
async function loadSecurity(code:string, date:string, hour:number):Promise<SecurityHistoryReport> {
  const zone=timezone[code]||'';
  const base:SecurityHistoryReport={
    available:false,checkedAt:new Date().toISOString(),airport:code,localDate:date,
    localHour:hour,etHour:null,etWeekday:null,timezone:zone,
    rows:[],requestedQueues:['standard','precheck'],
    limitations:[
      'Airport-supplied posted estimates are not verified passenger wait times.',
      'Recent 100 matching hourly records per queue are sampled; not an all-history percentile.',
      'The hourly archive includes open lanes. Closed checkpoints and unobserved queues are not zero waits.',
      'Different airports publish values using different estimation methods and update frequencies.'
    ],
    source:'US Airport Security & Immigration Wait Times',
    sourceUrl:'https://huggingface.co/datasets/digitalhen/us-airport-wait-times',
    attribution:'Henry Williams, US Airport Security & Immigration Wait Times (2026)',
    license:'CC BY 4.0',
    message:''
  };
  if(!zone)return {...base,message:'No archived checkpoint coverage is known for this airport.'};
  const bucket=easternBucket(date,hour,zone);
  if(!bucket)return {...base,message:'The selected local hour is invalid or ambiguous at a daylight-saving clock change. Choose an unambiguous hour; no checkpoint estimate was assigned.'};
  base.etHour=bucket.hour;
  base.etWeekday=bucket.weekday;
  const results=await Promise.allSettled([
    loadQueue(code,bucket.hour,bucket.weekday,'standard'),
    loadQueue(code,bucket.hour,bucket.weekday,'precheck')
  ]);
  const grouped=new Map<string,{queue:Queue;terminal:string;items:Observation[]}>();
  const warnings:string[]=[];
  let archive:CheckpointArchiveReceipt|undefined;
  for(let index=0;index<results.length;index++){
    const entry=results[index];
    if(entry.status!=='fulfilled'){
      const detail=entry.reason instanceof Error?entry.reason.message:'Archive request failed';
      warnings.push((index===0?'Standard':'PreCheck')+' historical queue feed unavailable ('+
        detail.slice(0,85)+').');
      continue;
    }
    if(entry.value.archive)archive=entry.value.archive;
    if(entry.value.partial)warnings.push('Dataset viewer indexing is partial; historical coverage may be incomplete.');
    for(const row of entry.value.observations){
      const terminal=String(row.terminal||'Unknown').slice(0,45);
      const queue=index===0?'standard':'precheck';
      if(String(row.airport||'').toUpperCase()!==code ||
        String(row.queue_type||'')!==queue)continue;
      const observed=observationTime(row.hour_et);
      if(!observed)continue;
      const actual=parts('America/New_York',new Date(observed));
      const weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(actual.find(part=>part.type==='weekday')?.value||'');
      const publishedHour=Number(actual.find(part=>part.type==='hour')?.value);
      if(weekday!==bucket.weekday || publishedHour!==bucket.hour)continue;
      const p50=num(row.p50_wait),p75=num(row.p75_wait),p95=num(row.p95_wait);
      if(p50===null||p75===null||p75<p50||(p95!==null&&p95<p75))continue;
      const key=terminal+'|'+queue;
      if(!grouped.has(key))grouped.set(key,{terminal,queue,items:[]});
      grouped.get(key)!.items.push({...row,observedAt:observed});
    }
  }
  const stats:TerminalStats[]=[];
  for(const group of grouped.values()){
    const observations=group.items.filter(item=>num(item.p50_wait)!==null && num(item.p75_wait)!==null);
    if(observations.length===0)continue;
    const timestamps=observations.map(item=>String(item.observedAt)).sort();
    stats.push({
      terminal:group.terminal,queue:group.queue,hourRecords:observations.length,
      historicalMedianPosted:median(observations.map(item=>num(item.p50_wait)!).filter(Number.isFinite))!,
      typicalHourlyP75:median(observations.map(item=>num(item.p75_wait)!).filter(Number.isFinite))!,
      typicalHourlyP95:median(observations.flatMap(item=>num(item.p95_wait)===null?[]:[num(item.p95_wait)!])),
      p95Records:observations.filter(item=>num(item.p95_wait)!==null).length,
      observedStart:timestamps[0]||'',observedEnd:timestamps[timestamps.length-1]||''
    });
  }
  stats.sort((a,b)=>a.queue.localeCompare(b.queue)||a.terminal.localeCompare(b.terminal));
  if(stats.length===0)warnings.push('No qualifying historical rows returned for this airport, hour and weekday.');
  return {
    ...base,checkedAt:archive?.retrievedAt||base.checkedAt,available:stats.length>0,rows:stats,archive,message:[...new Set(warnings)].join(' '),
    limitations:[...base.limitations, ...new Set(warnings)]
  };
}
export async function securityHistory(
  airport:string,date:string,hour:number
):Promise<SecurityHistoryReport>{
  const zone=timezone[airport]||'';
  const bucket=zone?easternBucket(date,hour,zone):null;
  const storageId=createHash('sha256').update('checkpoint-v3|'+airport+'|'+bucket?.weekday+'|'+bucket?.hour).digest('hex');
  const key=airport+'|'+date+'|'+hour;
  const current=cache.get(key);
  if(current&&current.expires>Date.now())return current.value;
  if(pending.has(key))return pending.get(key)!;
  const task=(async()=>{
    const [saved]=await db.get<{queryVersion?:number;result?:SecurityHistoryReport;lastFailure?:SecurityHistoryReport;retryAfter:string;lastAttemptAt:string}>('atlas_checkpoint_history_v3',[storageId]);
    const snapshot=saved?.result;
    const valid=!!snapshot?.available && snapshot.airport===airport && snapshot.etHour===bucket?.hour && snapshot.etWeekday===bucket?.weekday
      && Number.isFinite(Date.parse(snapshot.checkedAt)) && Date.now()-Date.parse(snapshot.checkedAt)<=30*86400000
      && Date.now()-Date.parse(snapshot.checkedAt)>=-300000 && Array.isArray(snapshot.rows) && snapshot.rows.length>0
      && snapshot.rows.every(row=>row.hourRecords>0 && num(row.historicalMedianPosted)!==null && num(row.typicalHourlyP75)!==null
        &&(row.typicalHourlyP95===null||num(row.typicalHourlyP95)!==null) && !!observationTime(row.observedStart) && !!observationTime(row.observedEnd));
    if(valid&&Date.parse(saved!.retryAfter)>Date.now())return {...snapshot!,localDate:date,localHour:hour,lastAttemptAt:saved!.lastAttemptAt};
    // Retry failures from older query strategies immediately after an upgrade;
    // successful verified snapshots remain reusable and are never discarded.
    if(!valid&&saved?.queryVersion===4&&saved.lastFailure&&Date.parse(saved.retryAfter)>Date.now())return {...saved.lastFailure,localDate:date,localHour:hour};
    const fresh=await loadSecurity(airport,date,hour);
    const lastAttemptAt=new Date().toISOString();
    const value:SecurityHistoryReport=fresh.available?{...fresh,state:'historical',lastAttemptAt}
      :valid?{...snapshot!,state:'stale',lastAttemptAt,localDate:date,localHour:hour,
        message:'The archive could not be refreshed. Showing previously validated historical records; this is not a current wait estimate. '+fresh.message}
      :{...fresh,state:'unavailable',lastAttemptAt};
    await db.tx.update('atlas_checkpoint_history_v3',[{id:storageId,record:{queryVersion:4,result:value.available?value:undefined,lastFailure:value.available?undefined:value,lastAttemptAt,
      retryAfter:new Date(Date.now()+(fresh.available?24*3600000:15*60000)).toISOString()}}]);
    return value;
  })().catch(():SecurityHistoryReport=>({
    available:false,checkedAt:new Date().toISOString(),airport,localDate:date,localHour:hour,
    etHour:null,etWeekday:null,timezone:timezone[airport]||'',rows:[],requestedQueues:['standard','precheck'],
    source:'US Airport Security & Immigration Wait Times',
    sourceUrl:'https://huggingface.co/datasets/digitalhen/us-airport-wait-times',
    attribution:'Henry Williams (2026)',license:'CC BY 4.0',
    state:'unavailable',message:'The open historical checkpoint archive is temporarily unavailable.',
    limitations:['No wait time was estimated or fabricated.']
  })).then(value=>{
    if(cache.size>=120)cache.clear();
    cache.set(key,{expires:Date.now()+(value.available?3600000:60000),value});
    return value;
  }).finally(()=>pending.delete(key));
  pending.set(key,task);
  return task;
}
export const supportedCheckpointAirports=Object.keys(timezone);
