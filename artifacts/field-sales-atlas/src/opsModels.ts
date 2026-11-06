
import type { Airport,Assignment as BasicAssignment,Manager as BasicManager,Visit as BasicVisit } from './data';
import { STARTER_AIRPORTS,STATES,STATE_BY_CODE } from './data';

export { STARTER_AIRPORTS,STATES,STATE_BY_CODE };
export type { Airport };
export type Manager = BasicManager & {
  coachingStatus?: 'On track' | 'Needs attention' | 'Onboarding' | 'Paused';
  onboardingDate?: string;
  baseCity?: string;
  baseState?: string;
  lat?: number;
  lon?: number;
  updatedAt?: string;
};
export type Assignment = Omit<BasicAssignment, 'areaType'> & {
  areaType: 'state' | 'county' | 'place' | 'zip';
};
export type Visit = BasicVisit & {
  trainerId?: 'trainer_a' | 'trainer_b';
  timeZone?: string;
  startInstant?: string;
  endInstant?: string;
  timingStatus?: 'unresolved';
  location?: string;
  trainer?: string;
  outcome?: string;
  updatedAt?: string;
  tripId?: string;
  startTime?: string;
  endTime?: string;
  source?: string;
};
export type Coaching = {
  id: string; managerId: string; date: string; trainer: string; skill: string;
  observation: string; commitment: string; dueDate: string; status: 'Open' | 'Completed' | 'Canceled';
  createdAt: string; updatedAt: string;
};
export type TripStop = {
  managerId: string; stateCode: string; date: string; location: string;
  lat?: number; lon?: number;
};
export type Trip = {
  trainerId?: 'trainer_a' | 'trainer_b';
  id: string; title: string; trainer: string; startDate: string; endDate: string;
  arrivalAirport: string; status: 'Planned' | 'Completed' | 'Canceled';
  notes: string; stops: TripStop[]; createdAt: string; updatedAt: string;
};
export type Activity = {
  id: string; action: string; entity: string; actor: string; at: string; summary: string;
};
export type AvailabilityBlock = {
  id:string;trainerId:'trainer_a'|'trainer_b';startDate:string;endDate:string;
  reason:'Unavailable'|'Personal time'|'Travel hold';notes:string;createdAt:string;
};
export type TrainerProfile = {
  id:'trainer_a'|'trainer_b';name:string;homeCity:string;homeAirports:string[];
  homeDriveMinutes:Record<string,number>;preferredAirlines:string;
  preferNonstop:boolean;maxConnections:number;notes:string;updatedAt?:string;
  travelPrefs?:Record<string,unknown>|null;
};
export const defaultTrainerProfiles:TrainerProfile[]=[
  {id:'trainer_a',name:'Trainer 1',homeCity:'',homeAirports:[],homeDriveMinutes:{},preferredAirlines:'',preferNonstop:true,maxConnections:1,notes:''},
  {id:'trainer_b',name:'Trainer 2',homeCity:'',homeAirports:[],homeDriveMinutes:{},preferredAirlines:'',preferNonstop:true,maxConnections:1,notes:''}
];
export type Board = {
  revision?: number;
  needsTeam?: boolean;
  team?: { id: string; name: string; role: string };
  accessSeat?:'trainer_a'|'trainer_b';
  managers?: Manager[];
  trainerProfiles?:TrainerProfile[];
  assignments?: Assignment[];
  visits?: Visit[];
  coaching?: Coaching[];
  trips?: Trip[];
  availability?:AvailabilityBlock[];
  activity?: Activity[];
  truncated?: boolean;
};
export type Area = { code: string; name: string; lat?: number | null; lon?: number | null };

export const TRAINER_COLORS = ['#2563eb', '#16a394', '#e28b3c', '#955cd6', '#df688c', '#527493', '#839044'];
export const today = () => {
  const now=new Date();
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
};
export const dateLabel = (date: string, options?: Intl.DateTimeFormatOptions) => {
  if (!date) return 'Not set';
  const parsed = new Date(date.slice(0,10) + 'T12:00:00');
  return Number.isNaN(parsed.getTime()) ? 'Invalid date' : parsed.toLocaleDateString('en-US', options || {month:'short', day:'numeric', year:'numeric'});
};
export const daysBetween = (earlier: string, later: string = today()) => {
  const a = Date.parse(earlier.slice(0,10) + 'T12:00:00Z'), b = Date.parse(later.slice(0,10) + 'T12:00:00Z');
  return Number.isFinite(a) && Number.isFinite(b) ? Math.floor((b-a)/86400000) : 0;
};
export const cadenceDays = (cadence: string) => {
  if (cadence === 'Monthly') return 30;
  if (cadence === 'Every 6 weeks') return 42;
  if (cadence === 'Quarterly') return 90;
  return 0;
};
export const distanceMiles = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const rad = Math.PI / 180;
  const dLat = (lat2-lat1)*rad, dLon=(lon2-lon1)*rad;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
  return 3958.76 * 2 * Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};
export const closestAirports = (manager: Manager, airports: Airport[], max: number = 8) => {
  const lat = manager.lat, lon=manager.lon;
  if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  return airports.filter(a=>Number.isFinite(a.lat) && Number.isFinite(a.lon))
    .map(a=>({ ...a, miles: distanceMiles(lat,lon,a.lat!,a.lon!) }))
    .sort((a,b)=> a.miles-b.miles)
    .slice(0,max);
};
export type Priority = { score: number; level: 'High' | 'Moderate' | 'Routine'; reasons: string[]; daysSinceVisit: number | null };
export function coachingPriority(manager: Manager, visits: Visit[], notes: Coaching[]): Priority {
  const complete = visits.filter(v=>v.managerId===manager.id && v.status==='Completed')
    .map(v=>v.date).sort().reverse()[0];
  const age = complete ? Math.max(0, daysBetween(complete)) : null;
  const cadence = cadenceDays(manager.cadence || '');
  let score = 0;
  const reasons: string[]=[];
  if (manager.coachingStatus === 'Onboarding') {score+=30; reasons.push('Onboarding support');}
  if (manager.coachingStatus === 'Needs attention') {score+=25; reasons.push('Manually flagged for support');}
  if (age===null) {score+=18; reasons.push('No completed visit recorded');}
  else if (cadence && age>=cadence) {score+=Math.min(35,20+Math.floor((age-cadence)/14)*5);reasons.push('Coaching cadence due');}
  const overdue = notes.filter(n=>n.managerId===manager.id&&n.status==='Open'&&n.dueDate&&n.dueDate<today()).length;
  if (overdue) {score+=Math.min(35,15+overdue*10);reasons.push(overdue+' overdue follow-up'+(overdue>1?'s':''));}
  const upcoming=visits.some(v=>v.managerId===manager.id&&v.status==='Planned'&&v.date>=today());
  if(upcoming) {score=Math.max(0,score-15);reasons.push('Visit scheduled');}
  return {score:Math.min(100,score),level:score>=50?'High':score>=25?'Moderate':'Routine',reasons,daysSinceVisit:age};
}
export function downloadFile(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);
}
export function exportCSV(filename: string, rows: Array<Record<string,unknown>>, headers?: string[]) {
  const keys=headers || [...new Set(rows.flatMap(r=>Object.keys(r)))];
  const cell=(value:unknown)=>'"'+String(value??'').replace(/"/g,'""')+'"';
  const csv=[keys.map(cell).join(','),...rows.map(row=>keys.map(k=>cell(row[k])).join(','))].join('\r\n');
  downloadFile(filename,csv,'text/csv;charset=utf-8');
}
const icsEscape=(value:string)=>String(value||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
const icsDay=(v:string)=>v.replace(/-/g,'');
function nextDate(v:string){const d=new Date(v+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
export function calendarContents(visits:Visit[],trips:Trip[],managers:Manager[],blocks:AvailabilityBlock[]=[],trainers:TrainerProfile[]=[]) {
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Field Sales Atlas//Coaching calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  for(const v of visits.filter(v=>v.status!=='Canceled')) {
    const m=managers.find(m=>m.id===v.managerId);
    const timed=!!v.timeZone&&!!v.startInstant&&!!v.endInstant&&Number.isFinite(Date.parse(v.startInstant))&&Date.parse(v.endInstant)>Date.parse(v.startInstant);
    const instant=(value:string)=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    lines.push('BEGIN:VEVENT','UID:'+v.id+'@field-atlas','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),
      ...(timed?['DTSTART:'+instant(v.startInstant!),'DTEND:'+instant(v.endInstant!)]:['DTSTART;VALUE=DATE:'+icsDay(v.date),'DTEND;VALUE=DATE:'+icsDay(nextDate(v.date))]),
      'STATUS:'+(v.status==='Completed'?'CONFIRMED':'TENTATIVE'),
      'SUMMARY:'+icsEscape((v.status==='Completed'?'Completed coaching':'Proposed coaching')+' · '+(m?.name||'Manager')),
      'DESCRIPTION:'+icsEscape([
        v.objective||'Coaching visit',
        v.startTime&&v.endTime?'Proposed local-time window '+v.startTime+'–'+v.endTime+' ('+(timed?v.timeZone:'destination timezone unverified')+'; confirm with manager).':'',
        v.trainer?'Trainer: '+v.trainer:'',
        v.tripId?'Linked to the shared Field Sales Atlas itinerary.':''
      ].filter(Boolean).join('\n')),
      'LOCATION:'+icsEscape(v.location||v.airport||v.stateCode),'END:VEVENT');
  }
  for(const t of trips.filter(t=>t.status!=='Canceled')){
    lines.push('BEGIN:VEVENT','UID:'+t.id+'@field-atlas','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),
      'DTSTART;VALUE=DATE:'+icsDay(t.startDate),'DTEND;VALUE=DATE:'+icsDay(nextDate(t.endDate)),
      'SUMMARY:'+icsEscape('Field trip · '+t.title),'DESCRIPTION:'+icsEscape(t.notes||'Trip planning'),
      'LOCATION:'+icsEscape(t.arrivalAirport||''),'END:VEVENT');
  }
  for(const block of blocks){
    const name=trainers.find(p=>p.id===block.trainerId)?.name||'Trainer';
    lines.push('BEGIN:VEVENT','UID:hold-'+block.id+'@field-atlas',
      'DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),
      'DTSTART;VALUE=DATE:'+icsDay(block.startDate),
      'DTEND;VALUE=DATE:'+icsDay(nextDate(block.endDate)),
      'SUMMARY:'+icsEscape(block.reason+' · '+name),
      'DESCRIPTION:'+icsEscape('Shared Field Atlas availability; not an externally confirmed appointment.'),
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const encoder=new TextEncoder();
  const folded=lines.map(line=>{
    let result='',part='',bytes=0;
    for(const char of line){const count=encoder.encode(char).length;if(bytes+count>75){result+=part+'\r\n';part=' ';bytes=1;}part+=char;bytes+=count;}
    return result+part;
  });
  return folded.join('\r\n')+'\r\n';
}
export function exportCalendar(visits:Visit[],trips:Trip[],managers:Manager[],blocks:AvailabilityBlock[]=[],trainers:TrainerProfile[]=[]) {
  downloadFile('field-atlas-calendar.ics',calendarContents(visits,trips,managers,blocks,trainers),'text/calendar;charset=utf-8');
}
export function routeUrl(airport:Airport|undefined, stops:TripStop[], people:Manager[]) {
  const places=stops.map(s=>people.find(m=>m.id===s.managerId)).filter((m):m is Manager=>!!m && m.lat!==undefined&&m.lon!==undefined);
  if(!places.length) return '';
  const p=(m:Manager)=>m.lat+','+m.lon;
  const destination=places[places.length-1];
  const params=new URLSearchParams({api:'1',destination:p(destination),travelmode:'driving'});
  if(airport?.lat!==undefined && airport.lon!==undefined) params.set('origin',airport.lat+','+airport.lon);
  else params.set('origin',p(places[0]));
  const mids=airport?.lat!==undefined ? places.slice(0,-1) : places.slice(1,-1);
  if(mids.length) params.set('waypoints',mids.slice(0,8).map(p).join('|'));
  return 'https://www.google.com/maps/dir/?'+params.toString();
}
export function toStateLabel(code:string){return STATE_BY_CODE[code]?.name||code;}
