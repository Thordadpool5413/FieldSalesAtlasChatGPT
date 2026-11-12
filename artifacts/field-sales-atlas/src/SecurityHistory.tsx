import {
ArrowRight,
Check,Clock3,
ExternalLink,
History,Info,
Plus,RefreshCw,ShieldCheck,
Trash2
} from 'lucide-react';
import { useEffect,useMemo,useRef,useState } from 'react';
import { useOp } from './Operations';
import { today } from './opsModels';
import './SecurityHistory.css';
import { api } from './workspaceApi';
import { securityHistorySchema, type SecurityHistoryReport as Report } from './SecurityHistoryData';
import { STARTER_AIRPORTS } from './opsModels';

type Queue = 'standard'|'precheck';
type Personal = {
  id:string;airport:string;terminal:string;queue:Queue;
  minutes:number;date:string;
};
// Airport options are candidate archive queries, not proof of published coverage.
 // The backend response determines whether usable rows actually exist.
const covered=['JFK','EWR','PHL','MCO','MIA','BOS','LGA','BWI','DCA','IAD',
  'DTW','CLT','CLE','PIT','CVG','CMH','JAX','DFW','IAH','HOU','MSP','STL',
  'DEN','SLC','SEA','SFO','SAN','PDX','LAS','PHX'];
const validCodes=new Set(covered);
const legacyPersonalKey='atlas-personal-security-experiences-v1';
function readPersonal(storageKey:string):Personal[]{
  try{
    // Preserve the previous device records under trainer A; other trainer seats start separately.
    const raw=localStorage.getItem(storageKey);
    if(!raw)return [];
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed))return [];
    return parsed.filter((entry:Personal)=>entry&&typeof entry.id==='string'&&
      /^[A-Z]{3}$/.test(entry.airport) &&
      (entry.queue==='standard'||entry.queue==='precheck') &&
      Number.isFinite(entry.minutes)&&entry.minutes>0&&entry.minutes<300
    ).slice(0,80);
  }catch{return [];}
}
function median(nums:number[]):number|null{
  if(!nums.length)return null;
  const values=[...nums].sort((a,b)=>a-b);
  const middle=Math.floor(values.length/2);
  return Math.round(values.length%2?values[middle]:(values[middle-1]+values[middle])/2);
}
function observationDate(value:string){const instant=Date.parse(value);return Number.isFinite(instant)?new Date(instant).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'Unknown date';}
function hourLabel(hour:number){
  const time=new Date(2001,0,1,hour);
  return time.toLocaleTimeString('en-US',{hour:'numeric'});
}
export default function SecurityHistory({airport,travelDate}:{airport:string;travelDate?:string}){
  const ctx=useOp();
  const personalKey=legacyPersonalKey+'-'+(ctx.board.team?.id || 'unlinked')+'-'+ctx.activeTrainerId;
  const [selected,setSelected]=useState(/^[A-Z]{3}$/.test(airport)?airport:'');
  const [date,setDate]=useState(travelDate || today());
  const [hour,setHour]=useState<number|null>(null);
  const [report,setReport]=useState<Report|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [buffer,setBuffer]=useState<number|null>(null);
  const [personalStore,setPersonalStore]=useState(()=>({key:personalKey,rows:readPersonal(personalKey)}));
  const personal=personalStore.key===personalKey?personalStore.rows:readPersonal(personalKey);
  const earlierPersonal=readPersonal(legacyPersonalKey+'-'+ctx.activeTrainerId).concat(ctx.activeTrainerId==='trainer_a'?readPersonal(legacyPersonalKey):[])
    .filter((record,index,all)=>all.findIndex(item=>item.id===record.id)===index&&!personal.some(item=>item.id===record.id));
  const request=useRef(0);
  const [showLog,setShowLog]=useState(false);
  const [minutes,setMinutes]=useState('');
  const [terminal,setTerminal]=useState('');
  const [queue,setQueue]=useState<Queue>('standard');
  const [feedback,setFeedback]=useState('');
  const code=selected;
  useEffect(()=>{setSelected(/^[A-Z]{3}$/.test(airport)?airport:'');},[airport]);
  useEffect(()=>{if(travelDate)setDate(travelDate);},[travelDate]);
  const currentPersonal=useMemo(()=>personal.filter(row=>row.airport===code),[personal,code]);
  const queuePersonal=useMemo(()=>currentPersonal.filter(row=>row.queue===queue),[currentPersonal,queue]);
  useEffect(()=>{request.current++;setLoading(false);setReport(null);setError('');setFeedback('');},[code,date,hour]);
  function savePersonal(rows:Personal[]){
    try{localStorage.setItem(personalKey,JSON.stringify(rows.slice(0,80)));setPersonalStore({key:personalKey,rows:rows.slice(0,80)});return true;}
    catch{setFeedback('Browser storage is unavailable. This observation was not saved.');return false;}
  }
  async function check(){
    if(loading || !/^[A-Z]{3}$/.test(code) || hour===null || !date)return;
    const token=++request.current;
    setLoading(true);setError('');setFeedback('');setReport(null);
    const params=new URLSearchParams({airport:code,date,hour:String(hour)});
    try{
      const res=await api.get('/api/travel/security-history?'+params.toString());
      const parsed=securityHistorySchema.safeParse(res.data);
      if(!parsed.success)throw Error('The checkpoint source returned an unreadable result. No wait estimate was assigned. Try again or check the public source.');
      if(parsed.data.airport!==code||parsed.data.localDate!==date||parsed.data.localHour!==hour)throw Error('The returned history does not match your airport and arrival time. Run the check again.');
      if(token===request.current)setReport(parsed.data);
    }catch(err){
      if(token===request.current)setError(err instanceof Error?err.message:'The historical airport data could not be read.');
    }finally{if(token===request.current)setLoading(false);}
  }
  function addPersonal(){
    const measured=Number(minutes);
    if(!/^[A-Z]{3}$/.test(code)||!minutes||!Number.isFinite(measured)||measured<1||measured>240){
      setFeedback('Enter a measured security-line time from 1 to 240 minutes.');
      return;
    }
    const record:Personal={
      id:typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():Date.now().toString(),
      airport:code,terminal:terminal.trim().slice(0,45),queue,
      minutes:Math.round(measured),date:today()
    };
    if(!savePersonal([record,...readPersonal(personalKey)]))return;
    setFeedback('Your experience was saved on this device only.');
    setShowLog(false);
  }
  function deletePersonal(id:string){
    if(!savePersonal(readPersonal(personalKey).filter(record=>record.id!==id)))return;
    setFeedback('Personal record deleted from this device.');
  }
  const memory=median(queuePersonal.map(record=>record.minutes));
  return <section className="sh-root" aria-label="Airport checkpoint intelligence">
    <header className="sh-head">
      <div>
        <span className="sh-overline"><History size={15}/> FREE CHECKPOINT HISTORY</span>
        <h2>Airport Security Memory</h2>
        <p>Study posted checkpoint waits at the airport and time you plan to arrive.
          Record your own experience to learn a personal airport buffer.</p>
      </div>
      <ShieldCheck size={29}/>
    </header>
    <div className="sh-query">
      <label>Airport
        <select value={code} onChange={event=>setSelected(event.target.value)}>
          {!code&&<option value="">Choose your airport</option>}
          {!!code&&!validCodes.has(code)&&<option value={code}>{code} · archive coverage unverified</option>}
          {[...covered].sort().map(value=><option key={value} value={value}>{value} · {STARTER_AIRPORTS.find(item=>item.iata===value)?.name || 'Query checkpoint archive'}</option>)}
        </select>
      </label>
      <label>Airport local date (selects historical weekday)
        <input type="date" value={date} onChange={event=>setDate(event.target.value)}/>
      </label>
      <label>Checkpoint arrival time
        <select value={hour??''} onChange={event=>setHour(event.target.value===''?null:Number(event.target.value))}>
          <option value="">Choose your planned arrival time</option>
          {Array.from({length:24},(_,i)=><option key={i} value={i}>{hourLabel(i)}</option>)}
        </select>
      </label>
      <button className="sh-run" disabled={loading||!code||hour===null||!date} onClick={()=>void check()}>
        {loading?<RefreshCw size={17}/>:<History size={17}/>}
        {loading?'Reading history…':'Analyze checkpoint history'} <ArrowRight size={16}/>
      </button>
    </div>
    {!report&&!loading&&!error&&<p className="sh-note"><Info size={15}/>Choose when you plan to reach security, then analyze. The date matches historical weekdays; it does not predict your wait.</p>}
    {loading&&<p className="sh-note" role="status"><RefreshCw size={15} className="fr-spinning"/>Checking the published archive and matching your airport, weekday and local hour…</p>}
    {airport&&/^[A-Z]{3}$/.test(airport)&&!validCodes.has(airport)&&
      <p className="sh-note"><Info size={14}/>
        Archive coverage for your route's departure airport {airport} is unverified.
        A different airport's history cannot establish waits at {airport}. Availability is verified only when the archive returns records.
      </p>}
    {error&&<p className="sh-error" role="alert">{error}</p>}
    {report&&!report.available&&<div className="sh-error sh-empty-source" role="status">
      <div><strong>No usable checkpoint history returned for {code}</strong>
        <p>Your airport, weekday and hour could not be matched to a usable historical sample. Allow time based on your airline and airport guidance.</p>
        <small>Unsupported, unavailable and empty sample results are not an estimate of zero minutes.</small>
      </div>
      <a href="https://huggingface.co/datasets/digitalhen/us-airport-wait-times"
        target="_blank" rel="noreferrer">View the public source <ArrowRight size={14}/></a>
      <details className="sh-source-details"><summary>Why history is unavailable</summary><p>{report.message}</p></details>
    </div>}
    <div className="sh-comparison-controls" aria-label="Your security comparison"><div><strong>Your comparison</strong><p>Optional: compare the archive with your own allowance. This does not set a recommended wait time.</p></div>
        <label>Screening lane to compare
          <select value={queue} onChange={event=>setQueue(event.target.value as Queue)}>
            <option value="standard">Standard</option>
            <option value="precheck">TSA PreCheck</option>
          </select>
        </label>
        <label>Use this many minutes for security
          <select value={buffer??''} onChange={event=>setBuffer(event.target.value===''?null:Number(event.target.value))}>
            <option value="">Choose your allowance</option>
            {[15,20,25,30,35,45,60,75,90].map(value=><option key={value} value={value}>{value} min</option>)}
          </select>
        </label>
    </div>
    {report?.available&&<div className="sh-results">
      {report.state==='stale'&&<p className="sh-error" role="status">{report.message} Last refresh attempt: {report.lastAttemptAt?new Date(report.lastAttemptAt).toLocaleString():'Unknown'}.</p>}
      {report.state!=='stale'&&report.message&&<p className="sh-note" role="status"><Info size={15}/>{report.message}</p>}
      <div className="sh-results-head">
        <div><span className="sh-overline">AIRPORT-PUBLISHED ESTIMATE ARCHIVE</span>
          <h3>{report.airport} · {hourLabel(report.localHour)} local</h3>
          <p>Source checked {new Date(report.checkedAt).toLocaleString()}.
            Historical observations are grouped by the source’s checkpoint / terminal label and screening lane.</p></div>
        <span>Source timezone: U.S. Eastern</span>
      </div>
      <div className="sh-coverage-summary"><ShieldCheck size={23}/><div><strong>{report.rows.length} checkpoint and lane groups matched</strong><p>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(date+'T12:00:00').getDay()]} around {hourLabel(hour!)} at {code}. Historical posted estimates, not live queues or a boarding guarantee.</p></div></div>
      {report.archive&&<p className="sh-note"><span>Verified archive retrieved {new Date(report.archive.retrievedAt).toLocaleString()}. <a href={report.archive.sourceUrl} target="_blank" rel="noreferrer">Published source file</a>. This is not a live wait estimate.</span></p>}
      <div className="sh-rows">
        {report.rows.map((row,index)=><article className="sh-row" key={index}>
          <div className="sh-row-top">
            <div><span>{row.queue==='precheck'?'TSA PRECHECK':'STANDARD SCREENING'}</span>
              <strong>{row.terminal}</strong></div>
            <small>{row.hourRecords} historical hourly records</small>
          </div>
          <small className="sh-observed-period">Observed {observationDate(row.observedStart)} – {observationDate(row.observedEnd)}</small>
          <div className="sh-stats">
            <div><span>Typical posted wait</span>
              <strong>{row.historicalMedianPosted}<small> min</small></strong></div>
            <div><span>Busier-hour benchmark</span>
              <strong>{row.typicalHourlyP75}<small> min</small></strong></div>
            <div><span>High-wait benchmark</span>
              <strong>{row.typicalHourlyP95===null?'Not reported':<>{row.typicalHourlyP95}<small> min</small></>}</strong>
              {row.p95Records!==undefined&&row.p95Records<row.hourRecords&&<small>{row.p95Records} of {row.hourRecords} records include p95</small>}</div>
          </div>
          {buffer!==null&&row.queue===queue&&<div className="sh-buffer-review">
            <div><Clock3 size={15}/><span>Your security-time allowance</span></div>
            <strong>{buffer===null?'Not supplied':buffer+' min'}</strong>
            {row.queue===queue && buffer!==null ? <span className={buffer<row.typicalHourlyP75?'sh-review-rose':'sh-review-aqua'}>
              {row.hourRecords<5?'Small historical sample. Do not rely on this comparison alone.':
                buffer<row.typicalHourlyP75?
                  'Below the recent sampled hourly p75 benchmark. Consider more time.' :
                  'Above the recent sampled hourly p75 benchmark. Real waits may still be longer.'}
            </span> : <span>Choose this lane above to compare its archive with your selected allowance.</span>}
          </div>}
        </article>)}
      </div>
      <p className="sh-note"><Info size={15}/>Typical, busier-hour and high-wait benchmarks are medians of the archive’s available hourly p50, p75 and p95 values. P95 can cover fewer records, so the benchmarks may describe different samples. They are posted estimates, not pooled passenger waits. Only open lanes are included; a missing value is not zero.</p>
      <details className="sh-source-details"><summary>Source scope and limitations</summary><p>The selected date chooses weekday and time-zone conversion, not a forecast for that calendar date. Up to 100 recent matching hourly records per queue are grouped by terminal.</p><ul>{report.limitations.map(item=><li key={item}>{item}</li>)}</ul>{report.archive&&<p>Verified revision {report.archive.revision} · SHA-256 {report.archive.sha256}</p>}</details>
    </div>}
    <div className="sh-memory">
      <div className="sh-memory-heading">
        <div><span className="sh-overline">PRIVATE · ON THIS DEVICE</span>
          <h3>Your airport memory</h3>
          <p>Track how long security took on past trips. Records stay on this device for this workspace and trainer. They are not synchronized with your partner.</p>
        </div>
        <button type="button" onClick={()=>setShowLog(v=>!v)}>
          {showLog?'Close':'Log a trip'} <Plus size={16}/>
        </button>
      </div>
      {earlierPersonal.length>0&&<details><summary>Earlier observations on this device</summary><p>Import only observations that belong to the selected trainer in this workspace. Earlier copies remain preserved.</p>
        <button type="button" className="op-btn" onClick={()=>{if(window.confirm('These observations will be attached locally to the selected trainer in this workspace. Have you reviewed that they belong here?'))savePersonal([...personal,...earlierPersonal]);}}>Import {earlierPersonal.length} earlier observations after review</button>
      </details>}
      <div className="sh-memory-overview">
        <div><span>Recorded trips at {code}</span><strong>{currentPersonal.length}</strong></div>
        <div><span>Personal median · {queue==='precheck'?'PreCheck':'Standard'}</span><strong>{memory===null?'Not yet recorded':memory+' min'}</strong></div>

      </div>
      {showLog&&<div className="sh-log-form">
        <label>Observed elapsed minutes
          <input type="number" min={1} max={240} value={minutes}
            onChange={event=>setMinutes(event.target.value)}/>
        </label>
        <label>Terminal (optional)
          <input value={terminal} onChange={event=>setTerminal(event.target.value)}
            maxLength={45} placeholder="Enter the terminal you used"/>
        </label>
        <label>Security lane
          <select value={queue} onChange={event=>setQueue(event.target.value as Queue)}>
            <option value="standard">Standard</option><option value="precheck">TSA PreCheck</option>
          </select>
        </label>
        <button type="button" className="sh-save" onClick={addPersonal}>Save experience <Check size={15}/></button>
      </div>}
      {currentPersonal.length>0&&<div className="sh-personal-list">          {queuePersonal.slice(0,4).map(item=><div key={item.id}>
          <span><strong>{item.minutes} min</strong> · {item.queue==='precheck'?'PreCheck':'Standard'}
            {item.terminal?' · '+item.terminal:''} · {item.date}</span>
          <button aria-label={'Delete personal record '+item.id} onClick={()=>deletePersonal(item.id)}>
            <Trash2 size={16}/></button>
        </div>)}
      </div>}
      {feedback&&<p className="sh-feedback" role="status">{feedback}</p>}
    </div>
    <footer className="sh-sources">
      <Info size={16}/>
      <div><strong>Not a live TSA wait-time API.</strong> Archive coverage, availability and freshness vary.
        Airport-posted queue estimates can differ from real screening experiences.
        <span> Archive: <a href="https://huggingface.co/datasets/digitalhen/us-airport-wait-times"
          target="_blank" rel="noreferrer">Henry Williams, CC BY 4.0 <ExternalLink size={12}/></a>.
          Do not use historical queue estimates as a guarantee of boarding-time sufficiency.</span>
      </div>
    </footer>
  </section>;
}
