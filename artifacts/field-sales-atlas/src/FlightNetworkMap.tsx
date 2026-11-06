import { geoAlbersUsa,geoPath } from 'd3-geo';
import { ArrowRight,MapPinned,Plane } from 'lucide-react';
import { useEffect,useMemo,useRef } from 'react';
import { feature } from 'topojson-client';
import './FlightNetworkMap.css';
import { useOp } from './Operations';
import type { Airport } from './opsModels';
import usTopology from './us-states-10m.json';

type Props={origin:string;connection:string;destination:string;alternate:string};
type Node={
  code:string;
  airport:Airport;
  role:'departure'|'connection'|'arrival'|'alternative';
  x:number;
  y:number;
};
type Shape={type:string;features:Array<{id:string|number;properties?:Record<string,unknown>}>};
const width=800;
const height=340;
function arc(a:Node,b:Node){
  const dx=b.x-a.x,dy=b.y-a.y;
  const distance=Math.hypot(dx,dy);
  const curve=Math.min(47,distance*.20);
  const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
  const sign=dx>=0?-1:1;
  const norm=Math.max(distance,1);
  return 'M '+a.x.toFixed(1)+' '+a.y.toFixed(1)+' Q '+
    (mx+sign*dy/norm*curve).toFixed(1)+' '+
    (my-sign*dx/norm*curve).toFixed(1)+' '+
    b.x.toFixed(1)+' '+b.y.toFixed(1);
}
export default function FlightNetworkMap({origin,connection,destination,alternate}:Props){
  const ctx=useOp();
  const mapViewport=useRef<HTMLDivElement|null>(null);
  const visual=useMemo(()=>{
    const topo=usTopology as unknown as {objects:{states:unknown}};
    const geography=feature(usTopology as never,topo.objects.states as never) as unknown as Shape;
    const projection=geoAlbersUsa().fitExtent([[23,25],[width-23,height-36]],geography as never);
    const path=geoPath(projection);
    const states=geography.features.map(f=>({
      id:f.id,
      path:path(f as never)||''
    })).filter(row=>!!row.path);
    const byCode=new Map(ctx.airports.map(row=>[row.iata,row]));
    const codeList=[
      {code:origin,role:'departure' as const},
      {code:connection,role:'connection' as const},
      {code:destination,role:'arrival' as const},
      {code:alternate,role:'alternative' as const}
    ];
    const seen=new Set<string>();
    const nodes=codeList.filter(row=>/^[A-Z]{3}$/.test(row.code))
      .map(row=>({...row,airport:byCode.get(row.code)}))
      .filter((row):row is typeof row & {airport:Airport}=>!!row.airport&&
        Number.isFinite(row.airport.lat)&&Number.isFinite(row.airport.lon))
      .map(row=>{
        const p=projection([row.airport.lon!,row.airport.lat!]);
        return p?{...row,x:p[0],y:p[1]}:null;
      }).filter((row):row is Node=>!!row)
      .filter(row=>{
        if(seen.has(row.code))return false;
        seen.add(row.code);return true;
      });
    const get=(code:string)=>nodes.find(n=>n.code===code);
    const a=get(origin),b=get(connection),c=get(destination),d=get(alternate);
    const primary=a&&c?(b?[a,b,c]:[a,c]):[];
    const alternatives=a&&d?[a,d]:[];
    const hubs=ctx.airports.filter(item=>item.scheduled&&!seen.has(item.iata)&&
      ['SEA','LAX','SFO','DEN','DFW','ORD','ATL','MIA','MCO','JFK','BOS','MSP','PHX'].includes(item.iata))
      .slice(0,14).map(item=>{
        if(!Number.isFinite(item.lat)||!Number.isFinite(item.lon))return null;
        const p=projection([item.lon!,item.lat!]);
        return p?{iata:item.iata,x:p[0],y:p[1]}:null;
      }).filter((v):v is {iata:string;x:number;y:number}=>!!v);
    return {states,nodes,primary,alternatives,hubs};
  },[ctx.airports,origin,connection,destination,alternate]);
  useEffect(()=>{
    const viewport=mapViewport.current;
    if(!viewport||!window.matchMedia('(max-width:700px)').matches)return;
    const routeNodes=visual.nodes.filter(n=>n.role==='departure'||n.role==='arrival');
    const focus=routeNodes.length>0?
      routeNodes.reduce((sum,node)=>sum+node.x,0)/routeNodes.length:400;
    const position=focus/800*viewport.scrollWidth-viewport.clientWidth/2;
    viewport.scrollLeft=Math.max(0,Math.min(position,viewport.scrollWidth-viewport.clientWidth));
  },[visual]);
  return <section className="fn-root fn-territory" aria-label="Geographic airport corridor map">
    <header className="fn-head">
      <div>
        <span><MapPinned size={15}/> AIRPORT CORRIDORS / GEOGRAPHIC</span>
        <h2>Route & airport map</h2>
        <p>Actual geographic airport positions with a schematic route overlay.</p>
      </div>
      <button type="button" className="fn-open-atlas"
        onClick={()=>ctx.go('home')} aria-label="Open full territory Atlas">
        Full Atlas <ArrowRight size={16}/>
      </button>
    </header>
    <div className="fn-map" role="group" aria-label={
      visual.primary.length>=2?'Map of '+[origin,connection,destination].filter(Boolean).join(' via '):
        'Geographic map of the United States. Enter airports to display a flight corridor.'
    }>
      <div className="fn-map-viewport" ref={mapViewport} tabIndex={0}
        role="region" aria-label="Scrollable United States airport corridor map">
      <svg viewBox="0 0 800 340" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="fn-map-ocean" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#061b3b"/>
            <stop offset="54%" stopColor="#092d48"/>
            <stop offset="100%" stopColor="#221632"/>
          </linearGradient>
          <radialGradient id="fn-land-glow">
            <stop offset="0%" stopColor="#134e6b"/>
            <stop offset="100%" stopColor="#092a46"/>
          </radialGradient>
          <linearGradient id="fn-corridor">
            <stop offset="0%" stopColor="#3ffcf7"/>
            <stop offset="58%" stopColor="#23d1e9"/>
            <stop offset="100%" stopColor="#ff58b6"/>
          </linearGradient>
          <filter id="fn-corridor-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5.5"/>
          </filter>
          <pattern id="fn-grid" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#50c9ee" strokeOpacity=".13" strokeWidth=".8"/>
          </pattern>
        </defs>
        <rect width="800" height="340" fill="url(#fn-map-ocean)"/>
        <rect width="800" height="340" fill="url(#fn-grid)"/>
        {visual.states.map(state=><path key={state.id} d={state.path}
          fill="url(#fn-land-glow)" stroke="#269abd" strokeWidth="0.75" strokeOpacity=".59"/>)}
        {visual.hubs.map(hub=><g key={hub.iata}>
          <circle cx={hub.x} cy={hub.y} r="5.5" fill="#0ac8ee" opacity=".13"/>
          <circle cx={hub.x} cy={hub.y} r="1.7" fill="#74e7e9" opacity=".74"/>
        </g>)}
        {visual.primary.length>=2&&
          visual.primary.slice(1).map((next,i)=>{
            const d=arc(visual.primary[i],next);
            return <g key={'primary'+i}>
              <path d={d} stroke="#39f4f4" strokeWidth="11" strokeOpacity=".48"
                fill="none" strokeLinecap="round" filter="url(#fn-corridor-glow)"/>
              <path d={d} stroke="url(#fn-corridor)" strokeWidth="3.3"
                fill="none" strokeLinecap="round"/>
            </g>;
          })}
        {visual.alternatives.length===2&&<path d={arc(visual.alternatives[0],visual.alternatives[1])}
          stroke="#ff5ab7" strokeWidth="2.5" strokeDasharray="8 7"
          strokeLinecap="round" fill="none" opacity=".88"/>}
        {visual.nodes.map((node)=><g key={node.code}>
          <circle cx={node.x} cy={node.y} r="20" fill={node.role==='alternative'?'#ff5eb6':'#40e9ee'} opacity=".16"/>
          <circle cx={node.x} cy={node.y} r="12" fill="#051b36" stroke={node.role==='alternative'?'#ff69b9':'#4ffefa'} strokeWidth="3"/>
          <circle cx={node.x} cy={node.y} r="4.5" fill={node.role==='alternative'?'#ff69b9':'#4ffefa'}/>
          <g transform={'translate('+Math.max(3,Math.min(724,node.x+14))+','+
            Math.max(17,Math.min(305,node.y-35))+')'}>
            <rect x="0" y="0" width="72" height="30" rx="7" fill="#071b36"
              stroke={node.role==='alternative'?'#ff69b9':'#54f8f0'} strokeWidth="1.3"/>
            <text x="36" y="20" textAnchor="middle" fill="#f6ffff"
              fontSize="16" fontWeight="800">{node.code}</text>
          </g>
          <title>{node.role}: {node.airport.name}</title>
        </g>)}
      </svg>
      </div>
      <div className="fn-pan-hint" aria-hidden="true">⇆ Swipe across the map to explore airports</div>
      {visual.primary.length<2&&<div className="fn-map-overlay">
        <MapPinned size={22}/>
        <strong>Plot a real airport corridor</strong>
        <span>Enter departure and arrival codes above. Geography is from public U.S. state boundaries.</span>
      </div>}
      <div className="fn-legend">
        <span><i className="fn-main"/> {visual.primary.length>=2?'Your selected corridor':'Actual U.S. geography'}</span>
        {visual.alternatives.length===2&&<span><i className="fn-alt"/> Alternate airport</span>}
        <span className="fn-map-verified">MAP REFERENCE / NOT A LIVE AIRCRAFT TRACKER</span>
      </div>
    </div>
    <p className="fn-disclaimer">
      <Plane size={14}/> State outlines and airport positions reflect mapped coordinates.
      Lines are illustrative connectors, not filed airline routes or evidence of scheduled flights.
    </p>
  </section>;
}
