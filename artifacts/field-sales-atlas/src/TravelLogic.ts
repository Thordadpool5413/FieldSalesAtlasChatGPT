
import type { Airport,Manager } from './opsModels';
import { distanceMiles,today } from './opsModels';
import type { RoadPlanningResult } from '../shared/travel/roadPlanning';
import { describeEvidence } from '../shared/travel/evidence';

export type TravelPrefs = {
  roadNetwork?: NonNullable<RoadPlanningResult['network']>;
  homeAirports: string[];
  homeDriveMinutes: Record<string,number>;
  checkinMinutes: number;
  rentalPickupMinutes: number;
  rentalReturnMinutes: number;
  hotelPerNight: number;
  mealsPerDay: number;
  rentalPerDay: number;
  parkingPerDay: number;
  fuelPerMile: number;
  tollsPerTrip: number;
  groundMiscPerTrip: number;
  valueOfTimePerHour: number;
  preferNonstop: boolean;
  maxConnections: number;
  preferredAirlines: string;
};
export const defaultTravelPrefs: TravelPrefs = {
  homeAirports:[], homeDriveMinutes:{},
  checkinMinutes:105, rentalPickupMinutes:45, rentalReturnMinutes:30,
  hotelPerNight:160, mealsPerDay:65, rentalPerDay:68, parkingPerDay:13,
  fuelPerMile:0.17, tollsPerTrip:15, groundMiscPerTrip:0,
  valueOfTimePerHour:65,
  preferNonstop:true, maxConnections:1, preferredAirlines:'',
};
export type TravelPlace = { name:string; state:string; lat:number;lon:number; code?:string };
export type TripPlanning = {
  firstCoachingDate?: string;
  lastCoachingDate?: string;
  dayStart?: string;
  dayEnd?: string;
  sessionMinutes?: number;
  breakMinutes?: number;
  includeWeekends?: boolean;
  arrivalToCoachingBufferMinutes?: number;
};
export type FlightQuote = {
  id:string; origin:string; destination:string; returnOrigin:string;
  carrier:string; source:string; observedOn:string;
  fare:number; baggage:number; extra:number;
  outboundMinutes:number; returnMinutes:number; connections:number;
  outboundArrivalLocal:string; returnDepartureLocal?:string; returnLandingLocal:string; notes:string;
  verifiedGroundMiles?:number; verifiedGroundMinutes?:number;
};
export type TravelPlan = {
  id:string;title:string; createdBy?:string; trainer:string;
  departDate:string; returnDate:string;
  destination:TravelPlace | null; managerIds:string[];
  origins:string[]; selectedArrival:string; notes:string; quotes:FlightQuote[];
  planning?:TripPlanning;
  createdAt?:string; updatedAt?:string;
};
export type Gateway = {
  airport: Airport; airMiles: number; planningRoadMiles: number;
  planningDriveMinutes: number; path:Manager[]; firstLegMiles:number; firstLegMinutes?:number;
};
export type QuoteResult = {
  groundKnown:boolean;complete:boolean;
  quote:FlightQuote; cash:number; totalMinutes:number; economicCost:number;
  fare:number; groundMinutes:number; groundMiles:number; homeTravelMinutes:number;
  nightCount:number; expenseBreakdown:Array<{name:string;amount:number}>;
  warnings:string[]; homeArrivalLocal:string | null;
};
const clamp=(value:unknown,min:number,max:number,fallback:number)=>{
  const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
};
export const safeTravelPrefs=(raw:Partial<TravelPrefs>):TravelPrefs=>{
  const p={...defaultTravelPrefs,...raw};
  const numbers: Array<[keyof TravelPrefs,number,number,number]> = [
    ['checkinMinutes',30,240,105],['rentalPickupMinutes',0,180,45],
    ['rentalReturnMinutes',0,180,30],['hotelPerNight',0,1500,160],
    ['mealsPerDay',0,500,65],['rentalPerDay',0,1000,68],
    ['parkingPerDay',0,200,13],['fuelPerMile',0,3,0.17],
    ['tollsPerTrip',0,500,15],['groundMiscPerTrip',0,1000,0],
    ['valueOfTimePerHour',0,500,65],
    ['maxConnections',0,4,1],
  ];
  for(const [key,min,max,fallback] of numbers)(p as unknown as Record<string,unknown>)[key]=clamp(p[key],min,max,fallback);
  p.homeAirports=[...new Set((p.homeAirports||[]).map(s=>String(s).toUpperCase()).filter(s=>/^[A-Z]{3}$/.test(s)))].slice(0,6);
  p.homeDriveMinutes=Object.fromEntries(Object.entries(p.homeDriveMinutes||{})
    .filter(([code,n])=>/^[A-Z]{3}$/.test(code)&&n!==null&&n!==undefined&&String(n).trim()!==''&&Number.isFinite(Number(n))&&Number(n)>=0&&Number(n)<=300)
    .map(([code,n])=>[code,Math.round(Number(n))]));
  delete (p as unknown as Record<string,unknown>).roadMultiplier;
  delete (p as unknown as Record<string,unknown>).assumedRoadMph;
  p.preferredAirlines=String(p.preferredAirlines||'').slice(0,170);
  p.preferNonstop=!!p.preferNonstop;
  return p;
};
export const newTravelPlan=(origin:string=''):TravelPlan=>({
  id:'',title:'',trainer:'',departDate:today(),returnDate:today(),
  destination:null,managerIds:[],origins:origin?[origin]:[],selectedArrival:'',notes:'',quotes:[],
  planning:{dayStart:'09:00',dayEnd:'17:00',sessionMinutes:150,breakMinutes:30,includeWeekends:false,arrivalToCoachingBufferMinutes:30},
});
export const countNights=(start:string,end:string)=>{
  const a=Date.parse(start+'T12:00:00Z'),b=Date.parse(end+'T12:00:00Z');
  return Number.isFinite(a)&&Number.isFinite(b)?Math.max(0,Math.ceil((b-a)/86400000)):0;
};
export function roadTransfer(from:{lat?:number;lon?:number},to:{lat?:number;lon?:number},prefs:TravelPrefs){
  const network=prefs.roadNetwork;
  if(!network || !network.matrix.roadBased || describeEvidence(network.matrix.evidence).state!=='current')return null;
  const find=(point:typeof from)=>network.points.findIndex(item=>Number.isFinite(point.lat)&&Number.isFinite(point.lon)&&Math.abs(item.lat-point.lat!)<0.00001&&Math.abs(item.lon-point.lon!)<0.00001);
  const a=find(from),b=find(to);if(a<0||b<0)return null;
  const minutes=network.matrix.durations[a]?.[b],miles=network.matrix.distances[a]?.[b];
  return typeof minutes==='number'&&typeof miles==='number'?{minutes,miles}:null;
}
export function roadCircuit(airport:Airport,stops:Manager[],prefs:TravelPrefs,returnAirport=airport){
  const remaining=[...stops],path:Manager[]=[];let current:{lat?:number;lon?:number}=airport,minutes=0,miles=0;
  while(remaining.length){
    const choices=remaining.map((person,index)=>({person,index,leg:roadTransfer(current,person,prefs)})).filter(item=>item.leg!==null).sort((a,b)=>a.leg!.minutes-b.leg!.minutes);
    const next=choices[0];if(!next)return null;
    path.push(next.person);minutes+=next.leg!.minutes;miles+=next.leg!.miles;current=next.person;remaining.splice(next.index,1);
  }
  const back=roadTransfer(current,returnAirport,prefs);if(!back)return null;
  return {path,minutes:minutes+back.minutes,miles:miles+back.miles};
}
export function orderStopsFromAirport(airport:Airport,selected:Manager[]):Manager[]{
  const valid=selected.filter(m=>Number.isFinite(m.lat)&&Number.isFinite(m.lon));
  if(!Number.isFinite(airport.lat)||!Number.isFinite(airport.lon))return valid;
  const result:Manager[]=[];const remaining=[...valid];
  let lat=airport.lat!,lon=airport.lon!;
  while(remaining.length){
    let closest=0,d=Infinity;
    remaining.forEach((m,i)=>{
      const diff=distanceMiles(lat,lon,m.lat!,m.lon!);
      if(diff<d){d=diff;closest=i;}
    });
    const next=remaining.splice(closest,1)[0];result.push(next);lat=next.lat!;lon=next.lon!;
  }
  return result;
}
export function homeAirportOptions(airports:Airport[],prefs:TravelPrefs,selected:string[]){
  const byCode=new Map(airports.map(a=>[a.iata,a]));
  return [...new Set([...selected,...prefs.homeAirports])].map(code=>byCode.get(code)).filter((a):a is Airport=>!!a);
}
export function calcQuote(quote:FlightQuote,plan:TravelPlan,prefs:TravelPrefs,airports:Airport[],managers:Manager[]):QuoteResult{
  const nights=countNights(plan.departDate,plan.returnDate);
  const days=nights+1;
  const first=airports.find(a=>a.iata===quote.destination);
  const last=airports.find(a=>a.iata===(quote.returnOrigin||quote.destination));
  const people=managers.filter(m=>plan.managerIds.includes(m.id)&&Number.isFinite(m.lat)&&Number.isFinite(m.lon));
  let groundMinutes=0;
  let groundMiles=0;
  let groundKnown=false;
  const warnings:string[]=[];
  if(first&&Number.isFinite(first.lat)&&Number.isFinite(first.lon)){
    if(people.length===plan.managerIds.length&&people.length>0){
      const loop=roadCircuit(first,people,prefs,last);
      if(loop){groundMiles=loop.miles;groundMinutes=loop.minutes;groundKnown=true;}
    }else if(plan.destination&&Number.isFinite(plan.destination.lat)&&Number.isFinite(plan.destination.lon)){
      const outbound=roadTransfer(first,plan.destination,prefs),inbound=roadTransfer(plan.destination,last || first,prefs);
      if(outbound&&inbound){groundMiles=outbound.miles+inbound.miles;groundMinutes=outbound.minutes+inbound.minutes;groundKnown=true;}
      if(plan.managerIds.length)warnings.push('Some manager locations are missing; ground travel only uses the selected city.');
    }else warnings.push('Ground travel cannot be estimated until a destination is mapped.');
  }else warnings.push('Destination airport coordinates unavailable.');
  if(Number.isFinite(quote.verifiedGroundMiles)&&Number(quote.verifiedGroundMiles)>0)
    groundMiles=Number(quote.verifiedGroundMiles);
  if(Number.isFinite(quote.verifiedGroundMinutes)&&Number(quote.verifiedGroundMinutes)>0)
    groundMinutes=Number(quote.verifiedGroundMinutes);
  if(Number.isFinite(quote.verifiedGroundMiles)&&Number(quote.verifiedGroundMiles)>0&&Number.isFinite(quote.verifiedGroundMinutes)&&Number(quote.verifiedGroundMinutes)>0)groundKnown=true;
  if(!groundKnown)warnings.push('Ground travel cannot be established: no current road route or complete user-entered ground estimate is available. Cost and travel totals are incomplete.');
  if(quote.returnOrigin && quote.returnOrigin!==quote.destination)
    warnings.push('Open-jaw flight: verify the separate return airport route and one-way rental terms.');
  const driveHome=prefs.homeDriveMinutes[quote.origin];
  if(driveHome===undefined)warnings.push('Home-to-airport drive time is not configured for '+quote.origin+'.');
  const homeTravelMinutes=driveHome===undefined?0:driveHome*2;
  const totalMinutes=quote.outboundMinutes+quote.returnMinutes+2*prefs.checkinMinutes+
    prefs.rentalPickupMinutes+prefs.rentalReturnMinutes+groundMinutes+homeTravelMinutes;
  const expenseBreakdown=[
    {name:'Quoted round-trip airfare',amount:quote.fare},
    {name:'Baggage and ticket extras',amount:quote.baggage+quote.extra},
    {name:'Rental car planning allowance',amount:days*prefs.rentalPerDay},
    {name:'Hotel allowance',amount:nights*prefs.hotelPerNight},
    {name:'Meals allowance',amount:days*prefs.mealsPerDay},
    {name:'Departure airport parking',amount:days*prefs.parkingPerDay},
    ...(groundKnown?[{name:'Fuel / charging planning allowance',amount:groundMiles*prefs.fuelPerMile}]:[]),
    {name:'Toll allowance',amount:prefs.tollsPerTrip},
    {name:'Other ground transport allowance',amount:prefs.groundMiscPerTrip},
  ];
  const cash=expenseBreakdown.reduce((sum,x)=>sum+x.amount,0);
  const economicCost=cash+totalMinutes/60*prefs.valueOfTimePerHour;
  if(quote.connections>0)warnings.push(quote.connections+' total connecting stop(s); this is not a measured delay risk.');
  if(prefs.preferNonstop&&quote.connections>0)warnings.push('Does not meet the nonstop flight preference.');
  if(quote.connections>prefs.maxConnections)warnings.push('Exceeds configured maximum connections.');
  if(quote.observedOn && Math.floor((Date.now()-Date.parse(quote.observedOn+'T12:00:00Z'))/86400000)>7)
    warnings.push('Fare recorded more than 7 days ago. Recheck before booking.');
  if(!quote.outboundMinutes || !quote.returnMinutes)warnings.push('Flight duration is missing. Comparison is incomplete.');
  const homeArrivalLocal=quote.returnLandingLocal&&driveHome!==undefined
    ?addLocalMinutes(quote.returnLandingLocal,driveHome+30):null;
  const complete=groundKnown&&driveHome!==undefined&&quote.outboundMinutes>0&&quote.returnMinutes>0;
  return {quote,cash,totalMinutes,economicCost,fare:quote.fare,groundMinutes,groundMiles,homeTravelMinutes,groundKnown,complete,
    nightCount:nights,expenseBreakdown,warnings,homeArrivalLocal};
}
export function addLocalMinutes(isoLocal:string,minutes:number){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(isoLocal))return null;
  const d=new Date(isoLocal);
  if(!Number.isFinite(d.getTime()))return null;
  d.setMinutes(d.getMinutes()+minutes);
  const n=(x:number)=>String(x).padStart(2,'0');
  return d.getFullYear()+'-'+n(d.getMonth()+1)+'-'+n(d.getDate())+' '+n(d.getHours())+':'+n(d.getMinutes());
}
export function googleFlightSearch(plan:TravelPlan,origin:string,destination:string,returnOrigin?:string){
  const out=returnOrigin&&returnOrigin!==destination
    ?'Multi-city flights from '+origin+' to '+destination+' on '+plan.departDate+' then '+returnOrigin+' to '+origin+' on '+plan.returnDate
    :'Round trip flights from '+origin+' to '+destination+' depart '+plan.departDate+' return '+plan.returnDate;
  return 'https://www.google.com/travel/flights?hl=en&q='+encodeURIComponent(out);
}
export function googleMapRoute(airport:Airport,managers:Manager[],returnAirport?:Airport){
  if(!Number.isFinite(airport.lat)||!Number.isFinite(airport.lon)||!managers.length)return '';
  const pts=orderStopsFromAirport(airport,managers).filter(m=>Number.isFinite(m.lat)&&Number.isFinite(m.lon));
  if(pts.length!==managers.length)return '';
  const coords=(lat:number,lon:number)=>lat+','+lon;
  const end=returnAirport&&Number.isFinite(returnAirport.lat)&&Number.isFinite(returnAirport.lon)?returnAirport:airport;
  const points=[coords(airport.lat!,airport.lon!),...pts.map(p=>coords(p.lat!,p.lon!)),coords(end.lat!,end.lon!)];
  const params=new URLSearchParams({api:'1',origin:points[0],destination:points[points.length-1],travelmode:'driving'});
  if(points.length>2)params.set('waypoints',points.slice(1,-1).slice(0,8).join('|'));
  return 'https://www.google.com/maps/dir/?'+params.toString();
}
export function money(value:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);}
export function minutesLabel(minutes:number){
  if(!Number.isFinite(minutes)||minutes<0)return 'Not available';
  const h=Math.floor(minutes/60),m=Math.round(minutes%60);
  return h>0?h+'h '+String(m).padStart(2,'0')+'m':m+'m';
}
export function sanitizePlan(plan:TravelPlan,managers:Manager[]):TravelPlan{
  const allowed=new Set(managers.map(m=>m.id));
  return {...plan,managerIds:[...new Set(plan.managerIds)].filter(id=>allowed.has(id)).slice(0,12),
    origins:[...new Set(plan.origins.map(c=>c.toUpperCase()).filter(c=>/^[A-Z]{3}$/.test(c)))].slice(0,6),
    quotes:plan.quotes.slice(0,24)};
}
