import { z } from 'zod';
import { curatedAirportDirectory } from '../providers/airports';
import { roadMatrix } from '../providers/routing';
import { evidenceState } from '../providers/evidence';
import type { ScenarioBoard } from './scenarios';
import type { RoadPlanningResult } from '../../shared/travel/roadPlanning';
import type { Point } from '../../shared/travel/types';

export const roadPlanningInput=z.object({managerIds:z.array(z.string().min(1).max(90)).max(12).default([]),
  airportCodes:z.array(z.string().regex(/^[A-Z]{3}$/)).max(12).default([]),
  destination:z.object({name:z.string().min(1).max(180),lat:z.number().min(-90).max(90),lon:z.number().min(-180).max(180)}).nullable().optional()});
function miles(a:Point,b:Point){const rad=(n:number)=>n*Math.PI/180;
  return 3958.8*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2)));}
export async function planningRoads(input:z.infer<typeof roadPlanningInput>,board:ScenarioBoard):Promise<RoadPlanningResult>{
  if(board.truncated)throw Error('Complete workspace records are required before road comparisons.');
  const ids=[...new Set(input.managerIds)],people=ids.map(id=>board.managers?.find(person=>person.id===id));
  if(people.some(person=>!person || !Number.isFinite(person.lat)||!Number.isFinite(person.lon)))throw Error('Every selected manager needs a saved mapped location.');
  const targets:Point[]=people.map(person=>({id:person!.id,name:person!.name,lat:person!.lat!,lon:person!.lon!}));
  if(!targets.length && input.destination)targets.push({id:'planning-destination',...input.destination});
  if(!targets.length)throw Error('Choose a mapped manager or a sourced destination before comparing roads.');
  const reference=await curatedAirportDirectory();
  const base:RoadPlanningResult={available:false,checkedAt:new Date().toISOString(),network:null,gateways:[],evidence:[],limitation:''};
  if(!reference.available)return {...base,limitation:'The public airport reference is unavailable. Refresh the reference before comparing arrival airports.'};
  const known=reference.airports.filter(airport=>Number.isFinite(airport.lat)&&Number.isFinite(airport.lon));
  const requested=[...new Set(input.airportCodes)].map(code=>known.find(airport=>airport.iata===code));
  if(requested.some(airport=>!airport))throw Error('A selected airport is missing from the validated public reference.');
  const near=known.filter(airport=>airport.scheduled).map(airport=>({airport,closest:Math.min(...targets.map(point=>
    miles({id:airport.iata,name:airport.name,lat:airport.lat!,lon:airport.lon!},point)))}))
    .sort((a,b)=>a.closest-b.closest).slice(0,6).map(item=>item.airport);
  const airports=[...new Map([...requested,...near].filter(airport=>!!airport).map(airport=>[airport!.iata,airport!])).values()].slice(0,12);
  if(!airports.length)return {...base,limitation:'No airport reference candidates are available for this destination.'};
  const points:Point[]=[...airports.map(airport=>({id:airport.iata,name:airport.name,lat:airport.lat!,lon:airport.lon!})),...targets];
  const matrix=await roadMatrix(points);
  const result:RoadPlanningResult={...base,network:{points,matrix},evidence:[matrix.evidence,{
    id:reference.checksum || 'airport-reference-unknown',provider:'OurAirports',subject:'Planning airport coordinates',
    sourceUrl:reference.sourceUrl,kind:'reference',state:reference.stale?'stale':'reference',retrievedAt:reference.checkedAt,
    version:reference.checksum || 'unknown',scope:'Public airport identifiers, coordinates and published service flags.',
    limitation:reference.message+'. '+reference.limitation,
  }],limitation:matrix.evidence.limitation};
  if(!matrix.roadBased || evidenceState(matrix.evidence)!=='current')return result;
  const gateways=airports.flatMap((airport,start)=>{
    let cursor=start,minutes=0,distance=0,firstLegMinutes=0,firstLegMiles=0;
    const remaining=targets.map((_,index)=>airports.length+index),pathIds:string[]=[];
    while(remaining.length){
      const available=remaining.filter(next=>matrix.durations[cursor]?.[next]!==null&&matrix.durations[cursor]?.[next]!==undefined
        &&matrix.distances[cursor]?.[next]!==null&&matrix.distances[cursor]?.[next]!==undefined)
        .sort((a,b)=>matrix.durations[cursor][a]!-matrix.durations[cursor][b]!);
      const next=available[0];if(next===undefined)return [];
      const leg=matrix.durations[cursor][next]!,length=matrix.distances[cursor][next]!;
      if(!pathIds.length){firstLegMinutes=leg;firstLegMiles=length;}
      minutes+=leg;distance+=length;pathIds.push(points[next].id);remaining.splice(remaining.indexOf(next),1);cursor=next;
    }
    const back=matrix.durations[cursor][start],length=matrix.distances[cursor][start];
    if(back===null||back===undefined||length===null||length===undefined)return [];
    return [{airport,airMiles:miles(points[start],targets[0]),planningRoadMiles:distance+length,
      planningDriveMinutes:minutes+back,firstLegMinutes,firstLegMiles,pathIds}];
  }).sort((a,b)=>a.planningDriveMinutes-b.planningDriveMinutes);
  return {...result,available:gateways.length>0,gateways,limitation:gateways.length
    ?'Road-network model estimates, excluding live traffic, closures and border queues. Candidate airports are shortlisted geographically; flight service and seats require airline verification.'
    :'No complete drivable circuit was returned for the selected locations. No geographic replacement was assigned.'};
}
