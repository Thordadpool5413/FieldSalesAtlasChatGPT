
import { geoAlbersUsa,geoPath } from 'd3-geo';
import { ChevronLeft,Layers2,Map as MapIcon,MapPin } from 'lucide-react';
import { useMemo } from 'react';
import { feature } from 'topojson-client';
import type { Airport,Assignment,Manager } from './opsModels';
import { STATES,STATE_BY_CODE } from './opsModels';
type GeoShape={id:string|number;properties?:{name?:string};geometry:unknown};
type GeoCollection={features:GeoShape[]};
type Props = {
  atlas:unknown; state:string; mode:'national'|'state'; onState:(s:string)=>void;
  onNational:()=>void; showCounties:boolean; showAirports:boolean; airports:Airport[];
  managers:Manager[]; assignments:Assignment[]; onCounty:(fips:string)=>void;
  onAirport:(iata:string)=>void;
};
export default function TerritoryMap({
  atlas,state,mode,onState,onNational,showCounties,showAirports,airports,managers,assignments,onCounty,onAirport,
}:Props){
  const geo=useMemo(()=>{
    if(!atlas)return null;
    try {
      const topology=atlas as {objects:{states:unknown;counties?:unknown}};
      const us=feature(atlas as never,topology.objects.states as never) as unknown as GeoCollection;
      const countyCollection=topology.objects.counties
        ? feature(atlas as never,topology.objects.counties as never) as unknown as GeoCollection
        : {features:[]};
      const fips=STATES.find(s=>s.code===state)?.fips||'12';
      const chosen=us.features.find(f=>String(f.id).padStart(2,'0')===fips);
      const projection=geoAlbersUsa();
      projection.fitExtent([[31,32],[949,513]],(mode==='state'&&chosen?chosen:us) as never);
      return {states:us.features,counties:countyCollection.features,projection,path:geoPath(projection),fips};
    } catch {return null;}
  },[atlas,state,mode]);
  const trainerKeys=[...new Set(managers.map(m=>m.trainer.trim()||m.name))];
  const palette=['var(--at-cyan)','var(--at-rose)','#9E85EA','#E7B675','#61C5A8','#A0B5CB'];
  const trainerColor=(id:string)=> {
    const person=managers.find(m=>m.id===id);
    const key=person?.trainer.trim()||person?.name||id;
    const index=trainerKeys.indexOf(key);
    return palette[Math.max(0,index)%palette.length];
  };
  const legendEntries=trainerKeys.slice(0,6).map((key,i)=>({
    key, color:palette[i%palette.length],
  }));
  if(!geo)return <div className="atlas-map-fallback">
    <MapIcon size={34}/><strong>Map outlines could not be loaded</strong>
    <p>Use the state list. The map uses public geography hosted separately from Field Sales Atlas.</p>
    <div className="atlas-fallback-states">{STATES.map(s=><button key={s.code} onClick={()=>onState(s.code)}>{s.code}</button>)}</div>
  </div>;
  const fips=geo.fips;
  const counties=geo.counties.filter(f=>String(f.id).padStart(5,'0').startsWith(fips));
  const current=geo.states.find(f=>String(f.id).padStart(2,'0')===fips);
  const currentAssignments=assignments.filter(a=>a.stateCode===state);
  const countyAssignment=(code:string)=>currentAssignments.find(a=>a.areaType==='county'&&a.areaCode===code&&a.role==='Primary')
    || currentAssignments.find(a=>a.areaType==='county'&&a.areaCode===code)
    || currentAssignments.find(a=>a.areaType==='state'&&a.role==='Primary')
    || currentAssignments.find(a=>a.areaType==='state');
  const fillForState=(s:string)=>{
    const a=assignments.find(a=>a.stateCode===s&&a.areaType==='state'&&a.role==='Primary')
      || assignments.find(a=>a.stateCode===s&&a.areaType==='state')
      || assignments.find(a=>a.stateCode===s);
    return a ? trainerColor(a.managerId) : 'var(--at-map-land)';
  };
  const airportList=airports.filter(a=>
    a.lat!==undefined&&a.lon!==undefined &&
    (mode==='national'?(a.tier==='Major'&&a.scheduled!==false):(a.state===state))
  );
  return <div className="atlas-map-wrap">
    <div className="atlas-map-actions">
      {mode==='state'?<button className="map-back" onClick={onNational}><ChevronLeft size={15}/> National overview</button>:<span className="map-context"><MapPin size={14}/> Interactive US coverage</span>}
      <span className="map-context-right">{mode==='state'?'County-level view · '+STATE_BY_CODE[state]?.name:'Select a state to inspect'}</span>
    </div>
    <svg viewBox="0 0 980 548" role="group" aria-label={mode==='national'?'United States territory map':'County map of '+STATE_BY_CODE[state]?.name} className="atlas-geography-svg">
      <defs><clipPath id="atlas-view-clip"><rect x="6" y="5" width="968" height="535" rx="5"/></clipPath></defs>
      <g clipPath="url(#atlas-view-clip)">
        {mode==='national'?
          geo.states.map(f=>{
            const s=STATES.find(s=>s.fips===String(f.id).padStart(2,'0'));
            if(!s)return null;
            return <path key={s.code} d={geo.path(f as never)||''} fill={fillForState(s.code)} fillOpacity={assignments.some(a=>a.stateCode===s.code)?0.67:1} stroke="var(--at-map-stroke)" strokeWidth="1.45" vectorEffect="non-scaling-stroke" className="atlas-region-shape" onClick={()=>onState(s.code)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onState(s.code);}}}><title>{s.name+' · '+assignments.filter(a=>a.stateCode===s.code).length+' assignments'}</title></path>;
          }):
          <>
            {current&&<path d={geo.path(current as never)||''} fill="var(--at-map-land)" stroke="var(--at-map-stroke)" strokeWidth={2} vectorEffect="non-scaling-stroke"/>}
            {showCounties&&counties.map(f=>{
              const id=String(f.id).padStart(5,'0');
              const matching=countyAssignment(id);
              const covering=currentAssignments.filter(a=>(a.areaType==='county'&&a.areaCode===id)||a.areaType==='state');
              const coveringManagers=[...new Set(covering.map(a=>a.managerId))];
              const shared=coveringManagers.length>1;
              return <path key={id} d={geo.path(f as never)||''} fill={matching?trainerColor(matching.managerId):'var(--at-map-land)'}
                fillOpacity={matching?0.7:1} stroke={shared?'var(--at-rose)':'var(--at-map-stroke)'} strokeWidth={shared?2.4:1.35} vectorEffect="non-scaling-stroke"
                className="atlas-region-shape" onClick={()=>onCounty(id)} role="button" tabIndex={0}
                onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onCounty(id);}}}>
                <title>{id+(matching?' · '+managers.find(m=>m.id===matching.managerId)?.name+' ('+matching.role+')':' · not assigned')+(shared?' · '+coveringManagers.length+' managers with overlapping area coverage':'')}</title>
              </path>;
            })}
          </>
        }
        {showAirports&&airportList.map(a=>{
          const pos=geo.projection([a.lon!,a.lat!]);
          if(!pos)return null;
          const rad=mode==='national'?3.3:a.tier==='Major'?5.5:4;
          return <g key={a.iata+a.state} className="atlas-airport-pin" onClick={()=>onAirport(a.iata)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onAirport(a.iata);}}}>
            <circle cx={pos[0]} cy={pos[1]} r={rad+2} fill="var(--at-map-water)" opacity=".94"/>
            <circle cx={pos[0]} cy={pos[1]} r={rad} fill={a.scheduled===true?'var(--at-rose)':'var(--at-map-stroke)'} stroke="var(--at-map-water)" strokeWidth="1.1"/>
            {mode==='state'&&a.tier==='Major'&&<text x={pos[0]+8} y={pos[1]-7} fontSize="11" fontWeight="700" fill="var(--at-map-label)">{a.iata}</text>}
            <title>{a.name+' ('+a.iata+') · '+(a.scheduled?'scheduled service listed':'service not confirmed')}</title>
          </g>;
        })}
      </g>
    </svg>
    <div className="atlas-map-legend">
      <span><i className="legend-swatch unassigned"/> Unassigned</span>
      {legendEntries.map(entry=><span key={entry.key}><i className="legend-swatch" style={{background:entry.color}}/> {entry.key}</span>)}
      {mode==='state'&&<span><i className="legend-swatch" style={{background:'var(--at-rose-soft)',border:'2px solid var(--at-rose)'}}/> Shared coverage</span>}
      {showAirports&&<span><i className="legend-swatch airport"/> Airport</span>}
      <span className="legend-note"><Layers2 size={13}/> Map lines are geographic boundaries, not routing estimates</span>
    </div>
  </div>;
}
