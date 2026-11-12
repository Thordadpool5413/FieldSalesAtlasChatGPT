import { connectionConstraints, flightInstants, type FlightReview, type ConnectionRequirements } from '../shared/travel/readiness';
import type { Airport,Board,TrainerProfile } from './opsModels';

import { workspaceDeviceKey } from './deviceWorkspace';
export type BookedLeg = {
  id: string;
  carrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departDate: string;
  departTime: string;
  arriveDate: string;
  arriveTime: string;
  departureZone?: string; arrivalZone?: string; connection?: ConnectionRequirements;
};

export type BookedFlight = {
  id: string;
  trainerId: 'trainer_a'|'trainer_b';
  legs: BookedLeg[];
  verified: boolean; // Legacy field means user-reviewed fields only, never airline verification.
  review?: FlightReview;
  revision?: number;
  changes?: Array<{ at: string; fields: string[] }>;
  source: 'pasted text'|'file'|'manual';
  createdAt: string;
  updatedAt: string;
  sharedTripId?: string;
};
export type ParseResult = {
  legs: BookedLeg[];
  warnings: string[];
  fragments: number;
};
export type FlightImpact = {
  level: 'review'|'attention'|'context';
  title: string;
  explanation: string;
  date?: string;
  source: string;
};

const KEY = 'atlas-booked-flight-guardian-v1';
const IATA = /^[A-Z]{3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HMS = /^([01]\d|2[0-3]):[0-5]\d$/;
const MONTHS = [
  'jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'
];

export function emptyBookedLeg(): BookedLeg {
  return {
    id: crypto.randomUUID(),
    carrier: '', flightNumber: '',
    origin: '', destination: '',
    departDate: '', departTime: '', arriveDate: '', arriveTime: ''
  };
}
export function normalizeAirport(v: string): string {
  return v.replace(/[^a-z]/ig,'').toUpperCase().slice(0,3);
}
export function normalizeCarrier(v: string): string {
  return v.replace(/[^A-Z0-9]/ig,'').toUpperCase().slice(0,2);
}
export function normalizeFlightNumber(v: string): string {
  return v.replace(/[^\d]/g,'').slice(0,4);
}

function dateValid(s: string): boolean {
  if(!DAY.test(s))return false;
  const date=new Date(s+'T12:00:00Z');
  return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===s;
}
function isoDate(year: number, month: number, day: number): string {
  if(year<2000||year>2100||month<1||month>12||day<1||day>31)return '';
  const result=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  return dateValid(result)?result:'';
}
function dateIn(text: string): string {
  const iso=text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if(iso)return isoDate(Number(iso[1]),Number(iso[2]),Number(iso[3]));
  const digit=text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if(digit)return isoDate(Number(digit[3]),Number(digit[1]),Number(digit[2]));
  const monthFirst=text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i);
  if(monthFirst)return isoDate(Number(monthFirst[3]),MONTHS.indexOf(monthFirst[1].slice(0,3).toLowerCase())+1,Number(monthFirst[2]));
  const dayFirst=text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?,?\s+(20\d{2})\b/i);
  if(dayFirst)return isoDate(Number(dayFirst[3]),MONTHS.indexOf(dayFirst[2].slice(0,3).toLowerCase())+1,Number(dayFirst[1]));
  return '';
}
function timeIn(text:string):string {
  const m=text.match(/\b(0?\d|1\d|2[0-3]):([0-5]\d)\s*(AM|PM)?\b/i);
  if(!m)return '';
  let hour=Number(m[1]),minute=Number(m[2]);
  if(m[3]){
    if(hour<1||hour>12)return '';
    hour=hour%12+(m[3].toUpperCase()==='PM'?12:0);
  }
  if(hour>23||minute>59)return '';
  return String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
}
function airportsIn(line:string,known:Set<string>):string[]{
  const parens=[...line.matchAll(/\(([A-Z]{3})\)/g)].map(match=>match[1]);
  if(parens.length)return [...new Set(parens.filter(code=>known.size===0||known.has(code)))];
  const candidate=[...line.matchAll(/\b[A-Z]{3}\b/g)].map(match=>match[0]);
  // Avoid mistaking prose and airline names for airports.
  return [...new Set(candidate.filter(code=>known.has(code)))];
}
function findLabeled(lines:string[],kinds:'departure'|'arrival',known:Set<string>){
  const pattern=kinds==='departure'
    ?/\b(from|depart(?:ure|s|ing)?|origin|leaving)\b/i
    :/\b(to|arrive(?:s|d|ing|al)?|destination|landing)\b/i;
  for(let i=0;i<lines.length;i++){
    if(!pattern.test(lines[i]))continue;
    const code=airportsIn(lines[i],known)[0];
    if(code)return {code,line:lines[i],i};
  }
  return null;
}
function flightCode(lines:string[]):{carrier:string;number:string}|null {
  for(const line of lines){
    const explicit=line.match(/\b(?:flight(?:\s+number)?|flt)\s*[:#\-]?\s*([A-Z0-9]{2})\s*[- ]?\s*(\d{1,4})\b/i);
    if(explicit)return {carrier:normalizeCarrier(explicit[1]),number:normalizeFlightNumber(explicit[2])};
    const onOwnLine=line.match(/^\s*([A-Z0-9]{2})\s*[- ]?\s*(\d{1,4})\b/i);
    if(onOwnLine)return {carrier:normalizeCarrier(onOwnLine[1]),number:normalizeFlightNumber(onOwnLine[2])};
  }
  return null;
}
function extractLeg(lines:string[],known:Set<string>,fallbackDate:string):BookedLeg|null {
  const flight=flightCode(lines);
  const from=findLabeled(lines,'departure',known),to=findLabeled(lines,'arrival',known);
  let origin=from?.code||'',destination=to?.code||'';
  let departLine=from?.line||'',arriveLine=to?.line||'';
  if(!origin||!destination){
    for(const line of lines){
      const route=line.match(/\b([A-Z]{3})\s*(?:→|->|–|to)\s*([A-Z]{3})\b/i);
      if(route&&known.has(route[1].toUpperCase())&&known.has(route[2].toUpperCase())){
        origin=origin||route[1].toUpperCase();
        destination=destination||route[2].toUpperCase();
        break;
      }
    }
  }
  if(!origin||!destination){
    const locations=lines.map(line=>({line,codes:airportsIn(line,known)}))
      .filter(row=>row.codes.length).flatMap(row=>row.codes.map(code=>({code,line:row.line})));
    const reduced=locations.filter((row,i)=>i===0||row.code!==locations[i-1].code);
    if(reduced.length>=2){
      origin=origin||reduced[0].code;
      destination=destination||reduced.find(item=>item.code!==origin)?.code||'';
      departLine=departLine||reduced[0].line;
      arriveLine=arriveLine||reduced.find(item=>item.code===destination)?.line||'';
    }
  }
  if(!origin||!destination||origin===destination)return null;
  const date=lines.map(dateIn).find(Boolean)||fallbackDate;
  const departDate=dateIn(departLine)||date;
  // Arrival may be on the next calendar day. Never silently infer that its
  // date equals the departure date, especially on overnight flights.
  const arriveDate=dateIn(arriveLine)||'';
  return {
    ...emptyBookedLeg(),
    origin,destination,
    carrier:flight?.carrier||'',
    flightNumber:flight?.number||'',
    departDate:departDate||'',
    departTime:timeIn(departLine),
    arriveDate:arriveDate||'',
    arriveTime:timeIn(arriveLine)
  };
}

/** Local-only deterministic extraction. No airline lookup, AI service or network request. */
export function parseBookedText(raw:string,knownAirportCodes:string[]):ParseResult {
  const input=raw.slice(0,60000).replace(/\r/g,'')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/(?:p|div|tr|li)>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&');
  const lines=input.split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const known=new Set(knownAirportCodes.filter(c=>IATA.test(c)));
  const candidates:number[]=[];
  const header=/^(?:flight(?:\s+number)?|flt)\s*[:#\-]?\s*[A-Z0-9]{2}\s*[- ]?\d{1,4}\b/i;
  const standalone=/^[A-Z0-9]{2}\s*[- ]?\d{1,4}\s*(?:\||$)/i;
  lines.forEach((line,i)=>{
    if(header.test(line)||standalone.test(line))candidates.push(i);
  });
  const groups=candidates.length
    ?candidates.slice(0,12).map((start,i)=>lines.slice(
      start,i+1<candidates.length?candidates[i+1]:lines.length))
    :[lines];
  const globalDate=lines.map(dateIn).find(Boolean)||'';
  // A single first-leg date must not silently become the return flight's date.
  const detected=groups.map((g,index)=>extractLeg(g,known,
    index===0||groups.length===1?globalDate:''))
    .filter((leg):leg is BookedLeg=>!!leg)
    .filter((leg,index,list)=>index===list.findIndex(other=>
      other.origin===leg.origin&&other.destination===leg.destination&&
      other.flightNumber===leg.flightNumber&&other.departDate===leg.departDate))
    .slice(0,8);
  const warnings:string[]=[];
  if(!detected.length)warnings.push('No complete airport pair was recognized. Add the flights manually.');
  if(detected.some(leg=>!leg.departDate))warnings.push('A full travel date with year was not found on every leg. Enter it manually.');
  if(detected.some(leg=>!leg.arriveDate))
    warnings.push('One or more arrival dates were not explicit. Confirm whether the flight arrives on the next day before saving.');
  if(detected.some(leg=>!leg.departTime||!leg.arriveTime))
    warnings.push('Some flight times were missing. Do not infer a connection buffer until they are reviewed.');
  if(detected.some(leg=>!leg.carrier||!leg.flightNumber))
    warnings.push('At least one operating airline or flight number was not identified.');
  warnings.push('Extraction is a draft, not an airline-verified reservation. Review every leg before saving.');
  return {legs:detected,warnings,fragments:groups.length};
}
export function legValid(leg:BookedLeg):boolean{
  return IATA.test(leg.origin)&&IATA.test(leg.destination)&&
    leg.origin!==leg.destination&&dateValid(leg.departDate)&&
    (!leg.arriveDate||dateValid(leg.arriveDate))&&
    (!leg.departTime||HMS.test(leg.departTime))&&
    (!leg.arriveTime||HMS.test(leg.arriveTime))&&
    (!leg.carrier||/^[A-Z0-9]{2}$/.test(leg.carrier))&&
    (!leg.flightNumber||/^\d{1,4}$/.test(leg.flightNumber));
}
export function itineraryValid(legs:BookedLeg[]):boolean {
  if(!legs.length||legs.length>8||!legs.every(legValid))return false;
  try {
    let previous: ReturnType<typeof flightInstants> = null;
    for(const leg of legs){
      const current=flightInstants(leg);
      if(current&&previous&&Date.parse(current.departure)<Date.parse(previous.arrival))return false;
      previous=current;
    }
    return true;
  }catch{return false;}
}
function safeStamp(value:unknown):string|undefined{
  if(typeof value!=='string')return undefined;
  const ms=Date.parse(value);
  return Number.isFinite(ms)&&ms<=Date.now()+300000?new Date(ms).toISOString():undefined;
}
export function safeReview(value:unknown):FlightReview|undefined{
  if(!value||typeof value!=='object')return undefined;
  const row=value as Record<string,unknown>;
  return {fieldsReviewedAt:safeStamp(row.fieldsReviewedAt),ticketingConfirmedAt:safeStamp(row.ticketingConfirmedAt),airlineCheckedAt:safeStamp(row.airlineCheckedAt)};
}
export function changedBookingFields(before:BookedLeg[],after:BookedLeg[]):string[]{
  const fields:Array<keyof BookedLeg>=['carrier','flightNumber','origin','destination','departDate','departTime','arriveDate','arriveTime','departureZone','arrivalZone'];
  const changes:string[]=[];
  for(let i=0;i<Math.max(before.length,after.length);i++){
    if(!before[i]){changes.push('Leg '+(i+1)+' added');continue;}
    if(!after[i]){changes.push('Leg '+(i+1)+' removed');continue;}
    for(const field of fields)if((before[i][field]||'')!==(after[i][field]||''))changes.push('Leg '+(i+1)+' '+field+': '+(before[i][field]||'unknown')+' → '+(after[i][field]||'unknown'));
    if(JSON.stringify(before[i].connection)!==JSON.stringify(after[i].connection))changes.push('Leg '+(i+1)+' connection requirements changed');
  }
  return changes;
}
function safeLeg(candidate:unknown):BookedLeg|null {
  if(!candidate||typeof candidate!=='object')return null;
  const leg=candidate as Record<string,unknown>;
  const s=(key:string,max:number)=>typeof leg[key]==='string'?leg[key].slice(0,max):'';
  const record:BookedLeg={
    id:s('id',70)||crypto.randomUUID(),
    carrier:normalizeCarrier(s('carrier',8)),
    flightNumber:normalizeFlightNumber(s('flightNumber',10)),
    origin:normalizeAirport(s('origin',6)),
    destination:normalizeAirport(s('destination',6)),
    departDate:s('departDate',10),departTime:s('departTime',5),
    arriveDate:s('arriveDate',10),arriveTime:s('arriveTime',5),
    departureZone:s('departureZone',80)||undefined,arrivalZone:s('arrivalZone',80)||undefined
  };
  const connection=leg.connection;
  if(connection&&typeof connection==='object'){
    const c=connection as Record<string,unknown>, n=(key:string,max:number)=>typeof c[key]==='number'&&Number.isInteger(c[key])&&c[key]>=0&&c[key]<=max?c[key] as number:undefined;
    record.connection={transferMinutes:n('transferMinutes',720),boardingCutoffMinutes:n('boardingCutoffMinutes',180),
      ticketRelation:['unknown','same-ticket-reported','separate-tickets'].includes(String(c.ticketRelation))?c.ticketRelation as ConnectionRequirements['ticketRelation']:'unknown'};
  }
  return legValid(record)?record:null;
}
function safeFlight(input:unknown):BookedFlight|null{
  if(!input||typeof input!=='object')return null;
  const item=input as Record<string,unknown>;
  if(item.trainerId!=='trainer_a'&&item.trainerId!=='trainer_b')return null;
  if(!Array.isArray(item.legs))return null;
  const legs=item.legs.slice(0,8).map(safeLeg).filter((leg):leg is BookedLeg=>!!leg);
  if(!itineraryValid(legs))return null;
  const s=(key:string,max:number)=>typeof item[key]==='string'?item[key].slice(0,max):'';
  return {
    id:s('id',70)||crypto.randomUUID(),
    trainerId:item.trainerId,
    legs,verified:item.verified===true,review:safeReview(item.review),
    revision:typeof item.revision==='number'&&Number.isInteger(item.revision)&&item.revision>0?item.revision:1,
    changes:Array.isArray(item.changes)?item.changes.slice(-10).flatMap((entry:unknown)=>{
      if(!entry||typeof entry!=='object')return [];
      const e=entry as Record<string,unknown>,at=safeStamp(e.at);
      return at&&Array.isArray(e.fields)?[{at,fields:e.fields.filter((field:unknown)=>typeof field==='string'&&/^Leg \d+ /.test(field)).slice(0,60).map((field:string)=>field.slice(0,240))}]:[];
    }):[],
    source:item.source==='file'||item.source==='pasted text'?item.source:'manual',
    createdAt:s('createdAt',40),updatedAt:s('updatedAt',40),
    ...(s('sharedTripId',70)?{sharedTripId:s('sharedTripId',70)}:{})
  };
}
function readBookingRecords(key:string):BookedFlight[]{
  try{
    const source=JSON.parse(localStorage.getItem(key)||'null');
    if(!source||source.version!==1||!Array.isArray(source.records))return [];
    return source.records.slice(0,30).map(safeFlight)
      .filter((r: BookedFlight | null):r is BookedFlight=>!!r);
  }catch{return [];}
}
export function readBookedFlights():BookedFlight[]{return readBookingRecords(workspaceDeviceKey(KEY));}
export const sanitizedBooking = safeFlight;
export function readEarlierDeviceBookings():BookedFlight[]{return workspaceDeviceKey(KEY)===KEY?[]:readBookingRecords(KEY);}
export function storeBookedFlights(items:BookedFlight[]):void{
  // Explicit user action only. Raw confirmation emails, PNRs, passenger details,
  // full ticket numbers, addresses, and payment info never enter the stored schema.
  const records=items.slice(0,30).map(safeFlight).filter((r: BookedFlight | null):r is BookedFlight=>!!r);
  localStorage.setItem(workspaceDeviceKey(KEY),JSON.stringify({version:1,records}));
}
export function connectionReviews(legs:BookedLeg[]):FlightImpact[]{
  return connectionConstraints(legs).map(step=>({
    level:step.marginMinutes!==null&&step.marginMinutes<0?'attention':step.missing.length?'review':'context',
    title:step.label+(step.marginMinutes===null?' needs review':': '+step.marginMinutes+' minutes of remaining margin'),
    explanation:step.basis+' '+step.missing.join(' '),
    source:'Reviewed itinerary and supplied connection requirements; airline minimum connection times remain unverified'
  }));
}
function dayInRange(day:string,start:string,end:string){
  return day>=start&&day<=end;
}
function daySet(legs:BookedLeg[]):Set<string>{
  const result=new Set<string>();
  for(const leg of legs){
    if(leg.departDate)result.add(leg.departDate);
    if(leg.arriveDate)result.add(leg.arriveDate);
  }
  return result;
}
export function coachingExposure(
  flight:BookedFlight,
  board:Board,
  trainers:TrainerProfile[],
  airports:Airport[]
):FlightImpact[]{
  const result:FlightImpact[]=[];
  const profile=trainers.find(t=>t.id===flight.trainerId);
  if(!profile)return result;
  const onFlightDays=daySet(flight.legs);
  const visits=(board.visits||[]).filter(visit=>
    ['Planned','Rescheduled'].includes(visit.status)&&
    (visit.trainer||board.managers?.find(m=>m.id===visit.managerId)?.trainer||'')===profile.name&&
    onFlightDays.has(visit.date));
  for(const visit of visits.slice(0,12)){
    const person=board.managers?.find(m=>m.id===visit.managerId);
    result.push({
      level:'attention',title:'Coaching visit on flight day',
      explanation:(person?.name||'A scheduled manager')+
        ' has a saved coaching visit on '+visit.date+
        '. Compare the actual airport arrival, ground travel and meeting time before assuming the visit is feasible.',
      date:visit.date,source:'Shared Field Sales Atlas visit record'
    });
  }
  const ownTrips=(board.trips||[]).filter(t=>t.trainer===profile.name&&t.status==='Planned'&&
    t.id!==flight.sharedTripId&&[...onFlightDays].some(day=>dayInRange(day,t.startDate,t.endDate)));
  for(const trip of ownTrips.slice(0,6))result.push({
    level:'review',title:'Existing field trip overlaps travel day',
    explanation:'A shared trip titled '+trip.title+' occupies a flight date. This may be the same journey or a scheduling conflict. Review before publishing a second trip.',
    date:trip.startDate,source:'Shared Field Sales Atlas itinerary'
  });
  const blocks=(board.availability||[]).filter(b=>b.trainerId===flight.trainerId&&
    [...onFlightDays].some(day=>dayInRange(day,b.startDate,b.endDate)));
  for(const block of blocks.slice(0,5))result.push({
    level:'attention',title:'Flight date overlaps blocked availability',
    explanation:'The trainer is recorded as '+block.reason.toLowerCase()+
      ' between '+block.startDate+' and '+block.endDate+'. Reconfirm before traveling.',
    date:block.startDate,source:'Shared trainer availability'
  });
  const other=trainers.find(t=>t.id!==profile.id);
  if(visits.length&&other){
    const blockedDay=[...onFlightDays].some(date=>
      (board.availability||[]).some(item=>item.trainerId===other.id&&dayInRange(date,item.startDate,item.endDate))||
      (board.visits||[]).some(item=>item.trainer===other.name&&item.date===date&&
        ['Planned','Rescheduled'].includes(item.status))||
      (board.trips||[]).some(item=>item.trainer===other.name&&item.status==='Planned'&&
        dayInRange(date,item.startDate,item.endDate)));
    result.push({
      level:'context',title:blockedDay?'Other trainer has recorded commitments':'Possible two-trainer coverage discussion',
      explanation:blockedDay?
        other.name+' has at least one recorded calendar commitment on relevant dates. Check manually before proposing a handoff.':
        other.name+' has no conflicting trip, visit or block recorded on these travel dates. This is NOT verified availability; check their external calendar and ask before reassigning.',
      source:'Shared trainer records; external availability not connected'
    });
  }
  const arrival=flight.legs[flight.legs.length-1];
  const airport=airports.find(a=>a.iata===arrival?.destination);
  if(airport){
    const regional=(board.managers||[]).filter(m=>m.baseState===airport.state);
    if(regional.length)result.push({
      level:'context',title:regional.length+' manager'+(regional.length===1?'':'s')+' mapped near the arrival region',
      explanation:arrival.destination+' is mapped to '+airport.state+'. These manager records are in the same state or province, NOT confirmed driving distance or available appointments.',
      source:'Airport directory and saved manager base regions'
    });
  }
  if(!result.length)result.push({
    level:'context',title:'No matching shared commitments found',
    explanation:'Atlas found no saved visit, trip or unavailable block on the entered flight days. It has not checked external calendars, actual airport flight status or ground transfer times.',
    source:'Shared workspace records only'
  });
  return result;
}
