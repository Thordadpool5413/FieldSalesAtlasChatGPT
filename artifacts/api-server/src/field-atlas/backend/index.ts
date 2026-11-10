import {
  router,
  workspaceGuard,
  AppDatabaseError,
  json,
  error,
  db,
  ws,
  isAppDatabaseError,
} from './runtime/sdk';
import { randomUUID, createHash } from 'node:crypto';
import Papa from 'papaparse';
import { makeRestoreRoutes } from './restore';
import { nwsPointAlerts } from './nwsAlerts';
import { searchCensusZctas, resolveCensusZcta } from './censusZcta';
import { nwsAirportForecast } from './nwsForecast';
import { flightHistory } from './flightHistory';
import { securityHistory, supportedCheckpointAirports } from './securityHistory';
import { createDemoWorkspace } from './demo';
import { zoneAt } from './travel/zones';
import { zonedInstant } from '../shared/travel/time';
import { makeTravelRoutes } from './travel/routes';
import { curatedAirportDirectory, lookupAirports } from './providers/airports';
import { officialJson } from './providers/evidence';
import { liveAircraftNearAirport, liveAircraftProductionGate } from './providers/liveAircraft';
import { historyCoverage } from './providers/bts';
import { roadMatrix } from './providers/routing';
import { publicRoutingStatus } from './providers/routingConfig';
import { publicAirportEvidence, faa, metar as stationMetar, taf as stationTaf } from './providers/publicTravel';
import type { ScenarioBoard } from './travel/scenarios';

type Member = { id: string; workspaceId: string; role: 'owner' | 'member' };
type Team = { id: string; name: string; ownerId: string };
type Manager = {
  id: string;
  name: string;
  email: string;
  phone: string;
  homeAirport: string;
  trainer: string;
  cadence: string;
  focus: string;
  updatedAt?: string;
};
type Assignment = {
  id: string;
  managerId: string;
  stateCode: string;
  areaType: string;
  areaCode: string;
  areaName: string;
  role: string;
};
type Visit = {
  id: string;
  managerId: string;
  stateCode: string;
  date: string;
  airport: string;
  objective: string;
  status: string;
  trainer?: string;
  location?: string;
  outcome?: string;
  tripId?: string;
  startTime?: string;
  endTime?: string;
  source?: string;
  updatedAt?: string;
};

/* FAA NAS airport-wide operational advisories. Not an airline/flight tracker.
   Only one FAA fetch per cache window, with bounded response data and no secrets. */
type NasSignal={code:string;level:'critical'|'caution'|'none'|'unknown';headline:string;
  events:Array<{kind:string;reason:string;avgMinutes:number|null;updatedAt:string}>;
  config:{arrivalRate:number|null;arrivalRunways:string;departureRunways:string;updatedAt:string}|null;
  };
let nasCache:{expires:number;checkedAt:string;data:Map<string,NasSignal>}|null=null;
let nasFetch:Promise<{checkedAt:string;data:Map<string,NasSignal>}>|null=null;
const faaEventCodes=['groundStop','groundDelay','airportClosure','arrivalDelay','departureDelay'] as const;
const faaEventNames:Record<string,string>={
 groundStop:'Ground stop',groundDelay:'Ground delay program',
 airportClosure:'Airport closure advisory',arrivalDelay:'Arrival delays',
 departureDelay:'Departure delays'
};
function safeAirportEvent(raw:unknown){
 const event=bodyOf(raw);
 const reason=safe(String(event.reason||event.simpleText||event.text||event.delayReason||''),220);
 const delay=event.averageDelayMinutes??event.avgDelayMinutes??event.averageDelay??event.avgDelay??event.avg;
 const parsed=Number(typeof delay==='string'?delay.match(/\d+/)?.[0]:delay);
 const avgMinutes=delay!==undefined&&delay!==null&&Number.isFinite(parsed)&&parsed>=0&&parsed<900?Math.round(parsed):null;
 const updatedAt=String(event.updatedAt||event.sourceTimeStamp||event.startTime||'').slice(0,35);
 return {reason,avgMinutes,updatedAt};
}
async function currentNas(){
 if(nasCache&&nasCache.expires>Date.now())return {checkedAt:nasCache.checkedAt,data:nasCache.data};
 if(!nasFetch){
   nasFetch=(async()=>{
     const rows: unknown = await officialJson('https://nasstatus.faa.gov/api/airport-events');
     if(!Array.isArray(rows))throw Error('FAA event feed schema changed');
     const result=new Map<string,NasSignal>();
     for(const rawItem of rows.slice(0,1000)){
       const item=bodyOf(rawItem);
       const code=String(item.airportId||'').trim().toUpperCase();
       if(!/^[A-Z]{3}$/.test(code))continue;
       const events:NasSignal['events']=[];
       let level:NasSignal['level']='none';
       for(const kind of faaEventCodes){
         const notices = Array.isArray(item[kind]) ? item[kind] as unknown[] : item[kind] && typeof item[kind] === 'object' ? [item[kind]] : [];
         for (const notice of notices.slice(0, 8)) {
           const information=safeAirportEvent(notice);
           // Private/general-aviation restrictions do not imply closure to scheduled flights.
           if(kind==='airportClosure'&&/NON[\s-]?SKED|TRANSIENT\s+GA|PPR\b/i.test(information.reason))continue;
           events.push({kind:faaEventNames[kind],...information});
           if(['groundStop','groundDelay','airportClosure'].includes(kind))level='critical';
           else if(level!=='critical')level='caution';
         }
       }
       const configRaw=bodyOf(item.airportConfig);
       const rateSource=configRaw.arrivalRate;
       const arrivalRate=rateSource!==undefined&&rateSource!==null&&
         Number.isFinite(Number(rateSource))&&Number(rateSource)>=0&&Number(rateSource)<=250?
         Number(rateSource):null;
       const config=Object.keys(configRaw).length?{
         arrivalRate,
         arrivalRunways:typeof configRaw.arrivalRunwayConfig==='string'?safe(configRaw.arrivalRunwayConfig,100):'',
         departureRunways:typeof configRaw.departureRunwayConfig==='string'?safe(configRaw.departureRunwayConfig,100):'',
         updatedAt:typeof configRaw.sourceTimeStamp==='string'?safe(configRaw.sourceTimeStamp,40):''
       }:null;
       result.set(code,{
         code,level,
         headline:events[0]?.kind||'No current FAA airport-wide restriction in this feed',
         events:events.slice(0,6),config
       });
     }
     const checkedAt=new Date().toISOString();
     nasCache={expires:Date.now()+120000,checkedAt,data:result};
     return {checkedAt,data:result};
   })().finally(()=>{nasFetch=null;});
 }
 return nasFetch;
}

const validStates = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AB BC MB NB NL NS NT NU ON PE QC SK YT'.split(
    ' '
  )
);
const safe = (value: string, max: number = 180) =>
  String(value || '')
    .trim()
    .slice(0, max);
function guardRevision(workspaceId:string,revision:number){
  return workspaceGuard(workspaceId,revision,'Workspace changed during scheduling.');
}
const tables = (workspaceId: string) => {
  const id = workspaceId.replace(/[^A-Za-z0-9_-]/g, '');
  return {
    managers: 'atlas_managers_' + id,
    assignments: 'atlas_assignments_' + id,
    visits: 'atlas_visits_' + id,
  };
};
async function member(userId: string): Promise<Member | null> {
  const [found] = await db.get<Member>('atlas_members', [userId], {
    consistent: true,
  });
  return found || null;
}
async function getTeam(m: Member) {
  const [team] = await db.get<Team>('atlas_teams', [m.workspaceId]);
  return team || null;
}
function bodyOf(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}
function str(body: Record<string, unknown>, name: string, limit: number = 180) {
  return safe(String(body[name] ?? ''), limit);
}
async function boardFor(userId: string) {
  const m = await member(userId);
  if (!m) return { needsTeam: true };
  const t = tables(m.workspaceId);
  const [team, managers, assignments, visits] = await Promise.all([
    getTeam(m),
    db.list<Manager>(t.managers, { limit: 300 }),
    db.list<Assignment>(t.assignments, { limit: 500 }),
    db.list<Visit>(t.visits, { limit: 400 }),
  ]);
  return {
    needsTeam: false,
    team: {
      id: m.workspaceId,
      name: team?.name || 'Field Training Team',
      role: m.role,
    },
    managers: managers.items,
    assignments: assignments.items,
    visits: visits.items,
  };
}


type GeoArea = { code: string; name: string; lat: number | null; lon: number | null };
type CoachingNote = {
  id: string; managerId: string; date: string; trainer: string; skill: string;
  observation: string; commitment: string; dueDate: string; status: string; createdAt: string; updatedAt: string;
};
type Trip = {
  id: string; title: string; trainer: string; startDate: string; endDate: string;
  arrivalAirport: string; status: string; notes: string; stops: Array<{ managerId: string; stateCode: string; date: string; location: string; lat?: number; lon?: number }>;
  createdAt: string; updatedAt: string;
};
type Activity = { id: string; action: string; entity: string; actor: string; at: string; summary: string };
type AvailabilityBlock = {
  id:string;trainerId:'trainer_a'|'trainer_b';startDate:string;endDate:string;
  reason:'Unavailable'|'Personal time'|'Travel hold';notes:string;createdAt:string;
};
const geoStateFips: Record<string, string> = Object.fromEntries(
  'AL:01 AK:02 AZ:04 AR:05 CA:06 CO:08 CT:09 DE:10 DC:11 FL:12 GA:13 HI:15 ID:16 IL:17 IN:18 IA:19 KS:20 KY:21 LA:22 ME:23 MD:24 MA:25 MI:26 MN:27 MS:28 MO:29 MT:30 NE:31 NV:32 NH:33 NJ:34 NM:35 NY:36 NC:37 ND:38 OH:39 OK:40 OR:41 PA:42 RI:44 SC:45 SD:46 TN:47 TX:48 UT:49 VT:50 VA:51 WA:53 WV:54 WI:55 WY:56'
    .split(' ').map(entry => entry.split(':'))
);
const extraTables = (workspaceId: string) => {
  const id = workspaceId.replace(/[^A-Za-z0-9_-]/g, '');
  return {
    coaching: 'atlas_coaching_' + id,
    trips: 'atlas_trips_' + id,
    activity: 'atlas_activity_' + id,
    directory: 'atlas_directory_' + id,
    travelPlans: 'atlas_travel_plans_' + id,
    travelPrefs: 'atlas_travel_prefs_' + id,
    trainerProfiles: 'atlas_trainer_profiles_' + id,
    trainerAvailability: 'atlas_availability_' + id,
  };
};
async function pageAll<T>(table: string, pageSize: number = 200, maxPages: number = 20) {
  const items: Array<T & { id: string }> = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await db.list<T>(table, { limit: pageSize, ...(cursor ? { nextToken: cursor } : {}) });
    items.push(...(page.items as Array<T & { id: string }>));
    if (!page.nextToken) return { items, truncated: false };
    if (cursor === page.nextToken) throw new Error('Pagination cursor did not advance.');
    cursor = page.nextToken;
  }
  return { items, truncated: true };
}
// The selected trainer is a self-declared editor seat, not authenticated identity.
const trainerActor=(q:Record<string,string>,fallback:string)=>
  q.trainerId==='trainer_a'?'trainer_a':q.trainerId==='trainer_b'?'trainer_b':fallback;
const liveTable=(workspaceId:string)=>
  'atlas_live_'+workspaceId.replace(/[^A-Za-z0-9_-]/g,'').slice(0,83);
type LiveSubscriber={id:string;connectionId:string;trainer:string;actorId?:string;linkId?:string;expiresAt:string};
async function notifyWorkspace(workspaceId:string,actor:string,action:string,entity:string,at:string){
  try{
    const list=await db.list<LiveSubscriber>(liveTable(workspaceId),{limit:100});
    // Every delivery must be authorized against a CURRENT capability.
    // A removed trainer link cannot keep listening on an old WebSocket.
    const candidates=list.items.filter(s=>s.connectionId&&s.expiresAt>at&&
      s.actorId&&s.linkId&&/^[0-9a-f]{64}$/i.test(s.linkId)).slice(0,50);
    if(!candidates.length)return;
    const linkIds=[...new Set(candidates.map(s=>s.linkId!))];
    const links=await db.get<SharedLink>(guestLinkTable,linkIds,{consistent:true});
    const byId=new Map(linkIds.map((id,i)=>[id,links[i]]));
    const authorized=candidates.filter(s=>{
      const link=byId.get(s.linkId!);
      return link?.workspaceId===workspaceId&&link.actorId===s.actorId;
    });
    if(authorized.length)await ws.send(authorized.map(s=>s.connectionId),{
      type:'entity.update',entity_type:'workspace',entity_id:workspaceId,actor,action,entity,at
    });
  }catch(err){console.warn('Live delivery failed; persisted data unchanged.',String(err));}
}
async function activityLog(workspaceId:string,actor:string,action:string,entity:string,summary:string){
  const at=new Date().toISOString();
  try{
    await db.tx.add(extraTables(workspaceId).activity,[{
      id:randomUUID(),actor,action,entity,summary:safe(summary,250),at
    }]);
  }catch(err){console.warn('Activity history unavailable',String(err));}
  await notifyWorkspace(workspaceId,actor,action,entity,at);
}
function normalizeDate(value: unknown) {
  const d = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  const [year,month,day] = d.split('-').map(Number);
  const time = new Date(Date.UTC(year,month-1,day,12));
  return time.getUTCFullYear()===year && time.getUTCMonth()===month-1
    && time.getUTCDate()===day ? d : '';
}
function stripTsvName(value: string) {
  return value.replace(/, (Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|District of Columbia|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)$/, '');
}
async function censusAreas(stateCode: string, kind: 'counties' | 'place') {
  const fips = geoStateFips[stateCode];
  const name = kind === 'counties' ? 'counties' : 'place';
  const url = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_gaz_' + name + '_' + fips + '.txt';
  const response = await fetch(url, { headers: { Accept: 'text/plain' } });
  if (!response.ok) throw new Error('Census Gazetteer unavailable: ' + response.status);
  const raw = await response.text();
  if (raw.length > 2_000_000) throw new Error('Geographic file exceeds size limit.');
  const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('Geographic data is empty.');
  const headers = lines[0].split('|').map(x => x.trim().toUpperCase());
  const geoid = headers.indexOf('GEOID');
  const label = headers.indexOf('NAME');
  const lat = headers.indexOf('INTPTLAT');
  const lon = headers.indexOf('INTPTLONG');
  if (Math.min(geoid, label, lat, lon) < 0) throw new Error('Unexpected Census Gazetteer schema.');
  return lines.slice(1).map(line => {
    const cells = line.split('|').map(x => x.trim());
    const y = Number(cells[lat]);
    const x = Number(cells[lon]);
    return {
      code: cells[geoid] || '', name: stripTsvName(cells[label] || ''),
      lat: Number.isFinite(y) ? y : null,
      lon: Number.isFinite(x) ? x : null,
    } as GeoArea;
  }).filter(area => area.code && area.name).sort((a, b) => a.name.localeCompare(b.name));
}
const strField = (b: Record<string, unknown>, name: string, max: number) => safe(String(b[name] ?? ''), max);


type TravelQuoteServer = {
  id:string;origin:string;destination:string;returnOrigin:string;carrier:string;
  source:string;observedOn:string;fare:number;baggage:number;extra:number;
  outboundMinutes:number;returnMinutes:number;connections:number;
  outboundArrivalLocal:string;returnDepartureLocal:string;returnLandingLocal:string;notes:string;
  verifiedGroundMiles:number;verifiedGroundMinutes:number;
};
type TravelPlanServer = {
  id:string;title:string;trainer:string;departDate:string;returnDate:string;
  destination:{name:string;state:string;lat:number;lon:number;code?:string}|null;
  origins:string[];selectedArrival:string;managerIds:string[];notes:string;
  quotes:TravelQuoteServer[]; planning?:Record<string,unknown>; createdBy:string;createdAt:string;updatedAt:string;
};
function validAirport(code:string){return /^[A-Z]{3}$/.test(code);}
function validTravelDate(d:string){return !!normalizeDate(d);}
function boundedNumber(value:unknown,min:number,max:number){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min;
}
function cleanTravelPrefs(b:Record<string,unknown>){
  const source=b.preferences&&typeof b.preferences==='object'?bodyOf(b.preferences):b;
  const raw=Array.isArray(source.homeAirports)?source.homeAirports:[];
  const homeAirports=[...new Set(raw.map(x=>safe(String(x).toUpperCase(),3)).filter(validAirport))].slice(0,6);
  const homeDriveMinutes:Record<string,number>={};
  const drives=bodyOf(source.homeDriveMinutes);
  for(const code of homeAirports)homeDriveMinutes[code]=boundedNumber(drives[code],0,300);
  return {
    homeAirports,homeDriveMinutes,
    checkinMinutes:boundedNumber(source.checkinMinutes,30,240),
    rentalPickupMinutes:boundedNumber(source.rentalPickupMinutes,0,180),
    rentalReturnMinutes:boundedNumber(source.rentalReturnMinutes,0,180),
    hotelPerNight:boundedNumber(source.hotelPerNight,0,1500),
    mealsPerDay:boundedNumber(source.mealsPerDay,0,500),
    rentalPerDay:boundedNumber(source.rentalPerDay,0,1000),
    parkingPerDay:boundedNumber(source.parkingPerDay,0,200),
    fuelPerMile:boundedNumber(source.fuelPerMile,0,3),
    tollsPerTrip:boundedNumber(source.tollsPerTrip,0,500),
    groundMiscPerTrip:boundedNumber(source.groundMiscPerTrip,0,1000),
    valueOfTimePerHour:boundedNumber(source.valueOfTimePerHour,0,500),
    roadMultiplier:boundedNumber(source.roadMultiplier,1,2.3),
    assumedRoadMph:boundedNumber(source.assumedRoadMph,15,75),
    preferNonstop:!!source.preferNonstop,
    maxConnections:boundedNumber(source.maxConnections,0,4),
    preferredAirlines:safe(String(source.preferredAirlines??''),170),
  };
}
function travelPayload(b:Record<string,unknown>){
  const title=strField(b,'title',150);
  const departDate=normalizeDate(b.departDate), returnDate=normalizeDate(b.returnDate);
  if(!title||!validTravelDate(departDate)||!validTravelDate(returnDate)||departDate>returnDate){
    return {ok:false as const,message:'Enter a trip title and valid departure/return dates.'};
  }
  const origins=Array.isArray(b.origins)
    ? [...new Set(b.origins.map(x=>safe(String(x).toUpperCase(),3)).filter(validAirport))].slice(0,6):[];
  const selectedArrival=strField(b,'selectedArrival',3).toUpperCase();
  if(selectedArrival&&!validAirport(selectedArrival))return {ok:false as const,message:'Arrival airport must have a three-letter IATA code.'};
  if(!origins.length)return {ok:false as const,message:'Choose at least one home airport.'};
  const managers=Array.isArray(b.managerIds)
    ? [...new Set(b.managerIds.map(x=>safe(String(x),90)))].filter(Boolean).slice(0,12):[];
  let destination:null|{name:string;state:string;lat:number;lon:number;code?:string}=null;
  if(b.destination&&typeof b.destination==='object'){
    const p=bodyOf(b.destination);
    const name=strField(p,'name',160), state=strField(p,'state',2).toUpperCase();
    const lat=Number(p.lat),lon=Number(p.lon);
    if(name&&validStates.has(state)&&Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lon)&&Math.abs(lon)<=180)
      destination={name,state,lat,lon,code:strField(p,'code',12)};
    else return {ok:false as const,message:'Destination must be selected from a valid state and mapped place.'};
  }
  if(!managers.length&&!destination)return {ok:false as const,message:'Select a manager or a mapped destination city.'};
  if(!Array.isArray(b.quotes)||b.quotes.length>24)return {ok:false as const,message:'Too many flight quotes.'};
  const quotes:TravelQuoteServer[]=b.quotes.map(raw=>{
    const q=bodyOf(raw);
    const origin=strField(q,'origin',3).toUpperCase(),airport=strField(q,'destination',3).toUpperCase();
    const returnOrigin=strField(q,'returnOrigin',3).toUpperCase()||airport;
    const outboundArrivalLocal=strField(q,'outboundArrivalLocal',22);
    const returnDepartureLocal=strField(q,'returnDepartureLocal',22);
    const returnLandingLocal=strField(q,'returnLandingLocal',22);
    return {
      id:strField(q,'id',80)||randomUUID(),origin,destination:airport,returnOrigin,
      carrier:strField(q,'carrier',90),source:strField(q,'source',130),
      observedOn:normalizeDate(q.observedOn),
      fare:boundedNumber(q.fare,0,50000),baggage:boundedNumber(q.baggage,0,5000),
      extra:boundedNumber(q.extra,0,5000),outboundMinutes:boundedNumber(q.outboundMinutes,0,2880),
      returnMinutes:boundedNumber(q.returnMinutes,0,2880),connections:boundedNumber(q.connections,0,8),
      outboundArrivalLocal:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(outboundArrivalLocal)?outboundArrivalLocal:'',
      returnDepartureLocal:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(returnDepartureLocal)?returnDepartureLocal:'',
      returnLandingLocal:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(returnLandingLocal)?returnLandingLocal:'',
      notes:strField(q,'notes',600),
      verifiedGroundMiles:boundedNumber(q.verifiedGroundMiles,0,20000),
      verifiedGroundMinutes:boundedNumber(q.verifiedGroundMinutes,0,20000)
    };
  });
  if(quotes.some(q=>!validAirport(q.origin)||!validAirport(q.destination)||!validAirport(q.returnOrigin)||!origins.includes(q.origin))){
    return {ok:false as const,message:'Every quote needs an origin from your selected home airports and valid destination/return airport codes.'};
  }
  const rawPlanning=bodyOf(b.planning);
  const firstCoachingDate=normalizeDate(rawPlanning.firstCoachingDate)||departDate;
  const lastCoachingDate=normalizeDate(rawPlanning.lastCoachingDate)||returnDate;
  const hhmm=(value:unknown,fallback:string)=>{
    const raw=String(value??'');
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw)?raw:fallback;
  };
  const dayStart=hhmm(rawPlanning.dayStart,'09:00');
  const dayEnd=hhmm(rawPlanning.dayEnd,'17:00');
  if(firstCoachingDate<departDate||lastCoachingDate>returnDate||firstCoachingDate>lastCoachingDate)
    return {ok:false as const,message:'Coaching days must fall within your travel dates.'};
  if(dayEnd<=dayStart)return {ok:false as const,message:'Coaching workday end must follow start.'};
  const planning={
    firstCoachingDate,lastCoachingDate,dayStart,dayEnd,
    sessionMinutes:boundedNumber(rawPlanning.sessionMinutes??150,30,480),
    breakMinutes:boundedNumber(rawPlanning.breakMinutes??30,0,180),
    includeWeekends:!!rawPlanning.includeWeekends,
    arrivalToCoachingBufferMinutes:boundedNumber(rawPlanning.arrivalToCoachingBufferMinutes??30,0,240)
  };
  return {ok:true as const,fields:{
    title,trainer:strField(b,'trainer',100),departDate,returnDate,destination,
    managerIds:managers,origins,selectedArrival,notes:strField(b,'notes',1500),quotes,planning
  }};
}


type SharedLink = { id:string; workspaceId:string; actorId:string; createdAt:string; seat?:'trainer_a'|'trainer_b' };
type TrainerLink = { id:string;seat:'trainer_a'|'trainer_b';actorId:string;createdAt:string;
  status:'active'|'revoked'|'system';revokedAt?:string };
const trainerLinksTable=(workspaceId:string)=>
  'atlas_trainer_links_'+workspaceId.replace(/[^A-Za-z0-9_-]/g,'').slice(0,85);
const guestLinkTable='atlas_guest_links';
async function workspaceAccess(ctx:{
  query:Record<string,string>;
  user?:{userId:string;email?:string;name?:string;scope:string};
}){
  const key=String(ctx.query?.workspaceKey||'').trim();
  if(!/^[0-9a-f]{64}$/i.test(key))return error('A valid shared workspace link is required.',403);
  const digest=createHash('sha256').update(key).digest('hex');
  const [link]=await db.get<SharedLink>(guestLinkTable,[digest],{consistent:true});
  if(!link||!link.actorId||!link.workspaceId)return error('Shared workspace link is invalid.',403);
  // A trainer invitation binds its seat on the server. Clients cannot spoof attribution via query strings.
  if(link.seat==='trainer_a'||link.seat==='trainer_b')ctx.query.trainerId=link.seat;
  ctx.user={userId:link.actorId,name:'Shared workspace editor',
    scope:link.seat?'workspace:edit trainer:'+link.seat:'workspace:owner'};
  return;
}

type TrainerProfileRecord={
  id:'trainer_a'|'trainer_b'; name:string; homeCity:string; homeAirports:string[];
  homeDriveMinutes:Record<string,number>; preferredAirlines:string; preferNonstop:boolean;
  maxConnections:number; notes:string; updatedAt?:string;
};
const trainerSlots=['trainer_a','trainer_b'] as const;
const defaultTrainer=(slot:'trainer_a'|'trainer_b'):TrainerProfileRecord=>({
  id:slot,name:slot==='trainer_a'?'Trainer 1':'Trainer 2',
  homeCity:'',homeAirports:[],homeDriveMinutes:{},preferredAirlines:'',
  preferNonstop:true,maxConnections:1,notes:''
});
async function trainerProfilesFor(workspaceId:string):Promise<TrainerProfileRecord[]>{
  const records=await db.get<TrainerProfileRecord>(extraTables(workspaceId).trainerProfiles,[...trainerSlots],{consistent:true});
  return trainerSlots.map((slot,i)=>records[i]?{...defaultTrainer(slot),...records[i]!,id:slot}:defaultTrainer(slot));
}
function validTrainerBody(value:unknown,slot:'trainer_a'|'trainer_b'):TrainerProfileRecord|null{
  const b=bodyOf(value),name=strField(b,'name',80).trim(),homeCity=strField(b,'homeCity',100);
  if(name.length<2)return null;
  const raw=Array.isArray(b.homeAirports)?b.homeAirports:[];
  const homeAirports=[...new Set(raw.map(x=>String(x).trim().toUpperCase()).filter(x=>/^[A-Z]{3}$/.test(x)))].slice(0,6);
  const source=bodyOf(b.homeDriveMinutes);
  const homeDriveMinutes:Record<string,number>={};
  for(const code of homeAirports)homeDriveMinutes[code]=Math.min(300,Math.max(0,Number.isFinite(Number(source[code]))?Math.round(Number(source[code])):60));
  return {
    id:slot,name,homeCity,homeAirports,homeDriveMinutes,
    preferredAirlines:strField(b,'preferredAirlines',160),
    preferNonstop:b.preferNonstop!==false,
    maxConnections:Math.min(3,Math.max(0,Math.floor(Number(b.maxConnections)||0))),
    notes:strField(b,'notes',350)
  };
}


async function hasDuplicateVisit(workspaceId:string,managerId:string,date:string,exceptId:string=''){
  const listed=await pageAll<Visit>(tables(workspaceId).visits,200,12);
  if(listed.truncated)throw new Error('Visit records exceed the duplicate-check range.');
  return listed.items.some(v=>v.id!==exceptId&&v.managerId===managerId&&v.date===date&&v.status!=='Canceled');
}
async function hasOverlappingTrainerTrip(workspaceId:string,trainer:string,start:string,end:string,exceptId:string=''){
  if(!trainer)return false;
  const listed=await pageAll<Trip>(extraTables(workspaceId).trips,200,12);
  if(listed.truncated)throw new Error('Trip records exceed the overlap-check range.');
  return listed.items.some(t=>t.id!==exceptId&&t.status==='Planned'&&t.trainer===trainer&&t.startDate<=end&&t.endDate>=start);
}
/* Hard unavailable and personal-time blocks are explicit constraints.
   Travel holds are advisory, since they may refer to the trip being scheduled. */
async function conflictingTrainerBlock(workspaceId:string,trainer:string,start:string,end:string){
  if(!trainer.trim())return null;
  const profiles=await trainerProfilesFor(workspaceId);
  const owner=profiles.find(p=>p.name.trim().toLowerCase()===trainer.trim().toLowerCase());
  if(!owner)return null;
  const blocks=await pageAll<AvailabilityBlock>(extraTables(workspaceId).trainerAvailability,100,20);
  if(blocks.truncated)throw new Error('Availability records exceed the safe conflict-check range.');
  return blocks.items.find(block=>block.trainerId===owner.id&&
    block.reason!=='Travel hold'&&block.startDate<=end&&block.endDate>=start)||null;
}


type DuffelSegment = {departing_at?:string;arriving_at?:string;duration?:string;
  origin?:{iata_code?:string;name?:string};destination?:{iata_code?:string;name?:string};
  operating_carrier?:{name?:string;iata_code?:string};marketing_carrier?:{name?:string}};
type DuffelSlice = {segments?:DuffelSegment[];duration?:string};
function flightDuration(value:unknown):number{
  const s=String(value||'');
  const x=/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?/i.exec(s);
  if(!x)return 0;
  return (Number(x[1]||0)*60+Number(x[2]||0));
}
function mapDuffelOffer(value:unknown){
  const data=bodyOf(value);
  const slices=Array.isArray(data.slices)?data.slices.map(v=>bodyOf(v)):[];
  const legs=slices.map((slice)=>{
    const segments=Array.isArray(slice.segments)?slice.segments.map(x=>bodyOf(x)):[];
    const first=segments[0]||{},last=segments[segments.length-1]||{};
    const firstCarrier=bodyOf(first.operating_carrier);
    const duration=flightDuration(slice.duration) || segments.reduce((sum,seg)=>sum+flightDuration(seg.duration),0);
    return {
      from:strField(bodyOf(first.origin),'iata_code',3),
      to:strField(bodyOf(last.destination),'iata_code',3),
      depart:strField(first,'departing_at',40),
      arrive:strField(last,'arriving_at',40),
      durationMinutes:duration,connections:Math.max(0,segments.length-1),
      operatingCarriers:[...new Set(segments.map(seg=>strField(bodyOf(seg.operating_carrier),'name',100)).filter(Boolean))],
      mainCarrier:strField(firstCarrier,'name',100)||'Airline not provided'
    };
  });
  const amount=Number(data.total_amount);
  if(legs.length<1||!Number.isFinite(amount)||amount<=0)return null;
  return {
    id:strField(data,'id',90),
    totalAmount:amount,
    currency:strField(data,'total_currency',3),
    expiresAt:strField(data,'expires_at',50),
    outbound:legs[0],
    inbound:legs[1]||null,
    connections:legs.reduce((sum,leg)=>sum+leg.connections,0),
  };
}

type PublicSourceProbe={
  id:string;label:string;available:boolean;details:string;checkedAt:string;
  scope:string;lastSuccessAt?:string|null
};
type PublicSourceReport={
  id:string;checkedAt:string;sources:PublicSourceProbe[];
  missingIntegrations:string[];scope:string
};
const publicSourceTable='atlas_public_source_health';
const sourceGaps=()=>[
  publicRoutingStatus().configured ? 'Live traffic ETA and route-wide closure coverage' : 'Configured road-network routing and live traffic ETA',
  'Live flight-specific status and airfare inventory',
  'Two-way Outlook and Google Calendar authorization',
  'Individually authenticated trainer access'
];
async function latestSourceReport():Promise<PublicSourceReport|null>{
  const [record]=await db.get<PublicSourceReport>(publicSourceTable,['current'],{consistent:true});
  return record||null;
}
async function checkOfficialSources():Promise<PublicSourceReport>{
  const checkedAt=new Date().toISOString();
  const [directory, census, us, ca, flightArchive, checkpointArchive, routingProbe] = await Promise.all([
    curatedAirportDirectory(), searchCensusZctas('32').catch(() => ({ available: false, indexedCount: 0, checkedAt })),
    publicAirportEvidence({ iata: 'MCO', icao: 'KMCO', country: 'US', lat: 28.429, lon: -81.309 }),
    publicAirportEvidence({ iata: 'YYZ', icao: 'CYYZ', country: 'CA', lat: 43.676, lon: -79.629 }),
    flightHistory({ origin: 'MCO', destination: 'ATL', connection: '', alternate: '', carrier: '', flightNumber: '', selectedMonth: '' }),
    securityHistory('MCO', checkedAt.slice(0, 10), 10),
    roadMatrix([{ id: 'airport', name: 'Orlando airport', lat: 28.4294, lon: -81.309 }, { id: 'city', name: 'Orlando city', lat: 28.5383, lon: -81.3792 }]).catch(() => null),
  ]);
  const previous = await latestSourceReport();
  const history = historyCoverage();
  const sources: PublicSourceProbe[] = [
    { id: 'airports', label: 'OurAirports reference', available: directory.available && !directory.stale,
      checkedAt: directory.checkedAt || checkedAt, details: directory.message, scope: directory.limitation },
    { id: 'census', label: 'Census ZCTAs', available: census.available, checkedAt: census.checkedAt,
      details: census.available ? census.indexedCount + ' ZCTAs indexed' : 'Census sample unavailable or failed archive validation.', scope: 'Census geography, not USPS delivery ZIPs.' },
    ...[...us, ...ca].map(row => ({ id: row.evidence.provider + ':' + row.evidence.subject,
      label: row.evidence.provider + ' · ' + row.evidence.subject, available: row.evidence.state === 'current',
      checkedAt: row.evidence.retrievedAt, details: row.evidence.state + ': ' + row.evidence.limitation,
      scope: row.evidence.scope, evidence: row.evidence })),
    ...flightArchive.sources.map(row => ({ id: 'flyerintel:' + row.name, label: 'Flyerintel ' + row.name,
      available: row.available, checkedAt: flightArchive.checkedAt,
      details: row.records + ' aggregate records; coverage ends ' + (row.periodEnd || 'unknown'),
      scope: 'Independent historical aggregates, not a direct BTS import, live flight status or a prediction. Source issue time may be unknown.' })),
    { id: 'checkpoint-history', label: 'Open checkpoint history sample', available: checkpointArchive.available && !checkpointArchive.message,
      checkedAt: checkpointArchive.checkedAt, details: checkpointArchive.rows.length + ' historical queue groups. ' + checkpointArchive.message,
      scope: checkpointArchive.limitations.join(' ') },
    { id: 'routing', label: 'Road routing', available: !!routingProbe?.roadBased && routingProbe.evidence.state === 'current' && routingProbe.durations[0][1] !== null, checkedAt,
      details: routingProbe?.evidence.limitation || 'The configured road probe could not complete.', scope: 'Orlando airport to city reference probe only. Does not validate all regional routes or live traffic.' },
    { id: 'bts', label: 'Official BTS history', available: history.state === 'historical', checkedAt,
      details: history.periods.map(row => row.period).join(', ') || 'No imported periods', scope: history.limitation },
  ];
  return { id: 'current', checkedAt, sources: sources.map(row => ({ ...row,
    lastSuccessAt: row.available ? row.checkedAt : previous?.sources.find(old => old.id === row.id)?.lastSuccessAt || null })),
    missingIntegrations: sourceGaps(),
    scope: 'Official U.S. and Canadian sample checks with source timestamps. A sample does not establish national coverage or flight-specific status.' };
}
async function saveSourceReport(snapshot:PublicSourceReport){
  const prior=await latestSourceReport();
  if(prior){
    const [updated]=await db.tx.update(publicSourceTable,[{
      id:'current',record:{checkedAt:snapshot.checkedAt,sources:snapshot.sources,
        missingIntegrations:snapshot.missingIntegrations,scope:snapshot.scope}
    }],{patch:true});
    if(!updated)throw Error('Public source report was not updated.');
  }else{
    const [created]=await db.tx.add(publicSourceTable,[snapshot]);
    if(!created){
      const [saved]=await db.tx.update(publicSourceTable,[{
        id:'current',record:{checkedAt:snapshot.checkedAt,sources:snapshot.sources,
          missingIntegrations:snapshot.missingIntegrations,scope:snapshot.scope}
      }],{patch:true});
      if(!saved)throw Error('Public source report could not be persisted.');
    }
  }
}
export const refreshPublicSourceStatus=async (_event:{
  type:'cron';name:string;scheduledTime:string;invokedTime:string
})=>{
  const report=await checkOfficialSources();
  await saveSourceReport(report);
  return {statusCode:200};
};

async function travelBoard(workspaceId:string):Promise<ScenarioBoard>{
  const revision=await db.workspaceRevision(workspaceId);
  const t=tables(workspaceId),x=extraTables(workspaceId);
  const [managers,assignments,visits,coaching,trips,availability,trainerProfiles]=await Promise.all([
    pageAll(t.managers),pageAll(t.assignments),pageAll(t.visits),pageAll(x.coaching),pageAll(x.trips),pageAll(x.trainerAvailability),trainerProfilesFor(workspaceId)
  ]);
  return {revision,managers:managers.items,assignments:assignments.items,visits:visits.items,coaching:coaching.items,trips:trips.items,
    availability:availability.items,trainerProfiles,truncated:[managers,assignments,visits,coaching,trips,availability].some(result=>result.truncated)} as unknown as ScenarioBoard;
}
export const handler = router({
  ...makeTravelRoutes({workspaceAccess,member,load:travelBoard,tables,extraTables,activityLog}),
  ...makeRestoreRoutes({workspaceAccess,member,tables,extraTables}),

  'GET /api/_healthcheck': [async () => {
    try { await db.get('atlas_health_probe', ['ready']); return json({ status: 'ready' }); }
    catch { return json({ status: 'not-ready', limitation: 'The configured record store is not responding.' }, 503); }
  }],
  'POST /api/demo/create': [createDemoWorkspace],
  'POST /api/guest/create': [async () => {
    // A workspace is usable only when all three records commit together.
    const workspaceKey=randomUUID().replace(/-/g,'')+randomUUID().replace(/-/g,'');
    const workspaceId='team_'+randomUUID().replace(/-/g,'');
    const actorId='guest_'+randomUUID().replace(/-/g,'');
    const id=createHash('sha256').update(workspaceKey).digest('hex');
    try{
      await db.transact([
        db.tx.add('atlas_teams',[{id:workspaceId,ownerId:actorId,name:'Shared Field Sales Atlas'}]),
        db.tx.add('atlas_members',[{id:actorId,workspaceId,role:'owner'}]),
        db.tx.add(guestLinkTable,[{id,workspaceId,actorId,createdAt:new Date().toISOString()}])
      ]);
    }catch{
      // Unknown database outcomes may already have committed; reconcile before returning a secret.
      const [[link],[team],[membership]]=await Promise.all([
        db.get<SharedLink>(guestLinkTable,[id],{consistent:true}),
        db.get<Team>('atlas_teams',[workspaceId],{consistent:true}),
        db.get<Member>('atlas_members',[actorId],{consistent:true})
      ]);
      if(link?.actorId!==actorId||link.workspaceId!==workspaceId||
         team?.ownerId!==actorId||membership?.workspaceId!==workspaceId)
        return error('New workspace could not be fully confirmed. No incomplete link was issued.',409);
    }
    return json({workspaceKey},201);
  }],
  'POST /api/subscriptions': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);
    if(!m)return error('Workspace required.',403);
    const b=bodyOf(ctx.body);
    if(b.entity_type!=='workspace'||b.entity_id!==m.workspaceId)return error('Unsupported subscription.',400);
    const connectionId=strField(b,'connection_id',160);
    if(!/^[A-Za-z0-9_:.=-]{8,160}$/.test(connectionId))return error('Invalid live connection.',400);
    const id=createHash('sha256').update(connectionId).digest('hex');
    const table=liveTable(m.workspaceId);
    const key=String(ctx.query.workspaceKey||'');
    const linkId=createHash('sha256').update(key).digest('hex');
    const record={id,connectionId,trainer:trainerActor(ctx.query,ctx.user!.userId),
      actorId:ctx.user!.userId,linkId,expiresAt:new Date(Date.now()+8*3600000).toISOString()};
    const [prior]=await db.get<LiveSubscriber>(table,[id],{consistent:true});
    if(prior)await db.tx.update(table,[{id,record}],{patch:true});
    else{
      const [added]=await db.tx.add(table,[record]);
      if(!added)await db.tx.update(table,[{id,record}],{patch:true});
    }
    return json({ok:true,entity_type:'workspace',entity_id:m.workspaceId});
  }],
  'POST /api/subscriptions/remove': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);
    if(!m)return error('Workspace required.',403);
    const b=bodyOf(ctx.body);
    if(b.entity_type!=='workspace'||b.entity_id!==m.workspaceId)return error('Unsupported subscription.',400);
    const connectionId=strField(b,'connection_id',160);
    if(!/^[A-Za-z0-9_:.=-]{8,160}$/.test(connectionId))return error('Invalid live connection.',400);
    const id=createHash('sha256').update(connectionId).digest('hex');
    const table=liveTable(m.workspaceId);
    const [registered]=await db.get<LiveSubscriber>(table,[id],{consistent:true});
    if(registered&&registered.actorId!==ctx.user!.userId&&m.role!=='owner')
      return error('This connection belongs to another trainer access link.',403);
    if(registered)await db.tx.delete(table,[id]);
    return json({ok:true});
  }],

  /* Individual no-login trainer access. Owner capability is never silently rotated. */
  'GET /api/workspace/trainer-links': [workspaceAccess,async ctx=>{
    const owner=await member(ctx.user!.userId);
    if(!owner||owner.role!=='owner')return error('Only owners may manage trainer links.',403);
    const result=await pageAll<TrainerLink>(trainerLinksTable(owner.workspaceId),100,8);
    if(result.truncated)return error('Invitation metadata exceeds the inspection limit.',409);
    return json({links:result.items.filter(l=>l.status==='active'||l.status==='revoked')
      .map(l=>({id:l.id,seat:l.seat,status:l.status,createdAt:l.createdAt,revokedAt:l.revokedAt||null}))
      .sort((a,b)=>b.createdAt.localeCompare(a.createdAt))});
  }],
  'POST /api/workspace/trainer-links': [workspaceAccess,async ctx=>{
    const owner=await member(ctx.user!.userId);
    if(!owner||owner.role!=='owner')return error('Only owners may issue trainer links.',403);
    const seat=String(bodyOf(ctx.body).seat||'');
    if(seat!=='trainer_a'&&seat!=='trainer_b')return error('Choose a trainer seat.',400);
    const table=trainerLinksTable(owner.workspaceId);
    // First write creates this tenant-local table outside the cross-table transaction.
    await db.tx.add(table,[{id:'system',seat:'trainer_a',actorId:'',status:'system',
      createdAt:new Date().toISOString()}]);
    const workspaceKey=randomUUID().replace(/-/g,'')+randomUUID().replace(/-/g,'');
    const digest=createHash('sha256').update(workspaceKey).digest('hex');
    const actorId='guest_'+randomUUID().replace(/-/g,'');
    const createdAt=new Date().toISOString();
    const shared:SharedLink={id:digest,workspaceId:owner.workspaceId,actorId,createdAt,
      seat:seat as 'trainer_a'|'trainer_b'};
    const metadata:TrainerLink={id:digest,actorId,seat:shared.seat!,createdAt,status:'active'};
    try{
      await db.transact([
        db.tx.add('atlas_members',[{id:actorId,workspaceId:owner.workspaceId,role:'member'}]),
        db.tx.add(guestLinkTable,[shared]),
        db.tx.add(table,[metadata])
      ]);
    }catch{
      const [found]=await db.get<SharedLink>(guestLinkTable,[digest],{consistent:true});
      if(found?.actorId!==actorId||found.workspaceId!==owner.workspaceId)
        return error('Invitation could not be confirmed. No replacement key was issued.',409);
    }
    await activityLog(owner.workspaceId,ctx.user!.userId,'created','trainer invitation',
      shared.seat==='trainer_a'?'Trainer 1':'Trainer 2');
    return json({workspaceKey,linkId:digest,seat,shownOnce:true},201);
  }],
  'DELETE /api/workspace/trainer-links/:id': [workspaceAccess,async ctx=>{
    const owner=await member(ctx.user!.userId);
    if(!owner||owner.role!=='owner')return error('Only owners may revoke trainer links.',403);
    const digest=String(ctx.params.id||'').toLowerCase();
    if(!/^[0-9a-f]{64}$/.test(digest))return error('Invalid trainer link.',400);
    const table=trainerLinksTable(owner.workspaceId);
    const [metadata]=await db.get<TrainerLink>(table,[digest],{consistent:true});
    if(!metadata)return error('Invitation not found.',404);
    if(metadata.status==='revoked')return json({ok:true,replayed:true});
    if(metadata.status!=='active')return error('Only active invitations can be revoked.',409);
    try{
      await db.transact([
        db.tx.delete(guestLinkTable,[digest]),
        db.tx.update(table,[{id:digest,record:{status:'revoked',revokedAt:new Date().toISOString()},
          if:{status:'active'}}],{patch:true})
      ]);
    }catch{
      const [[after],[active]]=await Promise.all([
        db.get<TrainerLink>(table,[digest],{consistent:true}),
        db.get<SharedLink>(guestLinkTable,[digest],{consistent:true})
      ]);
      if(after?.status!=='revoked'||active)return error('Revocation not confirmed. Check current invitation status.',409);
    }
    // Remove matching server-side live subscriptions; delivery also independently
    // revalidates the capability to prevent a race with revocation.
    try{
      const live=await db.list<LiveSubscriber>(liveTable(owner.workspaceId),{limit:100});
      const ids=live.items.filter(s=>s.linkId===digest).map(s=>s.id);
      if(ids.length)await db.tx.delete(liveTable(owner.workspaceId),ids);
    }catch(e){console.warn('Live subscription cleanup deferred:',
      isAppDatabaseError(e)?e.code:'unknown');}
    await activityLog(owner.workspaceId,ctx.user!.userId,'revoked','trainer invitation',
      metadata.seat==='trainer_a'?'Trainer 1':'Trainer 2');
    return json({ok:true,revoked:true});
  }],
  'GET /api/board': [
    workspaceAccess,
    async ctx => json(await boardFor(ctx.user!.userId)),
  ],
  // Legacy account-based team creation and invitations are disabled in link-only mode.
  'POST /api/team/create': [async () => error('Use the shareable workspace link instead of accounts.',410)],
  'POST /api/team/invite': [async () => error('Sign-in invitations are disabled. Share the workspace URL instead.',410)],
  'POST /api/team/join': [async () => error('Account-based invitations are disabled. Share the workspace URL instead.',410)],
    'POST /api/managers': [
    workspaceAccess,
    async ctx => {
      const m = await member(ctx.user!.userId);
      if (!m) return error('Create or join a team first.', 403);
      const b = bodyOf(ctx.body);
      const name = str(b, 'name', 100);
      if (!name) return error('Manager name is required.', 400);
      const hasCoordinates = b.lat !== undefined && b.lon !== undefined
        && b.lat !== null && b.lon !== null
        && Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lon))
        && Math.abs(Number(b.lat)) <= 90 && Math.abs(Number(b.lon)) <= 180;
      if ((b.lat !== undefined || b.lon !== undefined) && !hasCoordinates)
        return error('Both latitude and longitude must be valid coordinates.', 400);
      const record = {
        id: randomUUID(),
        name,
        email: str(b, 'email', 140),
        phone: str(b, 'phone', 35),
        homeAirport: str(b, 'homeAirport', 4).toUpperCase(),
        trainer: str(b, 'trainer', 100),
        cadence: str(b, 'cadence', 35) || 'Monthly',
        focus: str(b, 'focus', 1400),
        updatedAt:new Date().toISOString(),
        coachingStatus: str(b, 'coachingStatus', 30) || 'On track',
        onboardingDate: normalizeDate(b.onboardingDate),
        baseCity: str(b, 'baseCity', 160),
        baseState: str(b, 'baseState', 2).toUpperCase(),
        ...(hasCoordinates ? { lat: Number(b.lat), lon: Number(b.lon) } : {}),
      };
      const [created] = await db.tx.add(tables(m.workspaceId).managers, [
        record,
      ]);
      if (!created) return error('Manager could not be saved.', 409);
      await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'created','manager',name);
      return json({ manager: record }, 201);
    },
  ],
  'PUT /api/managers/:id': [
    workspaceAccess,
    async ctx => {
      const m = await member(ctx.user!.userId);
      if (!m) return error('Team required.', 403);
      const table = tables(m.workspaceId).managers;
      const [existing] = await db.get<Manager>(table, [ctx.params.id], {
        consistent: true,
      });
      if (!existing) return error('Manager not found.', 404);
      const b = bodyOf(ctx.body);
      const expectedUpdatedAt=str(b,'expectedUpdatedAt',40);
      if(expectedUpdatedAt&&existing.updatedAt&&expectedUpdatedAt!==existing.updatedAt)
        return error('Another trainer changed this manager. Refresh before saving.',409);
      const name = str(b, 'name', 100);
      if (!name) return error('Manager name is required.', 400);
      const hasCoordinates = b.lat !== undefined && b.lon !== undefined
        && b.lat !== null && b.lon !== null
        && Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lon))
        && Math.abs(Number(b.lat)) <= 90 && Math.abs(Number(b.lon)) <= 180;
      if ((b.lat !== undefined || b.lon !== undefined) && !hasCoordinates)
        return error('Both latitude and longitude must be valid coordinates.', 400);
      const [updated] = await db.tx.update(
        table,
        [
          {
            id: ctx.params.id,
            ...(expectedUpdatedAt&&existing.updatedAt?{if:{updatedAt:expectedUpdatedAt}}:{}),
            record: {
              name,
              email: str(b, 'email', 140),
              phone: str(b, 'phone', 35),
              homeAirport: str(b, 'homeAirport', 4).toUpperCase(),
              trainer: str(b, 'trainer', 100),
              cadence: str(b, 'cadence', 35),
              focus: str(b, 'focus', 1400),
              updatedAt:new Date().toISOString(),
              coachingStatus: str(b, 'coachingStatus', 30) || 'On track',
              onboardingDate: normalizeDate(b.onboardingDate),
              baseCity: str(b, 'baseCity', 160),
              baseState: str(b, 'baseState', 2).toUpperCase(),
              lat: hasCoordinates ? Number(b.lat) : undefined,
              lon: hasCoordinates ? Number(b.lon) : undefined,
            },
          },
        ],
        { patch: true }
      );
      if (updated) await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'updated','manager',name);
      return updated
        ? json({ ok: true })
        : error('Manager could not be updated.', 409);
    },
  ],
  'DELETE /api/managers/:id': [
    workspaceAccess,
    async ctx => {
      const m=await member(ctx.user!.userId);
      if(!m)return error('Team required.',403);
      const t=tables(m.workspaceId),x=extraTables(m.workspaceId);
      const [existing]=await db.get<Manager>(t.managers,[ctx.params.id],{consistent:true});
      if(!existing)return error('Manager not found.',404);
      // Never cascade through actual visits, coaching history or travel plans.
      // The UI may offer archiving later, but deletion cannot quietly orphan records.
      const [assignments,visits,coaching,trips,plans]=await Promise.all([
        pageAll<Assignment>(t.assignments,200,20),
        pageAll<Visit>(t.visits,200,20),
        pageAll<CoachingNote>(x.coaching,200,20),
        pageAll<Trip>(x.trips,200,20),
        pageAll<TravelPlanServer>(x.travelPlans,100,40)
      ]);
      if([assignments,visits,coaching,trips,plans].some(result=>result.truncated))
        return error('Deletion cannot proceed until all related records can be checked safely.',409);
      const countVisits=visits.items.filter(v=>v.managerId===ctx.params.id).length;
      const countCoaching=coaching.items.filter(c=>c.managerId===ctx.params.id).length;
      const countTrips=trips.items.filter(trip=>trip.stops?.some(s=>s.managerId===ctx.params.id)).length;
      const countPlans=plans.items.filter(plan=>plan.managerIds?.includes(ctx.params.id)).length;
      if(countVisits||countCoaching||countTrips||countPlans)
        return error('Manager has '+countVisits+' visits, '+countCoaching+' coaching records, '+
          countTrips+' trips and '+countPlans+' travel plans. Reassign or preserve those records before deleting. No records changed.',409);
      const related=assignments.items.filter(a=>a.managerId===ctx.params.id).map(a=>a.id);
      try{
        await db.transact([
          ...(related.length?[db.tx.delete(t.assignments,related)]:[]),
          db.tx.delete(t.managers,[ctx.params.id])
        ]);
      }catch(e){
        if(isAppDatabaseError(e)&&e.code==='AppDatabaseQuotaExceeded')throw e;
        return error('Could not safely delete manager and assignments together. Refresh and retry.',409);
      }
      await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'deleted','manager',existing.name);
      return json({ok:true,removedAssignments:related.length});
    },
  ],
  'POST /api/assignments': [
    workspaceAccess,
    async ctx => {
      const m = await member(ctx.user!.userId);
      if (!m) return error('Team required.', 403);
      const b = bodyOf(ctx.body);
      const t = tables(m.workspaceId);
      const managerId = str(b, 'managerId', 90);
      const stateCode = str(b, 'stateCode', 2).toUpperCase();
      const areaType = str(b, 'areaType', 10);
      const areaCode = str(b, 'areaCode', 20);
      const areaName = str(b, 'areaName', 120);
      const role = str(b, 'role', 14);
      if (
        !validStates.has(stateCode) ||
        !['state', 'county', 'place', 'zip'].includes(areaType) ||
        !areaCode ||
        !areaName ||
        !['Primary', 'Shared', 'Support'].includes(role)
      )
        return error('Invalid coverage area.', 400);
      if (areaType === 'state' && areaCode !== stateCode)
        return error('State scope mismatch.', 400);
      if (areaType === 'zip' && !/^\d{5}$/.test(areaCode))
        return error('ZIP assignments require five digits.', 400);
      if (['county', 'place'].includes(areaType) && !geoStateFips[stateCode]) return error('County and Census-place assignments are currently U.S. only.',400);
      if (['county', 'place'].includes(areaType) && !areaCode.startsWith(geoStateFips[stateCode]))
        return error('Geographic area does not belong to the selected state.', 400);
      const [person] = await db.get<Manager>(t.managers, [managerId], {
        consistent: true,
      });
      if (!person) return error('Select an existing territory manager.', 400);
      const existingScopes=await pageAll<Assignment>(t.assignments,200,20);
      if(existingScopes.truncated)
        return error('Territory reconciliation is incomplete. No assignment was written.',409);
      if(existingScopes.items.some(a=>a.managerId===managerId&&a.stateCode===stateCode&&
        a.areaType===areaType&&a.areaCode===areaCode))
        return error('This manager already has a territory assignment for that area. Review the existing record.',409);
      const record = {
        id: randomUUID(),
        managerId,
        stateCode,
        areaType,
        areaCode,
        areaName,
        role,
      };
      const [created] = await db.tx.add(t.assignments, [record]);
      if(created)await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),
        'created','assignment',person.name+' · '+areaName);
      return created
        ? json({ assignment: record }, 201)
        : error('Could not save territory assignment.', 409);
    },
  ],
  'DELETE /api/assignments/:id': [
    workspaceAccess,
    async ctx => {
      const m = await member(ctx.user!.userId);
      if (!m) return error('Team required.', 403);
      const [deleted] = await db.delete(tables(m.workspaceId).assignments, [
        ctx.params.id,
      ]);
      if(deleted)await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'deleted','assignment',ctx.params.id);
      return deleted ? json({ ok: true }) : error('Assignment not found.', 404);
    },
  ],
  'POST /api/visits': [
    workspaceAccess,
    async ctx => {
      const m = await member(ctx.user!.userId);
      if (!m) return error('Team required.', 403);
      const revision=await db.workspaceRevision(m.workspaceId);
      const b = bodyOf(ctx.body);
      const t = tables(m.workspaceId);
      const managerId = str(b, 'managerId', 90);
      const date = normalizeDate(b.date);
      const stateCode = str(b, 'stateCode', 2).toUpperCase();
      if (!date || !validStates.has(stateCode))
        return error('A valid visit date and state are required.', 400);
      const [person] = await db.get<Manager>(t.managers, [managerId], {
        consistent: true,
      });
      if (!person) return error('Select a valid manager.', 400);
      if(str(b,'status',25)!=='Canceled'&&await hasDuplicateVisit(m.workspaceId,managerId,date))
        return error('This manager already has a coaching visit on this date. Edit the existing visit instead.',409);
      const requestedStatus=str(b,'status',25)||'Planned';
      if(requestedStatus==='Planned'||requestedStatus==='Rescheduled'){
        const blocked=await conflictingTrainerBlock(m.workspaceId,str(b,'trainer',100),date,date);
        if(blocked)return error('This trainer is marked '+blocked.reason.toLowerCase()+
          ' on '+date+'. Change the visit date or update their shared calendar block.',409);
      }
      const record = {
        id: randomUUID(),
        managerId,
        stateCode,
        date,
        airport: str(b, 'airport', 5).toUpperCase(),
        objective: str(b, 'objective', 900),
        trainer: str(b, 'trainer', 100),
        location: str(b, 'location', 180),
        outcome: str(b, 'outcome', 1800),
        status: ['Planned', 'Completed', 'Rescheduled', 'Canceled'].includes(str(b, 'status', 25)) ? str(b, 'status', 25) : 'Planned',
        updatedAt: new Date().toISOString(),
      };
      const [[created]] = await db.transact([db.tx.add(t.visits, [record])],guardRevision(m.workspaceId,revision));
      if(created)await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'created','visit',record.date+' · '+person.name);
      return created
        ? json({ visit: record }, 201)
        : error('Visit could not be saved.', 409);
    },
  ],
  'DELETE /api/visits/:id': [
    workspaceAccess,
    async ctx => {
      const m = await member(ctx.user!.userId);
      if (!m) return error('Team required.', 403);
      const [visit]=await db.get<Visit>(tables(m.workspaceId).visits,[ctx.params.id],{consistent:true});
      if(!visit)return error('Visit not found.',404);
      if(visit.tripId)
        return error('This coaching visit belongs to a saved trip. Update or cancel it through the itinerary to preserve schedule consistency.',409);
      const [deleted] = await db.tx.delete(tables(m.workspaceId).visits,[ctx.params.id]);
      if(deleted)await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'deleted','visit',ctx.params.id);
      return deleted ? json({ ok: true }) : error('Visit not found.', 404);
    },
  ],

  'GET /api/locations/zcta': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);
    if(!m)return error('Workspace required.',403);
    const prefix=String(ctx.query?.prefix||'').trim();
    if(!/^\d{2,5}$/.test(prefix))
      return error('Enter two to five ZCTA digits.',400);
    try{return json(await searchCensusZctas(prefix));}
    catch{return json({available:false,prefix,results:[],indexedCount:0,
      source:'U.S. Census Gazetteer',sourceYear:2026,
      message:'Official Census ZCTA index unavailable. Saved ZIP assignments remain intact.'});}
  }],
  'GET /api/locations/zcta/:code': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);
    if(!m)return error('Workspace required.',403);
    const code=String(ctx.params.code||'').trim();
    if(!/^\d{5}$/.test(code))return error('Enter a five-digit Census ZCTA.',400);
    try{return json(await resolveCensusZcta(code));}
    catch{return error('Census ZCTA lookup temporarily unavailable.',503);}
  }],

  'GET /api/geography/:state': [async ctx => {
    const state = safe(ctx.params.state, 2).toUpperCase();
    if (!validStates.has(state)) return error('Unknown state code.', 400);
    if(!geoStateFips[state])
      return json({state,counties:[],places:[],incomplete:true,supported:false,
        source:'U.S. Census Gazetteer',sourceDate:'2026',
        message:'U.S. Census county and place directories do not cover Canadian provinces. Canadian airports and selected cities remain available.'});
    const [a, b] = await Promise.allSettled([censusAreas(state, 'counties'), censusAreas(state, 'place')]);
    if (a.status === 'rejected' && b.status === 'rejected') return error('Census geography source temporarily unavailable.', 503);
    return json({
      state, counties: a.status === 'fulfilled' ? a.value : [],
      places: b.status === 'fulfilled' ? b.value : [],
      source: 'U.S. Census Bureau Gazetteer 2026',
      sourceDate: '2026', incomplete: a.status !== 'fulfilled' || b.status !== 'fulfilled',
    });
  }],
  'GET /api/airports/curated': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);
    if(!m)return error('Shared workspace required.',403);
    const result=await curatedAirportDirectory();
    return result.available?json(result):error(result.message,503);
  }],
  'GET /api/operations': [workspaceAccess, async ctx => {
    const m = await member(ctx.user!.userId);
    if (!m) return json({ needsTeam: true });
    const revision = await db.workspaceRevision(m.workspaceId);
    const t = tables(m.workspaceId);
    const x = extraTables(m.workspaceId);
    const [team, managers, assignments, visits, coaching, trips, activity,trainerProfiles,availability] = await Promise.all([
      getTeam(m), pageAll<Manager>(t.managers), pageAll<Assignment>(t.assignments),
      pageAll<Visit>(t.visits), pageAll<CoachingNote>(x.coaching),
      pageAll<Trip>(x.trips), pageAll<Activity>(x.activity, 100, 5),trainerProfilesFor(m.workspaceId),
      pageAll<AvailabilityBlock>(x.trainerAvailability,100,5),
    ]);
    // Auto-register the signed-in user in the team-local directory, without leaking membership from other teams.
    const [entry] = await db.get(x.directory, [ctx.user!.userId]);
    if (!entry) await db.tx.add(x.directory, [{
      id: ctx.user!.userId, email: ctx.user!.email || '', name: ctx.user!.name || '',
      workspaceId: m.workspaceId, role: m.role,
    }]);
    return json({
      needsTeam: false, revision,
      team: { id: m.workspaceId, name: team?.name || 'Field Training Team', role: m.role },
      accessSeat:ctx.user!.scope.includes('trainer:trainer_b')?'trainer_b':
        ctx.user!.scope.includes('trainer:trainer_a')?'trainer_a':undefined,
      managers: managers.items, assignments: assignments.items, visits: visits.items,
      coaching: coaching.items, trips: trips.items, activity: activity.items, trainerProfiles,
      availability:availability.items,
      truncated: managers.truncated || assignments.truncated || visits.truncated || coaching.truncated || trips.truncated || activity.truncated || availability.truncated,
    });
  }],

  // Observability is read-only. No customer data, names or access keys are returned.
  'GET /api/intelligence/health': [workspaceAccess,async ctx=>{
    const membership=await member(ctx.user!.userId);
    if(!membership)return error('Workspace required.',403);
    const reg=tables(membership.workspaceId),extra=extraTables(membership.workspaceId);
    const [managers,assignments,visits,coaching,trips,plans,availability]=await Promise.all([
      pageAll<Manager>(reg.managers,200,20),
      pageAll<Assignment>(reg.assignments,200,20),
      pageAll<Visit>(reg.visits,200,20),
      pageAll<CoachingNote>(extra.coaching,200,20),
      pageAll<Trip>(extra.trips,200,20),
      pageAll<TravelPlanServer>(extra.travelPlans,100,40),
      pageAll<AvailabilityBlock>(extra.trainerAvailability,100,40)
    ]);
    const truncated=[managers,assignments,visits,coaching,trips,plans,availability].some(r=>r.truncated);
    const managerIds=new Set(managers.items.map(row=>row.id));
    const tripIds=new Set(trips.items.map(row=>row.id));
    const issues:Array<{code:string;severity:'critical'|'warning';count:number;message:string}>=[];
    const record=(code:string,severity:'critical'|'warning',count:number,message:string)=>{
      if(count>0)issues.push({code,severity,count,message});
    };
    record('orphan-assignments','critical',
      assignments.items.filter(row=>!managerIds.has(row.managerId)).length,
      'Territory assignments reference managers not found in this workspace.');
    record('orphan-visits','critical',
      visits.items.filter(row=>!managerIds.has(row.managerId)).length,
      'Coaching visits reference managers not found in this workspace.');
    record('orphan-coaching','critical',
      coaching.items.filter(row=>!managerIds.has(row.managerId)).length,
      'Coaching notes reference managers not found in this workspace.');
    record('orphan-trip-stops','critical',
      trips.items.reduce((sum,trip)=>sum+(trip.stops||[]).filter(stop=>!managerIds.has(stop.managerId)).length,0),
      'Trip stops reference managers not found in this workspace.');
    record('orphan-travel-plan-managers','critical',
      plans.items.reduce((sum,plan)=>sum+(plan.managerIds||[]).filter(mid=>!managerIds.has(mid)).length,0),
      'Saved travel plans reference managers not found in this workspace.');
    record('orphan-trip-links','critical',
      visits.items.filter(row=>row.tripId&&!tripIds.has(row.tripId)).length,
      'Visits are linked to itineraries that no longer exist.');
    const visitKeys=new Set<string>();let duplicateVisits=0;
    for(const visit of visits.items){
      if(visit.status==='Canceled')continue;
      const key=visit.managerId+'|'+visit.date;
      if(visitKeys.has(key))duplicateVisits++;else visitKeys.add(key);
    }
    record('duplicate-visits','warning',duplicateVisits,
      'More than one non-canceled coaching visit exists for the same manager and date.');
    const assignmentKeys=new Set<string>();let duplicateAssignments=0;
    for(const assignment of assignments.items){
      const key=[assignment.managerId,assignment.stateCode,assignment.areaType,assignment.areaCode].join('|');
      if(assignmentKeys.has(key))duplicateAssignments++;else assignmentKeys.add(key);
    }
    record('duplicate-assignments','warning',duplicateAssignments,
      'Duplicate territory assignments share the same manager and geographic scope.');
    const profiles=await trainerProfilesFor(membership.workspaceId);
    const profileByName=new Map(profiles.map(p=>[p.name.trim().toLowerCase(),p.id]));
    const blocked=(trainer:string,start:string,end:string)=>
      availability.items.some(block=>block.trainerId===profileByName.get((trainer||'').trim().toLowerCase())&&
        block.reason!=='Travel hold'&&block.startDate<=end&&block.endDate>=start);
    const conflictVisits=visits.items.filter(v=>(v.status==='Planned'||v.status==='Rescheduled')&&
      blocked(v.trainer||'',v.date,v.date)).length;
    const conflictTrips=trips.items.filter(trip=>trip.status==='Planned'&&
      blocked(trip.trainer||'',trip.startDate,trip.endDate)).length;
    record('blocked-field-commitments','warning',conflictVisits+conflictTrips,
      'Scheduled coaching or travel overlaps explicit unavailable or personal time.');
    if(truncated)record('incomplete-scan','warning',1,
      'Workspace exceeds a safe inspection range. Counts and integrity checks may be incomplete.');
    const counts={
      managers:managers.items.length,assignments:assignments.items.length,
      visits:visits.items.length,coaching:coaching.items.length,
      trips:trips.items.length,travelPlans:plans.items.length,
      availability:availability.items.length
    };
    const empty=Object.values(counts).every(n=>n===0);
    return json({
      checkedAt:new Date().toISOString(),status:truncated?'partial':
        issues.some(i=>i.severity==='critical')?'critical':issues.length?'attention':empty?'empty':'clear',
      counts,issues,truncated,scope:'Stored workspace relationships and recorded schedules only; not independent verification of source or street addresses.'
    });
  }],
  // An explicit click checks external services. No recurring paid API calls.
  'GET /api/intelligence/sources': [workspaceAccess,async ctx=>{
    const membership=await member(ctx.user!.userId);
    if(!membership)return error('Workspace required.',403);
    if(ctx.query?.check==='1'){
      const snapshot=await checkOfficialSources();
      try{await saveSourceReport(snapshot);}
      catch(e){console.warn('On-demand source snapshot persistence failed.',
        isAppDatabaseError(e)?e.code:'unavailable');}
      return json(snapshot);
    }
    const previous=await latestSourceReport();
    return json(previous ? { ...previous, missingIntegrations: sourceGaps() } : {
      id:'current',checkedAt:'',sources:[],missingIntegrations:sourceGaps(),
      scope:'No daily source scan has completed yet. Select Test sources to run a current check.'
    });
  }],
  // Shared trainer availability: explicit blocks, not invented calendar gaps.
  'POST /api/trainer-availability': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);
    if(!m)return error('Shared workspace required.',403);
    const input=bodyOf(ctx.body);
    const id=strField(input,'id',50);
    const trainerId=strField(input,'trainerId',20);
    const startDate=normalizeDate(input.startDate);
    const endDate=normalizeDate(input.endDate);
    const reason=strField(input,'reason',30);
    const notes=strField(input,'notes',180);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||
       (trainerId!=='trainer_a'&&trainerId!=='trainer_b')||
       !startDate||!endDate||startDate>endDate||
       (Date.parse(endDate+'T12:00:00Z')-Date.parse(startDate+'T12:00:00Z'))/86400000>90||
       !['Unavailable','Personal time','Travel hold'].includes(reason))
      return error('Enter a trainer, block type, and valid dates spanning no more than 90 days.',400);
    const table=extraTables(m.workspaceId).trainerAvailability;
    const record:AvailabilityBlock={id,trainerId:trainerId as AvailabilityBlock['trainerId'],
      startDate,endDate,reason:reason as AvailabilityBlock['reason'],notes,createdAt:new Date().toISOString()};
    const [added]=await db.tx.add(table,[record]);
    if(!added){
      const [existing]=await db.get<AvailabilityBlock>(table,[id],{consistent:true});
      if(!existing||existing.trainerId!==trainerId||existing.startDate!==startDate||
        existing.endDate!==endDate||existing.reason!==reason||existing.notes!==notes)
        return error('Availability request already exists or is pending. Refresh and review.',409);
      return json({block:existing,replayed:true});
    }
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'created','trainer availability',
      reason+' · '+startDate+' to '+endDate);
    return json({block:record},201);
  }],
  'DELETE /api/trainer-availability/:id': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);
    if(!m)return error('Shared workspace required.',403);
    const table=extraTables(m.workspaceId).trainerAvailability;
    const [entry]=await db.get<AvailabilityBlock>(table,[ctx.params.id],{consistent:true});
    if(!entry)return error('Availability entry not found.',404);
    const [deleted]=await db.tx.delete(table,[ctx.params.id]);
    if(!deleted)return error('Availability changed. Refresh and review.',409);
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'deleted',
      'trainer availability',entry.reason+' · '+entry.startDate);
    return json({ok:true});
  }],
  'POST /api/coaching': [workspaceAccess, async ctx => {
    const m = await member(ctx.user!.userId); if (!m) return error('Team required.', 403);
    const b = bodyOf(ctx.body);
    const managerId = strField(b,'managerId',90);
    const date = normalizeDate(b.date);
    const skill = strField(b,'skill',100);
    if (!date || !skill) return error('Coaching date and skill are required.', 400);
    const [mgr] = await db.get<Manager>(tables(m.workspaceId).managers, [managerId], { consistent: true });
    if (!mgr) return error('Territory manager not found.',404);
    const record = {
      id: randomUUID(), managerId, date, skill,
      trainer: strField(b,'trainer',100), observation: strField(b,'observation',2000),
      commitment: strField(b,'commitment',1200), dueDate: normalizeDate(b.dueDate),
      status: ['Open','Completed','Canceled'].includes(strField(b,'status',20)) ? strField(b,'status',20) : 'Open',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const [added] = await db.tx.add(extraTables(m.workspaceId).coaching, [record]);
    if (!added) return error('Could not create the coaching record.',409);
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'created','coaching',mgr.name + ' · ' + skill);
    return json({ coaching: record },201);
  }],
  'PUT /api/coaching/:id': [workspaceAccess, async ctx => {
    const m = await member(ctx.user!.userId); if (!m) return error('Team required.', 403);
    const table = extraTables(m.workspaceId).coaching;
    const [existing] = await db.get<CoachingNote>(table,[ctx.params.id],{consistent:true});
    if (!existing) return error('Coaching record not found.',404);
    const b = bodyOf(ctx.body);
    const expectedUpdatedAt=strField(b,'expectedUpdatedAt',40);
    if(expectedUpdatedAt&&existing.updatedAt&&existing.updatedAt!==expectedUpdatedAt)
      return error('Another trainer changed this coaching note. Reload before saving.',409);
    const date = normalizeDate(b.date || existing.date);
    const skill = strField(b,'skill',100) || existing.skill;
    const status = strField(b,'status',20) || existing.status;
    if (!date || !['Open','Completed','Canceled'].includes(status)) return error('Invalid coaching record.',400);
    const [changed] = await db.tx.update(table,[{
      id: ctx.params.id,
      ...(expectedUpdatedAt&&existing.updatedAt?{if:{updatedAt:expectedUpdatedAt}}:{}),
      record: {
        date, skill, status, trainer: strField(b,'trainer',100),
        observation: strField(b,'observation',2000), commitment: strField(b,'commitment',1200),
        dueDate: normalizeDate(b.dueDate), updatedAt:new Date().toISOString(),
      },
    }],{patch:true});
    if (!changed) return error('Unable to update coaching record.',409);
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'updated','coaching',skill);
    return json({ok:true});
  }],
  'DELETE /api/coaching/:id': [workspaceAccess, async ctx => {
    const m = await member(ctx.user!.userId); if (!m) return error('Team required.',403);
    const [deleted] = await db.delete(extraTables(m.workspaceId).coaching,[ctx.params.id]);
    if (!deleted) return error('Record not found.',404);
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'deleted','coaching',ctx.params.id);
    return json({ok:true});
  }],
  'PUT /api/visits/:id': [workspaceAccess, async ctx => {
    const m = await member(ctx.user!.userId); if (!m) return error('Team required.',403);
    const revision=await db.workspaceRevision(m.workspaceId);
    const table = tables(m.workspaceId).visits;
    const [existing] = await db.get<Visit>(table,[ctx.params.id],{consistent:true});
    if (!existing) return error('Visit not found.',404);
    const b = bodyOf(ctx.body);
    const expectedUpdatedAt=strField(b,'expectedUpdatedAt',40);
    if(expectedUpdatedAt&&existing.updatedAt&&existing.updatedAt!==expectedUpdatedAt)
      return error('Another trainer changed this visit. Review the latest calendar record.',409);
    const managerId = strField(b,'managerId',90) || existing.managerId;
    const [mgr] = await db.get<Manager>(tables(m.workspaceId).managers,[managerId],{consistent:true});
    if (!mgr) return error('Manager not found.',404);
    const date = normalizeDate(b.date || existing.date);
    const stateCode = strField(b,'stateCode',2).toUpperCase() || existing.stateCode;
    const status = strField(b,'status',25) || existing.status;
    if (!date || !validStates.has(stateCode) || !['Planned','Completed','Rescheduled','Canceled'].includes(status)) return error('Invalid visit fields.',400);
    if(status!=='Canceled'&&await hasDuplicateVisit(m.workspaceId,managerId,date,ctx.params.id))
      return error('This manager has another coaching visit on that date. Update or cancel the existing visit first.',409);
    if(status==='Planned'||status==='Rescheduled'){
      const blocked=await conflictingTrainerBlock(m.workspaceId,
        strField(b,'trainer',100)||existing.trainer||'',date,date);
      if(blocked)return error('This trainer is marked '+blocked.reason.toLowerCase()+
        ' on '+date+'. Resolve the availability conflict before scheduling.',409);
    }
    const nextTrainer=strField(b,'trainer',100)||existing.trainer||'';
    if(existing.tripId&&(managerId!==existing.managerId||date!==existing.date||nextTrainer!==existing.trainer))
      return error('Reschedule or reassign this linked visit through its itinerary.',409);
    const timingChanged=managerId!==existing.managerId||date!==existing.date||stateCode!==existing.stateCode||strField(b,'location',180)!==(existing.location||'');
    const profiles=await trainerProfilesFor(m.workspaceId);
    const [[changed]] = await db.transact([db.tx.update(table,[{
      id: ctx.params.id,
      ...(expectedUpdatedAt&&existing.updatedAt?{if:{updatedAt:expectedUpdatedAt}}:{}),
      record: {
        date,managerId,stateCode,status,
        ...(timingChanged?{startTime:undefined,endTime:undefined,timeZone:undefined,startInstant:undefined,endInstant:undefined,timingStatus:'unresolved'}:{}),
        trainerId:profiles.find(profile=>profile.name===nextTrainer)?.id,
        airport:strField(b,'airport',5).toUpperCase(),
        objective:strField(b,'objective',900),
        location:strField(b,'location',180),
        trainer:nextTrainer,
        outcome:strField(b,'outcome',1800),
        updatedAt:new Date().toISOString(),
      },
    }],{patch:true})],guardRevision(m.workspaceId,revision));
    if (!changed) return error('Visit was not updated.',409);
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'updated','visit',mgr.name + ' · ' + status);
    return json({ok:true});
  }],
  'POST /api/travel/commit': [workspaceAccess,async ctx=>{
    // One explicit trainer action creates the field trip AND its proposed calendar
    // visits together. If the transaction fails, neither record group is committed.
    const membership=await member(ctx.user!.userId);
    if(!membership)return error('Shared workspace required.',403);
    const revision = await db.workspaceRevision(membership.workspaceId);
    const b=bodyOf(ctx.body);
    const requestId=strField(b,'requestId',64);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))
      return error('A stable trip request ID is required.',400);
    const title=strField(b,'title',150),trainer=strField(b,'trainer',100);
    const startDate=normalizeDate(b.startDate),endDate=normalizeDate(b.endDate);
    const arrivalAirport=strField(b,'arrivalAirport',5).toUpperCase();
    const notes=strField(b,'notes',1500);
    const raw=Array.isArray(b.stops)?b.stops:[];
    if(!title||!trainer||!startDate||!endDate||startDate>endDate)
      return error('A trip title, trainer, and valid travel dates are required.',400);
    if(!/^[A-Z]{3}$/.test(arrivalAirport))
      return error('Choose a valid arrival airport before scheduling.',400);
    if(!raw.length||raw.length>20)
      return error('Add between 1 and 20 coaching visits.',400);
    const stops=raw.map(value=>{
      const p=bodyOf(value);
      const lat=Number(p.lat),lon=Number(p.lon);
      return {
        managerId:strField(p,'managerId',90),
        stateCode:strField(p,'stateCode',2).toUpperCase(),
        date:normalizeDate(p.date),
        location:strField(p,'location',160),
        startTime:strField(p,'startTime',5),
        endTime:strField(p,'endTime',5),
        ...(p.lat!==undefined&&p.lon!==undefined&&Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:{})
      };
    });
    const validClock=/^([01]\d|2[0-3]):[0-5]\d$/;
    if(stops.some(s=>!s.managerId||!validStates.has(s.stateCode)||!s.date||s.date<startDate||s.date>endDate
      ||!validClock.test(s.startTime)||!validClock.test(s.endTime)||s.endTime<=s.startTime))
      return error('Each proposed appointment needs a valid manager, region, date and start/end time.',400);
    const uniqueStops=new Set(stops.map(s=>s.managerId+'|'+s.date));
    if(uniqueStops.size!==stops.length)
      return error('The same manager cannot have two coaching visits on one date.',409);
    const tripTable=extraTables(membership.workspaceId).trips;
    const visitTable=tables(membership.workspaceId).visits;
    const tripId='scheduled_'+requestId.replace(/-/g,'');
    const requestHash=createHash('sha256').update(JSON.stringify({
      title,trainer,startDate,endDate,arrivalAirport,notes,stops
    })).digest('hex');
    const replay=async()=>{
      const [saved]=await db.get<Trip & {requestHash?:string}>(tripTable,[tripId],{consistent:true});
      if(!saved)return null;
      if(saved.requestHash!==requestHash)return error('This scheduling request already belongs to a different itinerary.',409);
      return json({trip:saved,scheduledVisits:stops.length,replayed:true});
    };
    const previous=await replay();
    if(previous)return previous;
    if(b.expectedRevision!==undefined&&b.expectedRevision!==revision)return error('Workspace changed since preview. Refresh and review before approving.',409);
    const profiles=await trainerProfilesFor(membership.workspaceId);
    const profile=profiles.find(p=>p.name===trainer);
    if(!profile||(b.trainerId!==undefined&&b.trainerId!==profile.id))return error('Choose a current trainer profile before scheduling.',400);
    if(await hasOverlappingTrainerTrip(membership.workspaceId,trainer,startDate,endDate))
      return error('This trainer has an overlapping saved trip. Review the calendar before scheduling.',409);
    const blocked=await conflictingTrainerBlock(membership.workspaceId,trainer,startDate,endDate);
    if(blocked)return error('Trainer is marked '+blocked.reason.toLowerCase()+' during '+
      blocked.startDate+' to '+blocked.endDate+'. Resolve the shared availability block before committing.',409);
    const uniqueManagers=[...new Set(stops.map(s=>s.managerId))];
    const people=await db.get<Manager>(tables(membership.workspaceId).managers,uniqueManagers,{consistent:true});
    if(people.some(p=>!p))return error('One or more managers are missing from this workspace.',404);
    const existing=await pageAll<Visit>(visitTable,200,20);
    if(existing.truncated)return error('Complete visit records are required for safe duplicate checking.',409);
    if(stops.some(s=>existing.items.some(v=>v.managerId===s.managerId&&v.date===s.date&&v.status!=='Canceled')))
      return error('A manager already has a planned coaching visit on one of these dates. Review the team calendar.',409);
    const now=new Date().toISOString();
    const tripStops=stops.map(({startTime,endTime,...stop})=>stop);
    const trip={
      id:tripId,requestHash,title,trainer,startDate,endDate,arrivalAirport,
      status:'Planned',trainerId:profile.id,notes,stops:tripStops,
      linkedVisitCount:stops.length,createdAt:now,updatedAt:now
    };
    const buildScheduled=()=>stops.map(s=>{
      const person=people.find(p=>p?.id===s.managerId) as (Manager & {lat?:number;lon?:number;timeZone?:string})|undefined;
      const timeZone=zoneAt(person?.lat,person?.lon,person?.timeZone);
      const instants=timeZone?{timeZone,startInstant:zonedInstant(s.date,s.startTime,timeZone),endInstant:zonedInstant(s.date,s.endTime,timeZone)}:{timingStatus:"unresolved"};
      return ({
      id:'svisit_'+createHash('sha256').update(membership.workspaceId+'|'+requestId+'|'+s.managerId+'|'+s.date).digest('hex').slice(0,42),
      managerId:s.managerId,trainerId:profile.id,...instants,stateCode:s.stateCode,date:s.date,
      airport:arrivalAirport,trainer,location:s.location,
      objective:'Proposed coaching visit '+s.startTime+'–'+s.endTime+'. Appointment time is not yet confirmed.',
      status:'Planned',outcome:'',tripId,startTime:s.startTime,endTime:s.endTime,
      source:'field-atlas-itinerary',updatedAt:now
    });});
    let scheduled:ReturnType<typeof buildScheduled>;
    try { scheduled=buildScheduled(); } catch { return error('Appointment times are ambiguous or invalid in the local time zone. Choose another time.',400); }
    try{
      // Distinct lazy operations; db.transact commits both or neither.
      await db.transact([
        db.tx.add(tripTable,[trip]),
        db.tx.add(visitTable,scheduled)
      ],workspaceGuard(membership.workspaceId, revision, "Workspace changed during approval."));
    }catch(e:unknown){
      if(isAppDatabaseError(e)&&(
        e.code==='AppDatabaseDuplicateId'||e.code==='AppDatabaseUnknownOutcome'
      )){
        const found=await replay();
        if(found)return found;
      }
      if(isAppDatabaseError(e)&&e.code==='AppDatabaseQuotaExceeded')throw e;
      return error('Unable to confirm the shared-calendar transaction. Review the calendar before trying again.',409);
    }
    await activityLog(membership.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'scheduled','itinerary',
      title+' · '+scheduled.length+' proposed coaching visits');
    return json({trip,scheduledVisits:scheduled.length,replayed:false},201);
  }],
  'POST /api/trips': [workspaceAccess, async ctx => {
    const m = await member(ctx.user!.userId); if (!m) return error('Team required.',403);
    const revision=await db.workspaceRevision(m.workspaceId);
    const b = bodyOf(ctx.body);
    const title = strField(b,'title',150), startDate=normalizeDate(b.startDate), endDate=normalizeDate(b.endDate);
    if (!title || !startDate || !endDate || startDate>endDate) return error('Trip requires a title and valid dates.',400);
    const tripTrainer=strField(b,'trainer',100);
    if(tripTrainer&&await hasOverlappingTrainerTrip(m.workspaceId,tripTrainer,startDate,endDate))
      return error('This trainer has an overlapping field trip. Review the calendar or update the existing trip.',409);
    const blocked=await conflictingTrainerBlock(m.workspaceId,tripTrainer,startDate,endDate);
    if(blocked)return error('Trainer is marked '+blocked.reason.toLowerCase()+' on '+
      blocked.startDate+' to '+blocked.endDate+'. Choose other dates or modify availability.',409);
    if(Array.isArray(b.stops)&&b.stops.length>30)return error('A trip may contain at most 30 stops.',400);
    const rawStops=Array.isArray(b.stops) ? b.stops : [];
    const stops=rawStops.map(value => {
      const p=bodyOf(value); const lat=Number(p.lat), lon=Number(p.lon);
      return {
        managerId:strField(p,'managerId',90), stateCode:strField(p,'stateCode',2).toUpperCase(),
        date:normalizeDate(p.date),location:strField(p,'location',160),
        ...(p.lat!==undefined && p.lon!==undefined && Number.isFinite(lat) && Number.isFinite(lon) ? {lat,lon}:{}),
      };
    });
    if(stops.some(p=>!validStates.has(p.stateCode)||!p.managerId||
       !p.date||p.date<startDate||p.date>endDate))
      return error('Every trip stop requires a manager, valid state and a date inside the trip.',400);
    if(new Set(stops.map(p=>p.managerId+'|'+p.date)).size!==stops.length)
      return error('The same manager may only have one scheduled stop per date.',409);
    if (stops.length) {
      const ids=[...new Set(stops.map(x=>x.managerId))];
      const existing=await db.get<Manager>(tables(m.workspaceId).managers,ids,{consistent:true});
      if (existing.some(x=>!x)) return error('Trip contains a manager outside your team.',400);
    }
    const record={ id:randomUUID(),title,startDate,endDate,
      trainer:strField(b,'trainer',100),arrivalAirport:strField(b,'arrivalAirport',5).toUpperCase(),
      status:'Planned',notes:strField(b,'notes',1500),stops,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString() };
    const [[added]] = await db.transact([db.tx.add(extraTables(m.workspaceId).trips,[record])],guardRevision(m.workspaceId,revision));
    if (!added) return error('Unable to save trip.',409);
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'created','trip',title);
    return json({trip:record},201);
  }],
  'PUT /api/trips/:id': [workspaceAccess, async ctx => {
    const m = await member(ctx.user!.userId); if (!m) return error('Team required.',403);
    const revision=await db.workspaceRevision(m.workspaceId);
    const table=extraTables(m.workspaceId).trips;
    const [existing]=await db.get<Trip>(table,[ctx.params.id],{consistent:true});
    if (!existing) return error('Trip not found.',404);
    const b=bodyOf(ctx.body);
    const expectedUpdatedAt=strField(b,'expectedUpdatedAt',40);
    if(expectedUpdatedAt&&existing.updatedAt&&existing.updatedAt!==expectedUpdatedAt)
      return error('Another trainer edited this itinerary. Load the latest saved version.',409);
    const title=strField(b,'title',150)||existing.title;
    const startDate=normalizeDate(b.startDate)||existing.startDate;
    const endDate=normalizeDate(b.endDate)||existing.endDate;
    const status=strField(b,'status',25)||existing.status;
    if (startDate>endDate || !['Planned','Completed','Canceled'].includes(status)) return error('Invalid trip fields.',400);
    const assignedTrainer=strField(b,'trainer',100);
    if(status==='Planned'&&assignedTrainer&&await hasOverlappingTrainerTrip(m.workspaceId,assignedTrainer,startDate,endDate,ctx.params.id))
      return error('This trainer already has an overlapping trip. Change the dates or update that trip.',409);
    if(status==='Planned'){
      const blocked=await conflictingTrainerBlock(m.workspaceId,assignedTrainer||existing.trainer||'',startDate,endDate);
      if(blocked)return error('Trainer is marked '+blocked.reason.toLowerCase()+' from '+
        blocked.startDate+' to '+blocked.endDate+'. Resolve their availability first.',409);
    }
    if(Array.isArray(b.stops)&&b.stops.length>30)return error('A trip may contain at most 30 stops.',400);
    const nextStops=Array.isArray(b.stops)?b.stops.map(value=>{
      const p=bodyOf(value);const lat=Number(p.lat),lon=Number(p.lon);
      return {managerId:strField(p,'managerId',90),stateCode:strField(p,'stateCode',2).toUpperCase(),date:normalizeDate(p.date),location:strField(p,'location',160),
        ...(p.lat!==undefined&&p.lon!==undefined&&Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:{})};
    }):existing.stops;
    if(nextStops.some(p=>!validStates.has(p.stateCode)||!p.managerId||
       !p.date||p.date<startDate||p.date>endDate))
      return error('Every trip stop must have a manager and date within the trip.',400);
    if(new Set(nextStops.map(p=>p.managerId+'|'+p.date)).size!==nextStops.length)
      return error('Duplicate same-manager visits on one date are not permitted.',409);
    if(nextStops.length){
      const ids=[...new Set(nextStops.map(s=>s.managerId))];
      const people=await db.get<Manager>(tables(m.workspaceId).managers,ids,{consistent:true});
      if(people.some(p=>!p))return error('Trip contains a manager outside your team.',400);
    }
    const visitTable=tables(m.workspaceId).visits;
    const allVisits=await pageAll<Visit>(visitTable,200,20);
    if(allVisits.truncated)return error('Full calendar data is needed before editing a linked trip.',409);
    const linked=allVisits.items.filter(v=>v.tripId===ctx.params.id);
    const now=new Date().toISOString();
    const nextTrainer=strField(b,'trainer',100);
    const nextAirport=strField(b,'arrivalAirport',5).toUpperCase();
    const nextTrainerId=(await trainerProfilesFor(m.workspaceId)).find(profile=>profile.name===nextTrainer)?.id;
    const tripPatch={
      trainerId:nextTrainerId,
      title,startDate,endDate,status,stops:nextStops,trainer:nextTrainer,
      arrivalAirport:nextAirport,notes:strField(b,'notes',1500),updatedAt:now
    };
    const changes:Array<{id:string;record:Record<string,unknown>;if?:Record<string,unknown>}>=[];
    const additions:Array<Record<string,unknown>>=[];
    if(linked.length&&status==='Canceled'){
      // Cancel only uncompleted appointments, preserving actual coaching history.
      for(const v of linked.filter(v=>v.status==='Planned'||v.status==='Rescheduled')){
        changes.push({id:v.id,record:{status:'Canceled',updatedAt:now},if:{status:v.status}});
      }
    }else if(linked.length&&status==='Planned'){
      if(nextStops.some(s=>!s.date||s.date<startDate||s.date>endDate))
        return error('Linked coaching visits must fall within the trip dates.',400);
      const keys=nextStops.map(s=>s.managerId+'|'+s.date);
      if(new Set(keys).size!==keys.length)
        return error('Do not schedule the same manager twice on one date.',409);
      const external=allVisits.items.filter(v=>v.tripId!==ctx.params.id&&v.status!=='Canceled');
      if(nextStops.some(s=>external.some(v=>v.managerId===s.managerId&&v.date===s.date)))
        return error('A manager already has a visit on one of these dates. Review Calendar.',409);
      for(const stop of nextStops){
        const item=linked.find(v=>v.managerId===stop.managerId&&v.date===stop.date&&v.status!=='Canceled');
        if(item?.status==='Completed')continue;
        if(item){
          changes.push({id:item.id,record:{
            stateCode:stop.stateCode,date:stop.date,managerId:stop.managerId,
            location:stop.location,trainer:nextTrainer,trainerId:nextTrainerId,airport:nextAirport,updatedAt:now,
            ...(stop.location!==(item.location||'')?{startTime:undefined,endTime:undefined,timeZone:undefined,startInstant:undefined,endInstant:undefined,timingStatus:'unresolved'}:{})
          },if:{status:item.status}});
        }else{
          additions.push({
            id:randomUUID(),managerId:stop.managerId,stateCode:stop.stateCode,
            date:stop.date,airport:nextAirport,trainer:nextTrainer,trainerId:nextTrainerId,
            location:stop.location,status:'Planned',outcome:'',
            objective:'Proposed coaching visit. Appointment time still needs confirmation.',
            tripId:ctx.params.id,startTime:'',endTime:'',
            source:'field-atlas-itinerary',updatedAt:now
          });
        }
      }
      for(const item of linked.filter(v=>v.status==='Planned'||v.status==='Rescheduled')){
        if(!keys.includes(item.managerId+'|'+item.date)){
          changes.push({id:item.id,record:{status:'Canceled',updatedAt:now},if:{status:item.status}});
        }
      }
    }
    if(linked.length&&status==='Planned'&&nextStops.some(s=>!validStates.has(s.stateCode)))
      return error('A linked visit contains an unsupported state.',400);
    const operations=[
      db.tx.update(table,[{id:ctx.params.id,record:tripPatch,
        if:{status:existing.status,...(expectedUpdatedAt&&existing.updatedAt?{updatedAt:expectedUpdatedAt}:{})}}],{patch:true})
    ];
    if(changes.length)operations.push(db.tx.update(visitTable,changes,{patch:true}));
    if(additions.length)operations.push(db.tx.add(visitTable,additions));
    try{
      await db.transact(operations,guardRevision(m.workspaceId,revision));
    }catch(e:unknown){
      if(isAppDatabaseError(e)&&e.code==='AppDatabaseQuotaExceeded')throw e;
      return error('Trip and calendar could not be updated together. Reload before retrying.',409);
    }
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'updated','trip',title+
      (changes.length||additions.length?' · synced '+(changes.length+additions.length)+' calendar items':''));
    return json({ok:true,calendarUpdated:changes.length+additions.length,updatedAt:now});
  }],
  'DELETE /api/trips/:id': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);if(!m)return error('Team required.',403);
    const tripTable=extraTables(m.workspaceId).trips;
    const visitTable=tables(m.workspaceId).visits;
    const [original]=await db.get<Trip>(tripTable,[ctx.params.id],{consistent:true});
    if(!original)return error('Trip not found.',404);
    const records=await pageAll<Visit>(visitTable,200,20);
    if(records.truncated)return error('Full calendar records required before deleting a linked trip.',409);
    const active=records.items.filter(v=>v.tripId===ctx.params.id&&
      (v.status==='Planned'||v.status==='Rescheduled'));
    try{
      if(active.length){
        await db.transact([
          db.tx.delete(tripTable,[ctx.params.id]),
          db.tx.update(visitTable,active.map(v=>({
            id:v.id,record:{status:'Canceled',updatedAt:new Date().toISOString()},
            if:{status:v.status}
          })),{patch:true})
        ]);
      }else{
        const [removed]=await db.tx.delete(tripTable,[ctx.params.id]);
        if(!removed)return error('Trip was already deleted.',404);
      }
    }catch(e:unknown){
      if(isAppDatabaseError(e)&&e.code==='AppDatabaseQuotaExceeded')throw e;
      return error('Could not confirm trip deletion and visit cancellation. Refresh the calendar before retrying.',409);
    }
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'deleted','trip',
      original.title+' · canceled '+active.length+' uncompleted linked visits');
    return json({ok:true,canceledVisits:active.length});
  }],
  'POST /api/import/managers': [workspaceAccess,async ctx=>{
    const membership=await member(ctx.user!.userId);
    if(!membership)return error('Team required.',403);
    const body=bodyOf(ctx.body);
    if(!Array.isArray(body.rows)||body.rows.length<1||body.rows.length>50)
      return error('Import requires 1–50 manager rows per batch.',400);
    const regular=tables(membership.workspaceId);
    const [roster,existingAssignments]=await Promise.all([
      pageAll<Manager>(regular.managers,250,20),
      pageAll<Assignment>(regular.assignments,250,20)
    ]);
    if(roster.truncated||existingAssignments.truncated)
      return error('Import refused: the existing roster exceeds the reconciliation range. No new records were written.',409);
    const known=[...roster.items];
    const areas=[...existingAssignments.items];
    let created=0,updated=0,assigned=0,skipped=0;
    const problems:Array<{row:number;message:string}>=[];
    for(let index=0;index<body.rows.length;index++){
      const row=bodyOf(body.rows[index]);
      const name=strField(row,'name',100).trim();
      const email=strField(row,'email',140).trim().toLowerCase();
      if(!name){skipped++;problems.push({row:index+1,message:'Missing manager name'});continue;}
      const stateCode=strField(row,'stateCode',2).toUpperCase();
      const areaType=strField(row,'areaType',10)||'state';
      const areaCode=strField(row,'areaCode',20)||stateCode;
      const role=strField(row,'role',15)||'Primary';
      const validArea=!stateCode||(
        validStates.has(stateCode)&&
        ['state','county','place','zip'].includes(areaType)&&
        ['Primary','Shared','Support'].includes(role)&&
        (areaType!=='state'||areaCode===stateCode)&&
        (areaType!=='zip'||/^\d{5}$/.test(areaCode))&&
        (!['county','place'].includes(areaType)||
          (Boolean(geoStateFips[stateCode])&&areaCode.startsWith(geoStateFips[stateCode])&&/^\d{5,7}$/.test(areaCode)))
      );
      if(!validArea){
        skipped++;problems.push({row:index+1,message:'Invalid state, county, place or ZIP scope. Row not written.'});continue;
      }
      const existing=known.find(p=>email&&p.email?.toLowerCase()===email)
        ||(!email?known.find(p=>p.name.trim().toLowerCase()===name.toLowerCase()&&!p.email):undefined);
      const managerId=existing?.id||randomUUID();
      const nextPerson={
        name,email,phone:strField(row,'phone',35),
        homeAirport:strField(row,'homeAirport',4).toUpperCase(),
        trainer:strField(row,'trainer',100),
        cadence:strField(row,'cadence',35)||'Monthly',
        focus:strField(row,'focus',1400),
        updatedAt:new Date().toISOString()
      };
      const existingArea=stateCode?areas.some(a=>a.managerId===managerId&&
        a.areaCode===areaCode&&a.areaType===areaType&&a.stateCode===stateCode):false;
      const newArea:Assignment|null=stateCode&&!existingArea?{
        id:randomUUID(),managerId,stateCode,areaType,areaCode,
        areaName:strField(row,'areaName',120)||stateCode,role
      }:null;
      try{
        const operations=[
          existing
            ?db.tx.update(regular.managers,[{
              id:managerId,record:nextPerson,
              ...(existing.updatedAt?{if:{updatedAt:existing.updatedAt}}:{})
            }],{patch:true})
            :db.tx.add(regular.managers,[{id:managerId,...nextPerson}]),
          ...(newArea?[db.tx.add(regular.assignments,[newArea])]:[])
        ];
        // A row succeeds entirely or not at all. An assignment cannot be missing
        // just because it failed after a manager was already created.
        await db.transact(operations);
        if(existing){updated++;Object.assign(existing,nextPerson);}
        else {created++;known.push({id:managerId,...nextPerson});}
        if(newArea){assigned++;areas.push(newArea);}
      }catch(e){
        skipped++;
        problems.push({row:index+1,message:
          isAppDatabaseError(e)?'The record changed in another session. Refresh and review before retrying.':
          'The manager and territory could not be saved together; this row was not partially applied.'});
      }
    }
    await activityLog(membership.workspaceId,trainerActor(ctx.query,ctx.user!.userId),
      'imported','roster',created+' managers created, '+updated+' updated, '+assigned+' assignments, '+skipped+' skipped');
    return json({created,updated,assigned,skipped,problems,partial:problems.length>0});
  }],
  'GET /api/team/members': [async () => error('Account member directory is disabled for shared-link workspaces.',410)],
  'DELETE /api/team/members/:userId': [async () => error('Account member management is disabled for shared-link workspaces.',410)],
    'PUT /api/managers/:id/coaching-profile': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);if(!m)return error('Team required.',403);
    const table=tables(m.workspaceId).managers;
    const [existing]=await db.get<Manager>(table,[ctx.params.id],{consistent:true});
    if(!existing)return error('Manager not found.',404);
    const b=bodyOf(ctx.body);
    const status=strField(b,'coachingStatus',30);
    if(status&&!['On track','Needs attention','Onboarding','Paused'].includes(status))return error('Invalid coaching status.',400);
    const [changed]=await db.tx.update(table,[{id:ctx.params.id,record:{
      coachingStatus:status||'On track',
      onboardingDate:normalizeDate(b.onboardingDate),focus:strField(b,'focus',1400),
      baseCity:strField(b,'baseCity',160),
      baseState:strField(b,'baseState',2).toUpperCase(),
      ...(typeof b.lat==='number'&&Number.isFinite(b.lat)&&typeof b.lon==='number'&&Number.isFinite(b.lon)?{lat:b.lat,lon:b.lon}:{}),
    }}],{patch:true});
    if(!changed)return error('Could not update manager profile.',409);
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'updated','manager',existing.name+' coaching profile');
    return json({ok:true});
  }],


  'GET /api/travel/preferences': [workspaceAccess, async ctx=>{
    const m=await member(ctx.user!.userId);if(!m)return error('Team required.',403);
    const requestedSlot=String(ctx.query?.slot||'');
    const accessSeat=ctx.user!.scope.includes('trainer:trainer_a')?'trainer_a':
      ctx.user!.scope.includes('trainer:trainer_b')?'trainer_b':undefined;
    if(accessSeat&&requestedSlot&&requestedSlot!==accessSeat)
      return error('A trainer link can only access its assigned travel preferences.',403);
    const slot=accessSeat||requestedSlot;
    const key=slot==='trainer_a'||slot==='trainer_b'?slot:ctx.user!.userId;
    const [preferences]=await db.get(extraTables(m.workspaceId).travelPrefs,[key],{consistent:true});
    // Preserve the old common workspace preference record as an initial fallback for Trainer 1.
    if(!preferences&&slot==='trainer_a'){
      const [legacy]=await db.get(extraTables(m.workspaceId).travelPrefs,[ctx.user!.userId],{consistent:true});
      return json({preferences:legacy||null,migratedFromShared:!!legacy});
    }
    return json({preferences:preferences||null});
  }],
  'PUT /api/travel/preferences': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);if(!m)return error('Team required.',403);
    const prefs=cleanTravelPrefs(bodyOf(ctx.body));
    const table=extraTables(m.workspaceId).travelPrefs;
    const requestedSlot=String(ctx.query?.slot||'');
    const accessSeat=ctx.user!.scope.includes('trainer:trainer_a')?'trainer_a':
      ctx.user!.scope.includes('trainer:trainer_b')?'trainer_b':undefined;
    if(accessSeat&&requestedSlot&&requestedSlot!==accessSeat)
      return error('A trainer link can only access its assigned travel preferences.',403);
    const slot=accessSeat||requestedSlot;
    const key=slot==='trainer_a'||slot==='trainer_b'?slot:ctx.user!.userId;
    const [existing]=await db.get(table,[key],{consistent:true});
    if(existing){
      const [updated]=await db.tx.update(table,[{id:key,record:{...prefs,updatedAt:new Date().toISOString()}}],{patch:true});
      if(!updated)return error('Could not save travel preferences.',409);
    }else{
      const [created]=await db.tx.add(table,[{id:key,...prefs,updatedAt:new Date().toISOString()}]);
      if(!created)return error('Travel preferences were not created.',409);
    }
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'updated','travel-preferences',key);
    return json({preferences:prefs});
  }],
  'GET /api/travel/plans': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);if(!m)return error('Team required.',403);
    const result=await pageAll<TravelPlanServer>(extraTables(m.workspaceId).travelPlans,100,5);
    return json({plans:result.items,truncated:result.truncated});
  }],
  'POST /api/travel/plans': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);if(!m)return error('Team required.',403);
    const parsed=travelPayload(bodyOf(ctx.body));
    if(!parsed.ok)return error(parsed.message,400);
    if(parsed.fields.managerIds.length){
      const records=await db.get<Manager>(tables(m.workspaceId).managers,parsed.fields.managerIds,{consistent:true});
      if(records.some(p=>!p))return error('One or more managers do not belong to this team.',400);
    }
    const record={...parsed.fields,id:randomUUID(),createdBy:ctx.user!.userId,
      createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    const [created]=await db.tx.add(extraTables(m.workspaceId).travelPlans,[record]);
    if(!created)return error('Travel plan could not be saved.',409);
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'created','air-travel',record.title);
    return json({plan:record},201);
  }],
  'PUT /api/travel/plans/:id': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);if(!m)return error('Team required.',403);
    const table=extraTables(m.workspaceId).travelPlans;
    const [existing]=await db.get<TravelPlanServer>(table,[ctx.params.id],{consistent:true});
    if(!existing)return error('Travel plan not found.',404);
    const body=bodyOf(ctx.body);
    const expectedUpdatedAt=strField(body,'expectedUpdatedAt',40);
    if(expectedUpdatedAt&&existing.updatedAt!==expectedUpdatedAt)
      return error('Another trainer changed this itinerary. Review the latest saved version before overwriting.',409);
    const parsed=travelPayload(body);
    if(!parsed.ok)return error(parsed.message,400);
    if(parsed.fields.managerIds.length){
      const records=await db.get<Manager>(tables(m.workspaceId).managers,parsed.fields.managerIds,{consistent:true});
      if(records.some(p=>!p))return error('One or more managers do not belong to this team.',400);
    }
    const updatedAt=new Date().toISOString();
    const [updated]=await db.tx.update(table,[{id:ctx.params.id,
      ...(expectedUpdatedAt?{if:{updatedAt:expectedUpdatedAt}}:{}),
      record:{...parsed.fields,updatedAt}
    }],{patch:true});
    if(!updated)return error('Travel plan was edited elsewhere. Refresh and retry.',409);
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'updated','air-travel',parsed.fields.title);
    return json({ok:true,updatedAt});
  }],
  'DELETE /api/travel/plans/:id': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);if(!m)return error('Team required.',403);
    const [deleted]=await db.tx.delete(extraTables(m.workspaceId).travelPlans,[ctx.params.id]);
    if(!deleted)return error('Travel plan not found.',404);
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'deleted','air-travel',ctx.params.id);
    return json({ok:true});
  }],



  'GET /api/travel/point-forecast': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);
    if(!m)return error('Workspace required.',403);
    const lat=Number(ctx.query?.lat),lon=Number(ctx.query?.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||
       lat<17||lat>72||lon< -179||lon> -62)
      return error('Provide coordinates for a U.S. airport forecast point.',400);
    return json(await nwsAirportForecast(lat,lon));
  }],

  'GET /api/travel/weather-alerts': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);
    if(!m)return error('Workspace required.',403);
    const lat=Number(ctx.query?.lat),lon=Number(ctx.query?.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<15||lat>75||lon<-180||lon>-60)
      return error('Enter coordinates for a valid U.S. airport point.',400);
    return json(await nwsPointAlerts(lat,lon));
  }],

  'GET /api/travel/security-history': [workspaceAccess,async ctx=>{
    const membership=await member(ctx.user!.userId);
    if(!membership)return error('Workspace required.',403);
    const airport=String(ctx.query?.airport||'').toUpperCase();
    const date=String(ctx.query?.date||'');
    const hour=Number(ctx.query?.hour);
    if(!/^[A-Z]{3}$/.test(airport)||!/^(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date)||
       !Number.isInteger(hour)||hour<0||hour>23)
       return error('Provide an IATA airport, date, and hour (0–23).',400);
    if(!supportedCheckpointAirports.includes(airport))
       return json({available:false,airport,checkedAt:new Date().toISOString(),rows:[],
         message:'This open archive does not currently cover this airport.',
         source:'US Airport Security & Immigration Wait Times',
         sourceUrl:'https://huggingface.co/datasets/digitalhen/us-airport-wait-times',
         license:'CC BY 4.0',limitations:['Coverage is limited to participating airports.']});
    return json(await securityHistory(airport,date,hour));
  }],
  'GET /api/travel/flight-history': [workspaceAccess,async ctx=>{
    const membership=await member(ctx.user!.userId);
    if(!membership)return error('Shared workspace required.',403);
    const origin=String(ctx.query?.origin||'').trim().toUpperCase();
    const destination=String(ctx.query?.destination||'').trim().toUpperCase();
    const connection=String(ctx.query?.connection||'').trim().toUpperCase();
    const alternate=String(ctx.query?.alternate||'').trim().toUpperCase();
    const carrier=String(ctx.query?.carrier||'').trim().toUpperCase();
    const flightNumber=String(ctx.query?.flightNumber||'').trim();
    const travelDate=String(ctx.query?.date||'');
    if(!/^[A-Z]{3}$/.test(origin)||!/^[A-Z]{3}$/.test(destination)||origin===destination||
       (connection&&!/^[A-Z]{3}$/.test(connection))||
       (alternate&&!/^[A-Z]{3}$/.test(alternate))||
       (connection&&(connection===origin||connection===destination))||
       (alternate&&(alternate===origin||alternate===destination))||
       (carrier&&!/^[A-Z0-9]{2}$/.test(carrier))||
       (flightNumber&&!/^\d{1,4}$/.test(flightNumber))||
       (travelDate&&!/^\d{4}-\d{2}-\d{2}$/.test(travelDate)))
       return error('Enter valid, distinct IATA airport codes and optional operating carrier / flight number.',400);
    return json(await flightHistory({origin,destination,connection,alternate,carrier,flightNumber,
      selectedMonth:travelDate?travelDate.slice(0,7):''}));
  }],
  'GET /api/travel/disruptions': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);
    if(!m)return error('Workspace required.',403);
    const raw=String(ctx.query?.airports||'').toUpperCase();
    if(raw.length>130)return error('Too many airports requested.',400);
    const codes=[...new Set(raw.split(',').map(x=>x.trim()).filter(x=>/^[A-Z]{3}$/.test(x)))].slice(0,16);
    if(!codes.length)return error('Provide up to 16 valid IATA airport codes.',400);
    try{
      const [snapshot, checks] = await Promise.all([currentNas(), Promise.all(codes.map(code => faa(code)))]);
      return json({
        available:checks.some(row => row.evidence.state === 'current'),source:'FAA National Airspace System',sourceUrl:'https://nasstatus.faa.gov/',
        checkedAt:snapshot.checkedAt,
        scope:'Current airport-wide FAA events; not flight-specific or future-date predictions. FAA feed coverage may be limited for Canadian airports.',
        airports:codes.map((code, index) => ({ ...(checks[index].evidence.state === 'current' ? snapshot.data.get(code) : null) || {
          code,level:'unknown',headline:'Airport status could not be verified from current FAA evidence',events:[],config:null
        }, evidence: checks[index].evidence }))
      });
    }catch(err){
      console.warn('FAA airport status fetch failed',err instanceof Error?err.name:'unknown');
      return json({
        available:false,source:'FAA National Airspace System',sourceUrl:'https://nasstatus.faa.gov/',
        checkedAt:new Date().toISOString(),
        scope:'FAA status unavailable; no airport can be assumed clear.',
        airports:[],message:'The official FAA feed could not be reached. Verify airport conditions with FAA and your airline.'
      });
    }
  }],
  'GET /api/travel/aviation/:icao': [async ctx=>{
    const icao=safe(ctx.params.icao,4).toUpperCase();
    if(!/^[A-Z]{4}$/.test(icao))return error('Enter a valid four-letter ICAO weather station.',400);
    const [metarResult, tafResult] = await Promise.all([stationMetar(icao), stationTaf(icao)]);
    const metar = metarResult.evidence.state === 'current' ? metarResult.data?.[0] : null;
    const taf = tafResult.evidence.state === 'current' ? tafResult.data?.[0] : null;
    return json({ icao, source: 'NOAA Aviation Weather Center', checkedAt: metarResult.evidence.retrievedAt,
      available: !!(metar || taf),
      observation: metar ? { reportTime: metarResult.evidence.observedAt || null, category: metar.title,
        raw: metar.detail, windKnots: metar.observation?.windKnots ?? null,
        visibility: metar.observation?.visibility ?? null, temperatureC: metar.observation?.temperatureC ?? null } : null,
      forecast: taf ? { raw: taf.detail, validFrom: taf.validFrom || null, validTo: taf.validTo || null } : null,
      evidence: [metarResult.evidence, tafResult.evidence],
      message: [metarResult, tafResult].filter(r => r.evidence.state !== 'current').map(r => r.evidence.limitation).join(' ')
    });
  }],
  'GET /api/travel/live-aircraft': [workspaceAccess,async ctx=>{
    const membership=await member(ctx.user!.userId);
    if(!membership)return error('Shared workspace required.',403);
    const airportCode=String(ctx.query?.airport||'').trim().toUpperCase();
    if(!/^[A-Z]{3}$/.test(airportCode))return error('Provide a three-letter airport code.',400);
    const [airport]=await lookupAirports([airportCode]);
    if(!airport||!Number.isFinite(airport.lat)||!Number.isFinite(airport.lon))
      return error('This airport is not in the validated reference directory.',404);
    const gate=liveAircraftProductionGate(airport.iata,airport.name,airport.lat!,airport.lon!);
    return json(gate||await liveAircraftNearAirport({
      iata:airport.iata,name:airport.name,lat:airport.lat!,lon:airport.lon!
    }));
  }],



  'GET /api/backup/export': [workspaceAccess,async ctx=>{
    const memberRecord=await member(ctx.user!.userId);
    if(!memberRecord)return error('Shared workspace required.',403);
    const w=memberRecord.workspaceId,regular=tables(w),extra=extraTables(w);
    // Read-only export. No share token or API secrets are included in the file.
    const tablesToExport=[
      {name:'managers',table:regular.managers},
      {name:'assignments',table:regular.assignments},
      {name:'visits',table:regular.visits},
      {name:'coaching',table:extra.coaching},
      {name:'trips',table:extra.trips},
      {name:'travelPlans',table:extra.travelPlans},
      {name:'travelPrefs',table:extra.travelPrefs},
      {name:'activity',table:extra.activity},
      {name:'directory',table:extra.directory},
      {name:'availability',table:extra.trainerAvailability}
    ];
    const records=await Promise.all(tablesToExport.map(async source=>({
      name:source.name,result:await pageAll<Record<string,unknown>>(source.table,200,25)
    })));
    if(records.some(x=>x.result.truncated))
      return error('Workspace records exceed safe export limits. No partial backup was generated.',409);
    const content:Record<string,unknown>=Object.fromEntries(records.map(x=>[x.name,x.result.items]));
    content.trainerProfiles=await trainerProfilesFor(w);
    const counts=Object.fromEntries(Object.entries(content).map(([name,value])=>[
      name,Array.isArray(value)?value.length:0
    ]));
    return json({
      format:'field-sales-atlas-operations-backup',schemaVersion:2,
      exportedAt:new Date().toISOString(),
      description:'Full workspace backup for local inspection and explicit recovery into a separate Field Sales Atlas workspace. Keep private. Excludes access keys and app secrets.',
      restoreAvailableInApp:true,
      counts,records:content
    });
  }],
  'GET /api/trainer-profiles': [workspaceAccess, async ctx=>{
    const m=await member(ctx.user!.userId);
    if(!m)return error('Workspace unavailable.',403);
    return json({profiles:await trainerProfilesFor(m.workspaceId)});
  }],
  'PUT /api/trainer-profiles/:slot': [workspaceAccess, async ctx=>{
    const m=await member(ctx.user!.userId);
    if(!m)return error('Workspace unavailable.',403);
    const slot=String(ctx.params.slot||'');
    if(slot!=='trainer_a'&&slot!=='trainer_b')return error('Unknown trainer profile.',400);
    const accessSeat=ctx.user!.scope.includes('trainer:trainer_a')?'trainer_a':
      ctx.user!.scope.includes('trainer:trainer_b')?'trainer_b':undefined;
    if(accessSeat&&slot!==accessSeat)
      return error('A trainer link can only update its assigned trainer profile.',403);
    const next=validTrainerBody(ctx.body,slot);
    if(!next)return error('Trainer name must contain at least two characters.',400);
    const current=await trainerProfilesFor(m.workspaceId);
    const other=current.find(x=>x.id!==slot)!;
    if(other.name.toLowerCase()===next.name.toLowerCase())return error('Both trainers need different names.',409);
    const before=current.find(x=>x.id===slot)!;
    // Guard against silently unlinking older manager/trip records when renaming a trainer.
    if(before.name!==next.name){
      const [people,visits,trips,notes]=await Promise.all([
        pageAll<Manager>(tables(m.workspaceId).managers,200,10),
        pageAll<Visit>(tables(m.workspaceId).visits,200,10),
        pageAll<Trip>(extraTables(m.workspaceId).trips,200,10),
        pageAll<CoachingNote>(extraTables(m.workspaceId).coaching,200,10)
      ]);
      if([people,visits,trips,notes].some(r=>r.truncated))return error('Unable to check all trainer assignments safely. Reduce the record count.',409);
      if([...people.items,...visits.items,...trips.items,...notes.items].some(r=>(r as any).trainer===before.name)){
        return error('This trainer has existing assignments. Keep the original name or update the assigned records before renaming.',409);
      }
    }
    const table=extraTables(m.workspaceId).trainerProfiles;
    const [existing]=await db.get<TrainerProfileRecord>(table,[slot],{consistent:true});
    const profile={...next,updatedAt:new Date().toISOString()};
    if(existing){
      const [updated]=await db.tx.update(table,[{id:slot,record:profile}],{patch:true});
      if(!updated)return error('Trainer profile was not saved.',409);
    }else{
      const [created]=await db.tx.add(table,[profile]);
      if(!created)return error('Trainer profile was not saved.',409);
    }
    await activityLog(m.workspaceId,trainerActor(ctx.query,ctx.user!.userId),'updated','trainer profile',profile.name);
    return json({profile});
  }],


  // No paid flight-data/offer requests are permitted in this research-only app.
  'GET /api/flights/status': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);
    if(!m)return error('Workspace required.',403);
    return json({
      provider:'none',connected:false,freeOnly:true,
      supported:'Free FAA, NOAA, NWS and historical public-source travel intelligence',
      note:'Commercial flight search and ticketing are disabled. Research or book externally.'
    });
  }],
  'POST /api/flights/search': [workspaceAccess,async ctx=>{
    const m=await member(ctx.user!.userId);
    if(!m)return error('Workspace required.',403);
    return error('Commercial flight-offer search is disabled in this free-data-only application.',410);
  }],
}, workspaceAccess);
