
import type { Airport,Manager } from './opsModels';
import { distanceMiles,today } from './opsModels';

export type TravelPrefs = {
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
  roadMultiplier: number;
  assumedRoadMph: number;
  preferNonstop: boolean;
  maxConnections: number;
  preferredAirlines: string;
};
export const defaultTravelPrefs: TravelPrefs = {
  homeAirports:[], homeDriveMinutes:{},
  checkinMinutes:105, rentalPickupMinutes:45, rentalReturnMinutes:30,
  hotelPerNight:160, mealsPerDay:65, rentalPerDay:68, parkingPerDay:13,
  fuelPerMile:0.17, tollsPerTrip:15, groundMiscPerTrip:0,
  valueOfTimePerHour:65, roadMultiplier:1.3, assumedRoadMph:47,
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
  planningDriveMinutes: number; path:Manager[]; firstLegMiles:number;
};
export type QuoteResult = {
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
    ['roadMultiplier',1,2.3,1.3],['assumedRoadMph',15,75,47],
    ['maxConnections',0,4,1],
  ];
  for(const [key,min,max,fallback] of numbers)(p as unknown as Record<string,unknown>)[key]=clamp(p[key],min,max,fallback);
  p.homeAirports=[...new Set((p.homeAirports||[]).map(s=>String(s).toUpperCase()).filter(s=>/^[A-Z]{3}$/.test(s)))].slice(0,6);
  p.homeDriveMinutes=Object.fromEntries(Object.entries(p.homeDriveMinutes||{})
    .filter(([code])=>/^[A-Z]{3}$/.test(code)).map(([code,n])=>[code,clamp(n,0,300,60)]));
  p.preferredAirlines=String(p.preferredAirlines||'').slice(0,170);
  p.preferNonstop=!!p.preferNonstop;
  return p;
};
export const newTravelPlan=(origin:string='MCO'):TravelPlan=>({
  id:'',title:'',trainer:'',departDate:today(),returnDate:today(),
  destination:null,managerIds:[],origins:[origin],selectedArrival:'',notes:'',quotes:[],
  planning:{dayStart:'09:00',dayEnd:'17:00',sessionMinutes:150,breakMinutes:30,includeWeekends:false,arrivalToCoachingBufferMinutes:30},
});
export const countNights=(start:string,end:string)=>{
  const a=Date.parse(start+'T12:00:00Z'),b=Date.parse(end+'T12:00:00Z');
  return Number.isFinite(a)&&Number.isFinite(b)?Math.max(0,Math.ceil((b-a)/86400000)):0;
};
export function estimateRoadMiles(airMiles:number,p:TravelPrefs){return Math.round(airMiles*p.roadMultiplier);}
export function estimateRoadMinutes(airMiles:number,p:TravelPrefs){
  return Math.round(estimateRoadMiles(airMiles,p)/p.assumedRoadMph*60);
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
export function distanceItinerary(airport:Airport,stops:Manager[],returnAirport?:Airport){
  const ordered=orderStopsFromAirport(airport,stops);
  let distance=0,lat=airport.lat!,lon=airport.lon!;
  for(const manager of ordered){
    distance+=distanceMiles(lat,lon,manager.lat!,manager.lon!);
    lat=manager.lat!;lon=manager.lon!;
  }
  const last=returnAirport&&Number.isFinite(returnAirport.lat)&&Number.isFinite(returnAirport.lon)
    ?returnAirport:airport;
  if(ordered.length)distance+=distanceMiles(lat,lon,last.lat!,last.lon!);
  return {airMiles:distance,path:ordered,firstLegMiles:ordered.length?distanceMiles(airport.lat!,airport.lon!,ordered[0].lat!,ordered[0].lon!):0};
}
export function airportGateways(
  airports:Airport[],place:TravelPlace|null,managers:Manager[],prefs:TravelPrefs,max:number=9
):Gateway[]{
  const locations=managers.filter(m=>Number.isFinite(m.lat)&&Number.isFinite(m.lon));
  if(!locations.length && !(place && Number.isFinite(place.lat)&&Number.isFinite(place.lon)))return [];
  const candidates=airports.filter(a=>Number.isFinite(a.lat)&&Number.isFinite(a.lon)&&a.scheduled===true && /^[A-Z]{3}$/.test(a.iata));
  const picked=candidates.map(airport=>{
    if(locations.length){
      const route=distanceItinerary(airport,locations);
      return {airport,airMiles:route.airMiles,planningRoadMiles:estimateRoadMiles(route.airMiles,prefs),
        planningDriveMinutes:estimateRoadMinutes(route.airMiles,prefs),path:route.path,firstLegMiles:route.firstLegMiles};
    }
    const airMiles=distanceMiles(airport.lat!,airport.lon!,place!.lat,place!.lon);
    return {airport,airMiles,planningRoadMiles:estimateRoadMiles(airMiles*2,prefs),
      planningDriveMinutes:estimateRoadMinutes(airMiles*2,prefs),path:[],firstLegMiles:airMiles};
  });
  picked.sort((a,b)=>a.planningDriveMinutes-b.planningDriveMinutes
     ||Number(b.airport.tier==='Major')-Number(a.airport.tier==='Major')
     ||a.airport.iata.localeCompare(b.airport.iata));
  return picked.slice(0,max);
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
  const warnings:string[]=[];
  if(first&&Number.isFinite(first.lat)&&Number.isFinite(first.lon)){
    if(people.length===plan.managerIds.length&&people.length>0){
      const loop=distanceItinerary(first,people,last);
      groundMiles=estimateRoadMiles(loop.airMiles,prefs);
      groundMinutes=estimateRoadMinutes(loop.airMiles,prefs);
    }else if(plan.destination&&Number.isFinite(plan.destination.lat)&&Number.isFinite(plan.destination.lon)){
      const outbound=distanceMiles(first.lat!,first.lon!,plan.destination.lat,plan.destination.lon);
      const inbound=last&&Number.isFinite(last.lat)&&Number.isFinite(last.lon)
        ? distanceMiles(plan.destination.lat,plan.destination.lon,last.lat!,last.lon!):outbound;
      groundMiles=estimateRoadMiles(outbound+inbound,prefs);
      groundMinutes=estimateRoadMinutes(outbound+inbound,prefs);
      if(plan.managerIds.length)warnings.push('Some manager locations are missing; ground travel only uses the selected city.');
    }else warnings.push('Ground travel cannot be estimated until a destination is mapped.');
  }else warnings.push('Destination airport coordinates unavailable.');
  if(Number.isFinite(quote.verifiedGroundMiles)&&Number(quote.verifiedGroundMiles)>0)
    groundMiles=Number(quote.verifiedGroundMiles);
  if(Number.isFinite(quote.verifiedGroundMinutes)&&Number(quote.verifiedGroundMinutes)>0)
    groundMinutes=Number(quote.verifiedGroundMinutes);
  if(!quote.verifiedGroundMiles||!quote.verifiedGroundMinutes)
    warnings.push('Ground distance and/or travel time use geographic estimates, not a road-routing service.');
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
    {name:'Fuel / charging planning allowance',amount:groundMiles*prefs.fuelPerMile},
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
  return {quote,cash,totalMinutes,economicCost,fare:quote.fare,groundMinutes,groundMiles,homeTravelMinutes,
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
