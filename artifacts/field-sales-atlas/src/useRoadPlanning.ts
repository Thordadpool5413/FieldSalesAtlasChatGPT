import { useEffect, useRef, useState } from 'react';
import { useOp } from './Operations';
import { api } from './workspaceApi';
import type { RoadPlanningResult } from '../shared/travel/roadPlanning';
import type { Gateway, TravelPlace } from './TravelLogic';
import { describeEvidence } from '../shared/travel/evidence';

function validResult(value:unknown):value is RoadPlanningResult {
  const result=value as RoadPlanningResult;
  if(!result || typeof result.available!=='boolean' || !Array.isArray(result.gateways) || !Array.isArray(result.evidence) || typeof result.limitation!=='string')return false;
  const network=result.network;
  if(network){
    const n=network.points?.length;
    if(!n || n>26 || network.points.some(point=>!Number.isFinite(point.lat)||!Number.isFinite(point.lon)))return false;
    if(!network.matrix?.evidence || typeof network.matrix.evidence.scope!=='string' || typeof network.matrix.roadBased!=='boolean')return false;
    for(const matrix of [network.matrix.durations,network.matrix.distances])
      if(!Array.isArray(matrix)||matrix.length!==n||matrix.some(row=>!Array.isArray(row)||row.length!==n||row.some(item=>item!==null&&(!Number.isFinite(item)||item<0))))return false;
  }
  return result.gateways.every(item=>/^[A-Z]{3}$/.test(item.airport?.iata) && typeof item.airport.name==='string' && Array.isArray(item.pathIds)
    &&[item.planningDriveMinutes,item.planningRoadMiles,item.firstLegMinutes,item.firstLegMiles].every(number=>Number.isFinite(number)&&number>=0));
}
export default function useRoadPlanning({managerIds,destination,airportCodes=[]}:{managerIds:string[];destination?:TravelPlace|null;airportCodes?:string[]}) {
  const ctx=useOp(),serial=useRef(0);
  const query={managerIds:[...new Set(managerIds)].sort(),destination:destination?{name:destination.name,lat:destination.lat,lon:destination.lon}:null,
    airportCodes:[...new Set(airportCodes.filter(code=>/^[A-Z]{3}$/.test(code)))].sort().slice(0,12)};
  const key=JSON.stringify([ctx.board.team?.id,ctx.board.revision,query]);
  const [snapshot,setSnapshot]=useState<{key:string;result?:RoadPlanningResult;error?:string}|null>(null);
  const [pass,setPass]=useState(0),[clock,setClock]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),60000);return ()=>clearInterval(timer);},[]);
  const enabled=ctx.identity==='member' && (query.managerIds.length>0 || !!query.destination);
  useEffect(()=>{
    const request=++serial.current;
    if(!enabled)return;
    const timer=setTimeout(()=>{
      void api.post('/api/travel/road-planning',query).then(response=>{
        if(!validResult(response.data))throw Error('The road-planning response is incompatible. Update the API before comparing travel times.');
        if(request===serial.current)setSnapshot({key,result:response.data});
      }).catch(failure=>{if(request===serial.current)setSnapshot({key,error:failure instanceof Error?failure.message:'Road estimates are unavailable.'});});
    },250);
    return ()=>{clearTimeout(timer);serial.current++;};
  },[key,enabled,pass]);
  const result=enabled && snapshot?.key===key?snapshot.result:null;
  const expired=result?.network && describeEvidence(result.network.matrix.evidence,clock).state!=='current';
  const network=result?.available && !expired?result.network || undefined:undefined;
  const gateways:Gateway[]=network?(result?.gateways || []).map(gateway=>({...gateway,path:gateway.pathIds.flatMap(id=>ctx.board.managers?.find(person=>person.id===id)||[])})):[];
  return {result,network,gateways,loading:enabled && snapshot?.key!==key,error:enabled&&snapshot?.key===key?snapshot.error:'',
    limitation:expired?'Road estimates expired. Refresh before comparing or scheduling.':result?.limitation || '',
    refresh:()=>{setSnapshot(null);setPass(value=>value+1);}};
}
