
import { geoAlbersUsa,geoGraticule,geoMercator,geoPath } from 'd3-geo';
import { ArrowRight,CalendarCheck,CalendarClock,ChevronDown,Compass,Info,Layers,List,Map as MapIcon,MapPin,Maximize2,Minimize2,Plane,PlaneTakeoff,Plus,Search,Sparkles,Users,X } from 'lucide-react';
import type { MouseEvent as SvgMouseEvent,PointerEvent as SvgPointerEvent } from 'react';
import { lazy,Suspense,useEffect,useMemo,useRef,useState } from 'react';
import { feature,merge } from 'topojson-client';
import { CANADA_REGIONS,CANADA_REGION_BY_CODE } from './CanadaRegions';
import { territoryPeople } from './fieldExperience';
import type { LiveMapHandle } from './LiveTerritoryMap';
import './MapIntelligence.css';
import OceanMasthead from './OceanMasthead';
import { useOp } from './Operations';
import type { Airport,Assignment,Manager } from './opsModels';
import { STATES,coachingPriority,dateLabel,today } from './opsModels';

type Geo={type:'FeatureCollection';features:Array<{type:'Feature';properties:Record<string,unknown>;geometry:unknown;id?:string|number}>};
type Region={code:string;name:string;country:'US'|'CA'};
type Props={
  atlas:unknown; airports:Airport[]; managers:Manager[]; assignments:Assignment[]; theme:'dark'|'light';
  onDestination:(region:Region,manager?:Manager,reference?:{lat:number;lon:number;label:string},arrivalAirport?:string)=>void;
  onAddManager:(code?:string)=>void;
};
const LiveTerritoryMap=lazy(()=>import('./LiveTerritoryMap'));
const CANADA_URL='/resources/geography/canada.geojson';
const EMPTY_CANADIAN_BOUNDARIES:Geo['features']=[];
const US_LOOKUP=Object.fromEntries(STATES.map(s=>[s.fips,s]));
function regionName(properties:Record<string,unknown>){
  return String(properties.name||properties.NAME||properties.nom||properties.province||'');
}
const CA_ALIASES:Record<string,string>={
  'Newfoundland and Labrador':'NL','Québec':'QC','Quebec':'QC','Northwest Territories':'NT',
  'Prince Edward Island':'PE','Nunavut':'NU','Yukon':'YT'
};
function canadaCode(properties:Record<string,unknown>){
  const raw=regionName(properties);
  return CA_ALIASES[raw]||CANADA_REGIONS.find(r=>r.name.toLowerCase()===raw.toLowerCase())?.code||
    String(properties.postal||properties.abbrev||properties.code||'').toUpperCase();
}
function validLocation(p:Manager){
  return typeof p.lat==='number'&&typeof p.lon==='number'&&Number.isFinite(p.lat)&&Number.isFinite(p.lon);
}
function sourceTimestamp(value:string){
  if(!value)return 'Not reported';
  const date=new Date(value);
  return Number.isFinite(date.getTime())
    ?date.toLocaleString([],{dateStyle:'medium',timeStyle:'short'})
    :'Not reported';
}
function compactSourceTime(value:string){
  if(!value)return 'Time not reported';
  const date=new Date(value);
  return Number.isFinite(date.getTime())
    ?date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})
    :'Time not reported';
}
export default function MiamiMapHome({atlas,airports,managers,assignments,theme,onDestination,onAddManager}:Props){
  const ctx=useOp();
  const {trainerProfiles}=ctx;
  const visits=ctx.board.visits||[];
  const coaching=ctx.board.coaching||[];
  const [canada,setCanada]=useState<Geo|null>(null);
  const [canadaError,setCanadaError]=useState(false);
  const [showMapWelcome]=useState(()=>{
    try{return localStorage.getItem('field-atlas-map-welcome-v1')!=='seen';}
    catch{return true;}
  });
  useEffect(()=>{
    if(!showMapWelcome)return;
    try{localStorage.setItem('field-atlas-map-welcome-v1','seen');}catch{}
  },[showMapWelcome]);
  const [region,setRegion]=useState<Region|null>(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem('field-atlas-focused-region-v1')||'null');
      const country=saved?.country==='CA'?'CA':'US';
      const match=country==='CA'?CANADA_REGIONS.find(r=>r.code===saved?.code):STATES.find(r=>r.code===saved?.code);
      return match?{code:match.code,name:match.name,country}:null;
    }catch{return null;}
  });
  const [hoveredRegion,setHoveredRegion]=useState<Region|null>(null);
  const [hoveredAirport,setHoveredAirport]=useState<Airport|null>(null);
  const [focusedManager,setFocusedManager]=useState<Manager|null>(null);
  const [selectedMapArea,setSelectedMapArea]=useState<{kind:'county'|'town';code:string;name:string;stateCode:string}|null>(null);
  const [showCounties,setShowCounties]=useState(true);
  const [showTowns,setShowTowns]=useState(true);
  const [trainer,setTrainer]=useState('all');
  const [query,setQuery]=useState('');
  const [listQuery,setListQuery]=useState('');
  const [viewMode,setViewMode]=useState<'map'|'list'>('map');
  const [searchIndex,setSearchIndex]=useState(0);
  // At a selected state, show the full set of scheduled gateway options.
  // The national view remains restrained to avoid overwhelming the map.
  const [airportLayer,setAirportLayer]=useState<'major'|'all'|'none'>('major');
  const [mapStyle,setMapStyle]=useState<'vice'|'roads'>('vice');
  // A real cartographic basemap is the first choice; the bundled SVG remains
  // visible until its tiles are ready, including when public tiles fail.
  const [showLiveMap,setShowLiveMap]=useState(()=>{
    if(typeof navigator==='undefined'||!navigator.onLine)return false;
    try{return localStorage.getItem('field-atlas-map-source-v9')!=='outline';}
    catch{return true;}
  });
  const [liveReady,setLiveReady]=useState(false);
  const chooseMapSource=(enabled:boolean)=>{
    setShowLiveMap(enabled);setLiveReady(false);
    try{localStorage.setItem('field-atlas-map-source-v9',enabled?'live':'outline');}
    catch{/* An unavailable storage API must never block map navigation. */}
  };
  const [liveZoom,setLiveZoom]=useState(100);
  const liveMapRef=useRef<LiveMapHandle|null>(null);
  const [showManagers,setShowManagers]=useState(true);
  const [showAssigned,setShowAssigned]=useState(true);
  const [showStateLabels,setShowStateLabels]=useState(true);
  const [countryScope,setCountryScope]=useState<'us'|'canada'>(region?.country==='CA'?'canada':'us');
  useEffect(()=>{
    try{
      if(region)localStorage.setItem('field-atlas-focused-region-v1',JSON.stringify(region));
      else localStorage.removeItem('field-atlas-focused-region-v1');
    }catch{}
  },[region?.code,region?.country]);
  useEffect(()=>{if(region)ctx.setState(region.code);},[]);
  const [mapLens,setMapLens]=useState<'territories'|'coaching'|'airports'|'visits'>(()=>{
    try{const lens=localStorage.getItem('field-atlas-lens-v2');return lens==='coaching'||lens==='airports'||lens==='visits'?lens:'territories';}
    catch{return 'territories';}
  });
  const priorities=useMemo(()=>Object.fromEntries(managers.map(m=>[
    m.id,coachingPriority(m,visits,coaching).level.toLowerCase()
  ])) as Record<string,string>,[managers,visits,coaching]);
  const regionPriorities=useMemo(()=>{
    const result:Record<string,'high'|'moderate'|'routine'>={};
    const rank={high:3,moderate:2,routine:1};
    for(const person of managers){
      if(person.coachingStatus==='Paused')continue;
      const urgency=(priorities[person.id]==='high'?'high':
        priorities[person.id]==='moderate'?'moderate':'routine') as keyof typeof rank;
      const codes=new Set([person.baseState,...assignments.filter(a=>a.managerId===person.id).map(a=>a.stateCode)].filter((code): code is string => !!code));
      for(const code of codes){
        if(!result[code]||rank[urgency]>rank[result[code]])result[code]=urgency;
      }
    }
    return result;
  },[managers,assignments,priorities]);
  const [visitHorizon,setVisitHorizon]=useState<7|30|90>(()=>{
    try{
      const stored=Number(localStorage.getItem('field-atlas-visit-horizon-v1'));
      return stored===7||stored===90?stored:30;
    }catch{return 30;}
  });
  function updateVisitHorizon(days:7|30|90){
    setVisitHorizon(days);
    try{localStorage.setItem('field-atlas-visit-horizon-v1',String(days));}catch{}
  }
  const visitCounts=useMemo(()=>{
    const now=today(),limit=new Date(now+'T12:00:00Z');
    limit.setUTCDate(limit.getUTCDate()+visitHorizon-1);
    const horizon=limit.toISOString().slice(0,10);
    const counted:Record<string,number>={};
    for(const visit of visits)if(
      ['Planned','Rescheduled'].includes(visit.status) &&
      visit.date>=now && visit.date<=horizon && visit.stateCode
    )counted[visit.stateCode]=(counted[visit.stateCode]||0)+1;
    return counted;
  },[visits,visitHorizon]);
  function switchLens(next:'territories'|'coaching'|'airports'|'visits'){
    setMapLens(next);setShowAssigned(next==='territories');
    setShowManagers(next==='territories'||next==='coaching');setAirportLayer(next==='airports'?'all':next==='coaching'||next==='visits'?'none':'major');
    setPanelTab(next==='airports'?'airports':next==='coaching'?'managers':'coverage');
    try{localStorage.setItem('field-atlas-lens-v2',next);}catch{}
  }
  useEffect(()=>{
    setShowAssigned(mapLens==='territories');setShowManagers(mapLens==='territories'||mapLens==='coaching');
    setAirportLayer(mapLens==='airports'?'all':mapLens==='coaching'||mapLens==='visits'?'none':'major');
  },[]);
  const [layerMenu,setLayerMenu]=useState(false);
  const [panelTab,setPanelTab]=useState<'managers'|'airports'|'coverage'>('managers');
  const [panelQuery,setPanelQuery]=useState('');
  const [airportFilter,setAirportFilter]=useState('');
  const [showAllRegionalAirports,setShowAllRegionalAirports]=useState(false);
  const [homeCode,setHomeCode]=useState('');
  const [mapHint,setMapHint]=useState('');
  const [focusMap,setFocusMap]=useState(false);
  const [selectedAirportId,setSelectedAirportId]=useState('');
  const frameRef=useRef<HTMLDivElement>(null);
  const [viewport,setViewport]=useState({w:990,h:570});
  const mapW=viewport.w, mapH=viewport.h;
  useEffect(()=>{
    const frame=frameRef.current;
    if(!frame)return;
    const update=()=>{
      const rect=frame.getBoundingClientRect();
      if(rect.width>0&&rect.height>0){
        const w=Math.round(rect.width),h=Math.round(rect.height);
        setViewport(old=>old.w===w&&old.h===h?old:{w,h});
      }
    };
    update();
    if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(update);
    observer.observe(frame);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    setZoom(1);
    setPan({x:0,y:0});
  },[countryScope]);
  const searchInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    function onHotkey(e:KeyboardEvent){
      const el=e.target as HTMLElement|null;
      const editing=!!el&&(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)||el.isContentEditable);
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){
        e.preventDefault();searchInput.current?.focus();return;
      }
      if(e.key==='/'&&!editing&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
        e.preventDefault();searchInput.current?.focus();return;
      }
      if(e.key==='Escape'){
        if(focusMap)setFocusMap(false);
        if(query)setQuery('');
        if(layerMenu)setLayerMenu(false);
        if(document.activeElement===searchInput.current)searchInput.current?.blur();
      }
    }
    window.addEventListener('keydown',onHotkey);
    return ()=>window.removeEventListener('keydown',onHotkey);
  },[focusMap,query,layerMenu]);

  const [zoom,setZoom]=useState(1);
  const [pan,setPan]=useState({x:0,y:0});
  const [panning,setPanning]=useState(false);
  const pointerDrag=useRef<{pointerId:number;startX:number;startY:number;originX:number;originY:number;moved:boolean}|null>(null);
  const skipClickAfterDrag=useRef(false);
  function beginMapDrag(e:SvgPointerEvent<SVGSVGElement>){
    if(zoom<=1.001||(e.pointerType==='mouse'&&e.button!==0))return;
    skipClickAfterDrag.current=false;
    pointerDrag.current={
      pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,
      originX:pan.x,originY:pan.y,moved:false
    };
  }
  function moveMapDrag(e:SvgPointerEvent<SVGSVGElement>){
    const d=pointerDrag.current;
    if(!d||e.pointerId!==d.pointerId)return;
    const dx=e.clientX-d.startX,dy=e.clientY-d.startY;
    if(!d.moved&&Math.hypot(dx,dy)>7){
      d.moved=true;setPanning(true);
      try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}
    }
    if(!d.moved)return;
    const rect=e.currentTarget.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const maxX=(mapW/2)*(zoom-1),maxY=(mapH/2)*(zoom-1);
    const x=d.originX+dx*mapW/rect.width,y=d.originY+dy*mapH/rect.height;
    setPan({x:Math.max(-maxX,Math.min(maxX,x)),y:Math.max(-maxY,Math.min(maxY,y))});
  }
  function endMapDrag(e:SvgPointerEvent<SVGSVGElement>){
    const d=pointerDrag.current;
    if(d&&d.pointerId===e.pointerId){
      if(d.moved)skipClickAfterDrag.current=true;
      try{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}catch{}
    }
    pointerDrag.current=null;setPanning(false);
  }
  function captureMapClick(e:SvgMouseEvent<SVGSVGElement>){
    if(skipClickAfterDrag.current){
      e.preventDefault();e.stopPropagation();
      skipClickAfterDrag.current=false;
    }
  }
  const trainers=useMemo(()=>[...new Set([...trainerProfiles.map(p=>p.name),...managers.map(m=>m.trainer).filter(Boolean)])],[trainerProfiles,managers]);
  const colors=useMemo(()=>Object.fromEntries(trainers.map((name)=>[
    name,trainerProfiles[0]?.name===name?(theme==='dark'?'#5ceaf5':'#087887'):trainerProfiles[1]?.name===name?(theme==='dark'?'#ff5bc8':'#b42b7b'):'#8093ad'
   ])),[trainers,trainerProfiles,theme]);
  function managerSummary(m:Manager){
    const history=visits.filter(v=>v.managerId===m.id&&v.status==='Completed').map(v=>v.date).sort();
    const future=visits.filter(v=>v.managerId===m.id&&['Planned','Rescheduled'].includes(v.status)&&v.date>=today()).map(v=>v.date).sort();
    return {last:history.at(-1)||'',next:future[0]||'',priority:coachingPriority(m,visits,coaching)};
  }
  useEffect(()=>{
    const controller=new AbortController();
    fetch(CANADA_URL,{signal:controller.signal}).then(r=>{
      if(!r.ok)throw Error('Canadian boundaries unavailable');return r.json();
    }).then(data=>{if(data.type==='FeatureCollection'&&Array.isArray(data.features))setCanada(data);else setCanadaError(true);})
      .catch(()=>{if(!controller.signal.aborted)setCanadaError(true);});
    return ()=>controller.abort();
  },[]);
  const geography=useMemo(()=>{
    if(!atlas)return null;
    try{
      const topology=atlas as {objects:{states:unknown}};
      const collection=feature(atlas as never,topology.objects.states as never) as unknown as Geo;
      const usa=collection.features.filter(f=>!['02','15','72'].includes(String(f.id).padStart(2,'0')));
      const ca=canada?.features.filter(f=>CANADA_REGION_BY_CODE[canadaCode(f.properties||{})])||[];
      const insets:Record<string,string>={};
      for(const item of [{code:'AK',fips:'02',rotate:153},{code:'HI',fips:'15',rotate:157}]){
        const outline=collection.features.find(f=>String(f.id).padStart(2,'0')===item.fips);
        if(!outline)continue;
        try{
          const camera=geoMercator().rotate([item.rotate,0])
            .fitExtent([[8,7],[112,63]],outline as never);
          insets[item.code]=geoPath(camera)(outline as never)||'';
        }catch{/* Existing inset buttons remain operable. */}
      }
      const margin=Math.max(14,Math.min(40,mapW*.028));
      const extent:[[number,number],[number,number]]=[
        [margin,Math.max(24,mapH*.065)],
        [mapW-margin,mapH-Math.max(42,mapH*.1)]
      ];
      const canadaView=countryScope==='canada'&&ca.length>0;
      const shapes={type:'FeatureCollection',features:canadaView?ca:usa};
      const projection=canadaView
        ?geoMercator().fitExtent(extent,shapes as never)
        :geoAlbersUsa().fitExtent(extent,shapes as never);
      // An actual geographic exterior outline, calculated from source topology.
      // No raster tiles or geographically misleading decorative coastline.
      const geometries=(topology.objects.states as {geometries?:Array<{id?:number|string}>}).geometries||[];
      const lower48=geometries.filter(g=>!['02','15','72'].includes(String(g.id).padStart(2,'0')));
      // Exterior rim is an enhancement, never a dependency for map availability.
      let outline='';
      if(!canadaView&&lower48.length){
        try{outline=geoPath(projection)(merge(atlas as never,lower48 as never) as never)||'';}
        catch{outline='';}
      }
      return {usa,canada:ca,projection,path:geoPath(projection),insets,canadaView,outline};
    }catch{return null;}
  },[atlas,canada,countryScope,mapW,mapH]);
  const selectedCenter=useMemo(()=>{
    if(!geography||!region||region.country!=='US')return null;
    const st=STATES.find(item=>item.code===region.code);
    const shape=st&&geography.usa.find(f=>String(f.id).padStart(2,'0')===st.fips);
    if(!shape)return null;
    const [x,y]=geography.path.centroid(shape as never);
    return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
  },[geography,region?.code,region?.country]);
  const graticulePath=useMemo(()=>{
    if(!geography)return '';
    const bounds:[[number,number],[number,number]]=countryScope==='canada'?[[-145,39],[-52,84]]:[[-127,23],[-66,51]];
    return geography.path(geoGraticule().extent(bounds).step([10,5])() as never)||'';
  },[geography,countryScope]);
  // Use real map geometry as a clearly labeled regional planning reference.
  // The centroid is never presented as a manager office or verified flight endpoint.
  function referenceForRegion(target:Region){
    if(target.country==='CA'){
      const found=CANADA_REGION_BY_CODE[target.code];
      return found?{lat:found.lat,lon:found.lon,label:found.anchorCity+' · provincial reference'}:undefined;
    }
    // Alaska and Hawaii are navigated with map inset buttons. Their references
    // are explicit major-city proxies, not the actual managers' addresses.
    if(target.code==='AK')return {lat:61.2181,lon:-149.9003,label:'Anchorage · Alaska planning reference'};
    if(target.code==='HI')return {lat:21.3099,lon:-157.8581,label:'Honolulu · Hawaii planning reference'};
    const st=STATES.find(x=>x.code===target.code);
    const shape=st&&geography?.usa.find(f=>String(f.id).padStart(2,'0')===st.fips);
    if(!shape||!geography)return undefined;
    const center=geography.path.centroid(shape as never);
    if(!center||center.some(v=>!Number.isFinite(v)))return undefined;
    const point=geography.projection.invert?.(center as [number,number]);
    if(!point||!point.every(Number.isFinite))return undefined;
    return {lat:point[1],lon:point[0],label:target.name+' · regional reference'};
  }
  function continueToTravel(target:Region,person?:Manager,arrivalAirport?:string){
    onDestination(target,person,referenceForRegion(target),arrivalAirport);
  }
  const visibleManagers=showManagers?managers.filter(m=>{
    if(trainer!=='all'&&m.trainer!==trainer)return false;
    const code=m.baseState||assignments.find(a=>a.managerId===m.id)?.stateCode||'';
    return countryScope==='canada'?Boolean(CANADA_REGION_BY_CODE[code]):
      !CANADA_REGION_BY_CODE[code]&&!['AK','HI'].includes(code);
  }):[];
  const relatedManagers=useMemo(()=>{
    if(!region)return [];
    return territoryPeople(managers,assignments,region.code);
  },[region,assignments,managers]);

  const pins=useMemo(()=>{
    if(!geography)return [];
    return visibleManagers.map(manager=>{
      let point:[number,number]|null=null,approx=false;
      if(validLocation(manager)){
        const projected=geography.projection([manager.lon!,manager.lat!]);
        if(projected)point=projected as [number,number];
      }else{
        const state=manager.baseState||assignments.find(a=>a.managerId===manager.id)?.stateCode||'';
        const province=CANADA_REGION_BY_CODE[state];
        if(province){const p=geography.projection([province.lon,province.lat]);if(p)point=p as [number,number];approx=true;}
        else{
          const us=STATES.find(x=>x.code===state);
          const polygon=us&&geography.usa.find(f=>String(f.id).padStart(2,'0')===us.fips);
          if(polygon){const c=geography.path.centroid(polygon as never);
            if(c.every(Number.isFinite))point=c as [number,number];
            approx=true;
          }
        }
      }
      if(!point||point[0]<-10||point[0]>mapW+10||point[1]<-10||point[1]>mapH+10)return null;
      return {manager,x:point[0],y:point[1],approx};
    }).filter((pin):pin is {manager:Manager;x:number;y:number;approx:boolean}=>!!pin);
  },[geography,visibleManagers,assignments,mapW,mapH]);
  const clusters=useMemo(()=>{
    const buckets=new Map<string,typeof pins>();
    for(const pin of pins){
      const key=Math.round(pin.x*zoom/21)+':'+Math.round(pin.y*zoom/21);
      const group=buckets.get(key)||[];
      group.push(pin);buckets.set(key,group);
    }
    return [...buckets.values()].map(group=>({
      x:group.reduce((sum,p)=>sum+p.x,0)/group.length,
      y:group.reduce((sum,p)=>sum+p.y,0)/group.length,
      members:group
    }));
  },[pins,zoom]);
  function focusPin(manager:Manager){
    const code=manager.baseState||assignments.find(a=>a.managerId===manager.id)?.stateCode||'';
    const ca=CANADA_REGION_BY_CODE[code],us=STATES.find(x=>x.code===code);
    if(ca||us)setRegion({code,name:ca?.name||us!.name,country:ca?'CA':'US'});
    setFocusedManager(manager);setPanelTab('managers');
  }
  const selectedAirports=region?airports
    .filter(a=>a.state===region.code&&a.scheduled)
    .sort((a,b)=>(a.tier==='Major'?0:1)-(b.tier==='Major'?0:1)||a.name.localeCompare(b.name)):[];
  const matchingAirports=selectedAirports.filter(a=>
    (a.iata+' '+a.name+' '+a.state).toLowerCase().includes(airportFilter.trim().toLowerCase())
  );
  const visibleRegionalAirports=matchingAirports.slice(0,showAllRegionalAirports?matchingAirports.length:10);
  const leadMarketManager=relatedManagers
    .map(person=>({person,priority:coachingPriority(person,visits,coaching)}))
    .filter(row=>row.priority.level==='High'||row.person.coachingStatus==='Needs attention')
    .sort((a,b)=>b.priority.score-a.priority.score)[0];
  const handleSelect=(selected:Region)=>{
    const hasManagers=managers.some(m=>m.baseState===selected.code||
      assignments.some(a=>a.managerId===m.id&&a.stateCode===selected.code));
    setCountryScope(selected.country==='CA'?'canada':'us');
    setRegion(selected);setFocusedManager(null);setPanelQuery('');setSelectedAirportId('');
    setAirportFilter('');setShowAllRegionalAirports(false);
    setSelectedMapArea(null);ctx.setSelectedCounty('');ctx.setState(selected.code);
    setPanelTab(mapLens==='airports'?'airports':mapLens==='coaching'?'managers':hasManagers?'managers':'airports');setMapHint('');
  };
  useEffect(()=>{
    const jump=ctx.atlasJump;
    if(!jump)return;
    const ca=jump.country==='CA'?CANADA_REGION_BY_CODE[jump.code]:null;
    const us=jump.country==='US'?STATES.find(item=>item.code===jump.code):null;
    if(ca||us){
      handleSelect({code:jump.code,name:ca?.name||us!.name,country:jump.country});
      setCountryScope(jump.country==='CA'?'canada':'us');
      if(jump.airport)setPanelTab('airports');
    }
    ctx.clearAtlasJump();
  },[ctx.atlasJump?.nonce]);

  const active=ctx.activeTrainer;
  useEffect(()=>setHomeCode(active.homeAirports[0]||''),[ctx.activeTrainerId,active.homeAirports.join(',')]);
  const stateAirports=selectedAirports;
  const majorCount=stateAirports.filter(a=>a.tier==='Major').length;
  const secondaryCount=stateAirports.filter(a=>a.tier!=='Major').length;
  const panelManagers=relatedManagers.filter(m=>(m.name+' '+(m.baseCity||'')).toLowerCase().includes(panelQuery.toLowerCase()));
  const assignedStates=new Set(assignments.map(a=>a.stateCode));
  const mappedMarkets=new Set([
    ...assignments.map(a=>a.stateCode),
    ...managers.map(m=>m.baseState)
  ].filter(code=>STATES.some(st=>st.code===code))).size;
  const publicMarkets=useMemo(()=>{
    const counts=new Map<string,number>();
    for(const airport of airports){
      if(airport.scheduled&&STATES.some(state=>state.code===airport.state))
        counts.set(airport.state,(counts.get(airport.state)||0)+1);
    }
    return STATES.map(state=>({code:state.code,name:state.name,count:counts.get(state.code)||0}))
      .filter(market=>market.count>0)
      .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)).slice(0,6);
  },[airports]);
  const panelTrainers=[...new Set(relatedManagers.map(m=>m.trainer).filter(Boolean))];
  const mapAirports=useMemo(()=>{
    if(airportLayer==='none'||!geography)return [];
    const rows=airports.filter(a=>a.scheduled && Number.isFinite(a.lat) && Number.isFinite(a.lon) &&
      (countryScope==='canada'
        ? Boolean(CANADA_REGION_BY_CODE[a.state])
        : STATES.some(st=>st.code===a.state)&&!['AK','HI'].includes(a.state)));
    // Map-scale disclosure: show the airport hubs that help with orientation,
    // plus every major airport in the selected region. More detail is available
    // through Layers without covering the entire country in symbols.
    const nationalHubs=new Set([
      'ATL','ORD','DFW','DEN','LAX','JFK','EWR','BOS','MCO','MIA',
      'CLT','SEA','SFO','IAH','MSP','DTW','LAS','PHX','SLC','YYZ','YVR','YUL'
    ]);
    const filtered=airportLayer==='all'
      ?rows
      :rows.filter(a=>a.state===region?.code||a.iata===homeCode||nationalHubs.has(a.iata));
    const selected=filtered.length?filtered:rows.slice(0,22);
    return selected.sort((a,b)=>{
      const priority=(x:Airport)=>(x.iata===homeCode?-20:0)+(region?.code===x.state?-10:0)+(x.tier==='Major'?0:x.tier==='Secondary'?1:2);
      return priority(a)-priority(b);
    }).slice(0,region?300:airportLayer==='all'?250:34).map(a=>{
      const p=geography.projection([a.lon!,a.lat!]);
      return p?{airport:a,x:p[0],y:p[1]}:null;
    }).filter((a):a is {airport:Airport;x:number;y:number}=>!!a);
  },[airports,airportLayer,geography,region?.code,homeCode,countryScope]);
  const routeGuide=useMemo(()=>{
    if(!region||!geography||!homeCode)return null;
    const origin=airports.find(a=>a.iata===homeCode);
    if(!origin||typeof origin.lat!=='number'||typeof origin.lon!=='number')return null;
    const start=geography.projection([origin.lon,origin.lat]);
    let end:number[]|null=null;
    if(focusedManager&&typeof focusedManager.lat==='number'&&typeof focusedManager.lon==='number'){
      end=geography.projection([focusedManager.lon,focusedManager.lat]);
    }else if(region.country==='CA'){
      const target=CANADA_REGION_BY_CODE[region.code];
      if(target)end=geography.projection([target.lon,target.lat]);
    }else{
      const state=STATES.find(x=>x.code===region.code);
      const poly=state&&geography.usa.find(f=>String(f.id).padStart(2,'0')===state.fips);
      if(poly)end=geography.path.centroid(poly as never);
    }
    if(!start||!end||!start.every(Number.isFinite)||!end.every(Number.isFinite))return null;
    const [sx,sy]=start,[ex,ey]=end;
    const bend=Math.max(32,Math.min(110,Math.abs(ex-sx)*.17));
    const midx=(sx+ex)/2,midy=(sy+ey)/2-bend;
    return {d:`M ${sx} ${sy} Q ${midx} ${midy} ${ex} ${ey}`,start:[sx,sy],end:[ex,ey],from:origin.iata,to:region.code};
  },[region?.code,region?.country,focusedManager?.id,focusedManager?.lat,focusedManager?.lon,geography,homeCode,airports]);
  const liveFlightGuide=useMemo(()=>{
    if(!routeGuide||!geography?.projection.invert)return null;
    const start=geography.projection.invert(routeGuide.start as [number,number]);
    const end=geography.projection.invert(routeGuide.end as [number,number]);
    if(!start||!end||![...start,...end].every(Number.isFinite))return null;
    return {start:[start[0],start[1]] as [number,number],end:[end[0],end[1]] as [number,number]};
  },[routeGuide,geography]);
  const searched=useMemo(()=>{
    if(!query.trim())return [] as Array<{kind:'manager'|'region'|'airport';text:string;description:string;manager?:Manager;region?:Region;airport?:Airport}>;
    const q=query.trim().toLowerCase();
    const people=managers.filter(m=>(m.name+' '+(m.baseCity||'')+' '+(m.baseState||'')).toLowerCase().includes(q)).slice(0,5)
      .map(manager=>({kind:'manager' as const,text:manager.name,description:[manager.baseCity,manager.baseState].filter(Boolean).join(', ')||'Unmapped manager',manager}));
    const regions=[...STATES.map(x=>({code:x.code,name:x.name,country:'US' as const})),...CANADA_REGIONS.map(x=>({code:x.code,name:x.name,country:'CA' as const}))]
      .filter(x=>(x.name+' '+x.code).toLowerCase().includes(q)).slice(0,4)
      .map(region=>({kind:'region' as const,text:region.name,description:region.country==='US'?'United States':'Canada',region}));
    const air=airports.filter(a=>(a.iata+' '+a.name).toLowerCase().includes(q)).slice(0,3)
      .map(airport=>({kind:'airport' as const,text:airport.iata+' · '+airport.name,description:'Airport · '+airport.state,airport}));
    return [...people,...regions,...air].slice(0,9);
  },[query,managers,airports]);
  function pickSearch(item:(typeof searched)[number]){
    if(item.kind==='manager'&&item.manager){focusPin(item.manager);}
    if(item.kind==='region'&&item.region)handleSelect(item.region);
    if(item.kind==='airport'&&item.airport){
      const ca=CANADA_REGION_BY_CODE[item.airport.state],us=STATES.find(x=>x.code===item.airport!.state);
      if(ca||us)openMapAirport(item.airport);
    }
    setQuery('');
  }
  function openMapAirport(airport:Airport){
    const ca=CANADA_REGION_BY_CODE[airport.state];
    const us=STATES.find(st=>st.code===airport.state);
    if(!ca&&!us)return;
    handleSelect({code:airport.state,name:ca?.name||us!.name,country:ca?'CA':'US'});
    setSelectedAirportId(airport.iata);
    setPanelTab('airports');
    setMapHint(airport.iata+' airport selected. Review airports and plan the trip.');
  }
  const inspectorRef=useRef<HTMLElement>(null);
  const inspectorTouchY=useRef<number|null>(null);
  useEffect(()=>{
    if(!region||typeof window==='undefined')return;
    if(!window.matchMedia('(max-width: 800px)').matches)return;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The iPhone inspector is a bottom sheet. Do not scroll the map page
    // away from the selection when showing the user's selected market.
    if(reduced)inspectorRef.current?.scrollTo(0,0);
    else inspectorRef.current?.scrollTo({top:0,behavior:'smooth'});
  },[region?.code]);

  const hasMap=!!geography;
  const selectedMapAirport=airports.find(a=>a.iata===selectedAirportId&&a.state===region?.code);
  const geographicDetails=useMemo(()=>{
    if(ctx.geo.state!==region?.code)return {countyNames:{},towns:[] as typeof ctx.geo.places};
    return {countyNames:Object.fromEntries(ctx.geo.counties.map(c=>[c.code,c.name])),towns:ctx.geo.places};
  },[ctx.geo.state,ctx.geo.counties,ctx.geo.places,region?.code]);
  const inspectedRegion=hoveredRegion||region;
  const inspectedManagerCount=inspectedRegion
    ?territoryPeople(managers,assignments,inspectedRegion.code).length:0;
  const inspectedAirportCount=inspectedRegion
    ?airports.filter(airport=>airport.state===inspectedRegion.code&&airport.scheduled).length:0;
  const setupComplete=managers.length>0&&assignments.length>0&&visits.length>0;
  const mapSyncLabel=ctx.syncStatus==='live'?'Live connection':
    ctx.syncStatus==='updated'?'Recently updated':
    ctx.syncStatus==='offline'?'Offline':'Connecting';
  const listTerm=listQuery.trim().toLowerCase();
  const listRegions=(countryScope==='canada'?CANADA_REGIONS:STATES)
    .filter(item=>!listTerm||(item.name+' '+item.code).toLowerCase().includes(listTerm));
  const listTerritories=assignments.filter(assignment=>{
    const manager=managers.find(person=>person.id===assignment.managerId);
    return !listTerm||[assignment.areaName,assignment.areaCode,assignment.stateCode,manager?.name]
      .filter(Boolean).join(' ').toLowerCase().includes(listTerm);
  });
  const listManagers=managers.filter(manager=>{
    return !listTerm||[manager.name,manager.baseCity,manager.baseState,manager.trainer]
      .filter(Boolean).join(' ').toLowerCase().includes(listTerm);
  });
  const listAirports=mapAirports.map(item=>item.airport).filter(airport=>
    !listTerm||(airport.iata+' '+airport.name+' '+airport.state).toLowerCase().includes(listTerm)
  ).slice(0,40);
  return <div data-lens={mapLens} className={'mv-map-page vice-atlas'+(focusMap?' atlas-focused':'')+(region?' has-active-region':'')+(setupComplete?' atlas-setup-complete':'')+(!showMapWelcome?' atlas-map-workspace':'')+(viewMode==='list'?' atlas-list-mode':'')}>
    {!focusMap&&showMapWelcome&&<OceanMasthead title="Your field. In perspective."
      description="Explore territories. Connect with your people. Plan the next visit."
      mobileDescription="Explore territories. Plan your next visit."
      action="Plan a trip" onAction={()=>region?continueToTravel(region):ctx.go('air')}/>}
    <div className={'atlas-mission-layout'+(region?' has-region':'')}>
      <div className="fsa-map-heading">
        <div className="atlas-field atlas-destination">
          <label htmlFor="atlas-destination">Search this map</label>
          <div className="mv-search atlas-search">
            <Search size={19}/>
            <input id="atlas-destination" ref={searchInput}
              value={query} autoComplete="off" type="search"
              onChange={e=>{setQuery(e.target.value);setSearchIndex(0);}}
              onKeyDown={e=>{
                if(e.key==='ArrowDown'&&searched.length){e.preventDefault();setSearchIndex(i=>(i+1)%searched.length);}
                else if(e.key==='ArrowUp'&&searched.length){e.preventDefault();setSearchIndex(i=>(i+searched.length-1)%searched.length);}
                else if(e.key==='Enter'&&searched.length){e.preventDefault();pickSearch(searched[searchIndex]||searched[0]);}
                else if(e.key==='Escape'){setQuery('');setSearchIndex(0);}
              }}
              placeholder={region?(focusedManager?.name||region.name):'Search this map: state, manager or airport'}
              role="combobox" aria-autocomplete="list" aria-expanded={Boolean(query)}
              aria-controls={query?'atlas-search-options':undefined}
              aria-activedescendant={query&&searched.length?'atlas-search-option-'+searchIndex:undefined}
              aria-label="Search this map for a state, manager or airport"/>
            {region&&!query&&<button type="button" className="atlas-clear" aria-label="Clear destination"
              onClick={()=>{setRegion(null);setFocusedManager(null);searchInput.current?.focus();}}><X size={16}/></button>}
            {query&&<div className="mv-search-results" role="listbox" id="atlas-search-options" aria-label="Matching destinations">
              {searched.length?searched.map((item,i)=><button type="button" key={item.kind+'-'+i}
                id={'atlas-search-option-'+i} className={searchIndex===i?'is-highlighted':''}
                role="option" aria-selected={searchIndex===i}
                onMouseEnter={()=>setSearchIndex(i)} onClick={()=>pickSearch(item)}>
                {item.kind==='airport'?<Plane size={17}/>:<MapPin size={17}/>}
                <span><strong>{item.text}</strong><small>{item.description}</small></span><ArrowRight size={15}/>
              </button>):<p>No matching destination found.</p>}
            </div>}
          </div>
        </div>
        <div className="fsa-map-heading-top">
        {(showMapWelcome||focusMap)&&<div className="fsa-map-heading-text">
          <h2>Territory atlas</h2>
          <p>{region?region.name+' · Territory in focus':'United States & Canada'}</p>
        </div>}
      <div className="atlas-utility">
        <div className="atlas-context">
          <span className="atlas-context-dot"/>
          <span>{region?(focusedManager?.name||region.name):'United States and southern Canada'}</span>
          {region&&<button type="button" aria-label="Clear map selection"
            onClick={()=>{setRegion(null);setFocusedManager(null);}}><X size={14}/></button>}
        </div>
        <div className="atlas-utility-actions">
          <select className="atlas-mobile-region" value={region?(region.country==='CA'?'CA:':'')+region.code:'all'}
            aria-label="Jump to any U.S. state or Canadian province"
            onChange={e=>{
              const selected=e.target.value;
              if(selected==='all'){setRegion(null);setFocusedManager(null);return;}
              if(selected.startsWith('CA:')){
                const found=CANADA_REGIONS.find(x=>x.code===selected.slice(3));
                if(found){handleSelect({code:found.code,name:found.name,country:'CA'});setCountryScope('canada');}
              }else{
                const found=STATES.find(x=>x.code===selected);
                if(found){handleSelect({code:found.code,name:found.name,country:'US'});setCountryScope('us');}
              }
            }}>
            <option value="all">Choose state or province</option>
            <optgroup label="United States">{STATES.map(st=><option key={st.code} value={st.code}>{st.name}</option>)}</optgroup>
            <optgroup label="Canada">{CANADA_REGIONS.map(st=><option key={'CA:'+st.code} value={'CA:'+st.code}>{st.name}</option>)}</optgroup>
          </select>
          <select value={trainer} onChange={e=>setTrainer(e.target.value)} aria-label="Manager pin filter">
            <option value="all">Both trainers</option>
            {trainers.map(name=><option key={name} value={name}>{name}</option>)}
          </select>
          <button type="button" className={'atlas-map-mode-toggle'+(showLiveMap?' is-live':'')}
            onClick={()=>chooseMapSource(!showLiveMap)} aria-pressed={showLiveMap}
            title={showLiveMap?'Use illustrated geographic outlines':'Use interactive streets and city basemap'}>
            <Compass size={16}/><span>{showLiveMap?'Street map':'Vector map'}</span>
          </button>
          <div className="mv-layers-holder">
            <button type="button" className={'mv-layers-button'+(layerMenu?' active':'')}
              onClick={()=>setLayerMenu(value=>!value)} aria-expanded={layerMenu}>
              <Layers size={17}/> <span>Layers</span><ChevronDown size={14}/>
            </button>
            {layerMenu&&<div className="mv-layers-popover">
              <strong>Map options</strong>
              <button type="button" className="ios-layers-close" onClick={()=>setLayerMenu(false)} aria-label="Close map layers">
                <X size={17}/>
              </button>
              <label><input type="checkbox" checked={showManagers} onChange={e=>setShowManagers(e.target.checked)}/> Territory manager pins</label>
              <label><input type="checkbox" checked={showCounties} onChange={e=>setShowCounties(e.target.checked)}/> County boundaries when focused</label>
              <label><input type="checkbox" checked={showTowns} onChange={e=>setShowTowns(e.target.checked)}/> Cities and Census places</label>
              <label><input type="checkbox" checked={showStateLabels} onChange={e=>setShowStateLabels(e.target.checked)}/> State abbreviations</label>
              <label><input type="checkbox" checked={showAssigned} onChange={e=>setShowAssigned(e.target.checked)}/> Assigned territories</label>
              <div className="mv-layer-subsection"><span>Show manager pins</span>
                <select value={trainer} onChange={e=>setTrainer(e.target.value)} aria-label="Trainer pin display">
                  <option value="all">Both trainers</option>
                  {trainers.map(name=><option value={name} key={name}>{name}</option>)}
                </select>
              </div>
              <div className="mv-layer-subsection"><span>Airports</span>
                <select value={airportLayer} onChange={e=>setAirportLayer(e.target.value as 'major'|'all'|'none')} aria-label="Airport detail">
                  <option value="major">Major airport hubs</option><option value="all">All airports</option><option value="none">None</option>
                </select>
              </div>
              <div className="mv-layer-subsection"><span>Regional emphasis</span>
                <select value={countryScope} onChange={e=>{setCountryScope(e.target.value==='canada'?'canada':'us');setRegion(null);setFocusedManager(null);}} aria-label="Map country">
                  <option value="us">United States</option><option value="canada">Canada</option>
                </select>
              </div>
              <div className="mv-layer-subsection"><span>Map style</span>
                <select value={mapStyle} onChange={e=>setMapStyle(e.target.value==='roads'?'roads':'vice')} aria-label="Map style">
                  <option value="vice">Neon contour map</option><option value="roads">High contrast</option>
                </select>
              </div>
              <button type="button" onClick={()=>{onAddManager(region?.code);setLayerMenu(false);}}><Plus size={15}/> Add manager</button>
            </div>}
          </div>
          <button type="button" className="atlas-focus" aria-pressed={focusMap}
            title={focusMap?'Exit map focus (Esc)':'Focus on map'}
            onClick={()=>setFocusMap(value=>!value)}>
            {focusMap?<Minimize2 size={17}/>:<Maximize2 size={17}/>}
            <span>{focusMap?'Exit focus':'Focus'}</span>
          </button>
        </div>
      </div>
        </div>
      </div>
      <div className="atlas-v5-lenses" role="group" aria-label="Choose intelligence view">
         <span>VIEW THE FIELD BY</span>
         {([
           ['territories','Territories',Compass],['coaching','Coaching needs',Sparkles],['visits','Field visits',CalendarCheck],['airports','Airports',Plane]
         ] as const).map(([key,label,Icon])=><button key={key} type="button"
           className={mapLens===key?'is-active':''} aria-pressed={mapLens===key}
           onClick={()=>switchLens(key)}><Icon size={17}/>{label}</button>)}
         <div className="atlas-v5-focus" role="status">
           {mapLens==='coaching'
             ?(region?relatedManagers:managers).filter(m=>priorities[m.id]==='high').length+' high-priority coaching needs'
             :mapLens==='visits'
               ?(region?(visitCounts[region.code]||0):Object.values(visitCounts).reduce((a,b)=>a+b,0))+' scheduled visits in the next '+visitHorizon+' days'
             :mapLens==='airports'
               ?(region?selectedAirports:airports.filter(a=>a.scheduled)).length+' listed gateways'
              :(region?relatedManagers.length:managers.length)
                ?(region?relatedManagers.length:managers.length)+' saved managers'
                :airportLayer==='none'?'No saved managers or territories':'Airport markers are public references'}
         </div>
       </div>
       <div className="atlas-map-view-switch" role="group" aria-label="Choose map or list display">
         {airportLayer!=='none'&&<span className="atlas-reference-note"><Plane size={13}/> Public airport points, not saved territories</span>}
         <span className="atlas-view-label">View</span>
         <button type="button" data-testid="map-view-map" className={viewMode==='map'?'active':''}
           aria-pressed={viewMode==='map'} onClick={()=>setViewMode('map')}>
           <MapIcon size={16}/> Map
         </button>
         <button type="button" data-testid="map-view-list" className={viewMode==='list'?'active':''}
           aria-pressed={viewMode==='list'} onClick={()=>setViewMode('list')}>
           <List size={16}/> List
         </button>
       </div>
        <div className="atlas-map-key" role="group" aria-label="Map symbols and workspace freshness" data-testid="atlas-map-key">
          <div className="atlas-map-key-item">
            <span className="atlas-map-key-territory" aria-hidden="true"/>
            <span className="atlas-map-key-copy"><strong>Saved territory</strong><small>Workspace assignment</small></span>
          </div>
          <div className="atlas-map-key-item">
            <span className="atlas-map-key-airport" aria-hidden="true"><Plane size={13}/></span>
            <span className="atlas-map-key-copy"><strong>Public airport</strong><small>Location only—not territory or flight status</small></span>
          </div>
          <div className="atlas-map-key-item">
            <span className={'atlas-map-key-state '+ctx.syncStatus} aria-hidden="true"/>
            <span className="atlas-map-key-copy">
              <strong>Workspace records</strong>
              <small>{mapSyncLabel} · {compactSourceTime(ctx.lastSyncAt)}</small>
            </span>
          </div>
        </div>
       <details className="atlas-data-sources" data-testid="data-sources">
         <summary><Info size={15}/><span>Data sources & freshness</span><ChevronDown size={14}/></summary>
         <div className="atlas-data-source-list">
           <article data-testid="source-workspace">
             <strong>Saved managers, territories and visits</strong>
             <span>Workspace records · {ctx.syncStatus==='live'?'live connection':ctx.syncStatus==='offline'?'connection offline':ctx.syncStatus==='connecting'?'connecting':'recently updated'}.</span>
             <small>Last successful refresh: {sourceTimestamp(ctx.lastSyncAt)}</small>
           </article>
           <article data-testid="source-airports">
             <strong>Airport location markers</strong>
             <span>Public OurAirports reference directory · {ctx.airportSource==='live'?'current provider response':ctx.airportSource==='cached'?'cached public snapshot':ctx.airportSource==='starter'?'limited starter fallback':'loading'}.</span>
             <small>Directory checked: {sourceTimestamp(ctx.airportCheckedAt)}. Airport dots are locations, not live flights.</small>
           </article>
           <article data-testid="source-flight-status">
             <strong>Flight status and availability</strong>
             <span>Not included in airport markers. Flight DNA shows separate FAA airport advisories; these are not airline schedules, seat availability or a booked-flight feed.</span>
           </article>
           <article data-testid="source-geography">
             <strong>Regional boundaries and basemap</strong>
             <span>{ctx.geo.source||'Census geography reference'} · loaded on demand for a selected U.S. region. {showLiveMap&&liveReady?'OpenFreeMap public vector tiles are loaded for the basemap.':'The bundled vector map is shown until public tiles load.'}</span>
             <small>Boundary refresh time is not provided by the source.</small>
           </article>
         </div>
       </details>
       {viewMode==='list'&&<section className="atlas-readable-list" aria-labelledby="atlas-readable-list-title" data-testid="atlas-readable-list">
         <header className="atlas-readable-list-head">
           <div><h3 id="atlas-readable-list-title">Browse map data as a list</h3>
             <p>Saved workspace records are separate from public airport references.</p></div>
           <label className="atlas-list-filter">
             <span className="sr-only">Filter this map list</span>
             <Search size={17}/>
             <input type="search" value={listQuery} data-testid="map-list-filter"
               onChange={event=>setListQuery(event.target.value)}
               placeholder="Filter regions, people or airports"/>
           </label>
         </header>
         <div className="atlas-readable-list-columns">
           <section className="atlas-list-section" aria-labelledby="atlas-list-territories">
             <header><h4 id="atlas-list-territories">Saved territories</h4><span>{listTerritories.length}</span></header>
             {assignments.length===0
               ?<div className="atlas-list-empty">
                  <p>No territories are saved yet. Airport dots on the map are public references, not assignments.</p>
                  <button type="button" data-testid="list-add-manager" onClick={()=>ctx.open('manager')}>Add your first manager <ArrowRight size={14}/></button>
                </div>
               :listTerritories.length
                 ?<ul>{listTerritories.map(assignment=>{
                    const manager=managers.find(person=>person.id===assignment.managerId);
                    const ca=CANADA_REGION_BY_CODE[assignment.stateCode];
                    const state=STATES.find(item=>item.code===assignment.stateCode);
                    const location=assignment.areaName||ca?.name||state?.name||assignment.stateCode;
                    return <li key={assignment.id}><button type="button"
                      data-testid={'territory-row-'+assignment.id}
                      onClick={()=>{
                        const found=ca||state;
                        if(found){handleSelect({code:assignment.stateCode,name:found.name,country:ca?'CA':'US'});setViewMode('map');}
                      }}>
                      <span><strong>{location}</strong><small>{manager?.name||'Manager not assigned'} · {assignment.areaType}</small></span>
                      <ArrowRight size={15}/>
                    </button></li>;
                  })}</ul>
                 :<p className="atlas-list-empty">No saved territory matches “{listQuery}”.</p>}
           </section>
           <section className="atlas-list-section" aria-labelledby="atlas-list-managers">
             <header><h4 id="atlas-list-managers">Saved managers</h4><span>{listManagers.length}</span></header>
             {managers.length===0
               ?<p className="atlas-list-empty">No managers saved yet. Public map markers do not represent team members.</p>
               :listManagers.length
                 ?<ul>{listManagers.map(manager=><li key={manager.id}><button type="button"
                    data-testid={'manager-row-'+manager.id}
                    onClick={()=>{setViewMode('map');focusPin(manager);}}>
                    <span><strong>{manager.name}</strong><small>{[manager.baseCity,manager.baseState,manager.trainer].filter(Boolean).join(' · ')||'Manager details'}</small></span>
                    <ArrowRight size={15}/>
                  </button></li>)}</ul>
                 :<p className="atlas-list-empty">No saved manager matches “{listQuery}”.</p>}
           </section>
         </div>
         <section className="atlas-list-section atlas-region-list" aria-labelledby="atlas-list-regions">
           <header><h4 id="atlas-list-regions">{countryScope==='canada'?'Canadian provinces and territories':'U.S. states'}</h4><span>Public geography</span></header>
           {listRegions.length
             ?<ul>{listRegions.map(item=>{
                const managerCount=territoryPeople(managers,assignments,item.code).length;
                const territoryCount=assignments.filter(assignment=>assignment.stateCode===item.code).length;
                return <li key={item.code}><button type="button" data-testid={'region-row-'+item.code}
                  onClick={()=>{handleSelect({code:item.code,name:item.name,country:countryScope==='canada'?'CA':'US'});setViewMode('map');}}>
                  <span><strong>{item.name}</strong><small>{managerCount} saved manager{managerCount===1?'':'s'} · {territoryCount} territory record{territoryCount===1?'':'s'}</small></span>
                  <ArrowRight size={15}/>
                </button></li>;
              })}</ul>
             :<p className="atlas-list-empty">No regions match “{listQuery}”.</p>}
         </section>
         <section className="atlas-list-section atlas-airport-list" aria-labelledby="atlas-list-airports">
           <header><h4 id="atlas-list-airports">Public airport references</h4><span>{airportLayer==='none'?'Layer off':listAirports.length+' shown'}</span></header>
           {airportLayer==='none'
             ?<p className="atlas-list-empty">Turn on the Airports layer to browse public airport locations.</p>
             :listAirports.length
               ?<ul>{listAirports.map(airport=><li key={airport.iata+'-'+airport.state}>
                  <button type="button" data-testid={'airport-row-'+airport.iata}
                    onClick={()=>{setViewMode('map');openMapAirport(airport);}}>
                    <span><strong>{airport.iata} · {airport.name}</strong><small>{airport.tier||'Airport'} · {airport.state} · public location reference</small></span>
                    <ArrowRight size={15}/>
                  </button>
                </li>)}</ul>
               :<p className="atlas-list-empty">No public airport references match “{listQuery}”.</p>}
         </section>
       </section>}
       {!region&&!focusMap&&<details className="atlas-market-discovery"><summary>Explore popular markets <ChevronDown size={16}/></summary><section className="atlas-public-market-rail" aria-label="Explore national airport gateway markets">
         <div className="atlas-public-market-lead">
           <span><Sparkles size={14}/> PUBLIC DATA · READY NOW</span>
           <strong>Choose a market. Discover the connections.</strong>
         </div>
         <div className="atlas-public-market-list">
           {publicMarkets.map(market=><button key={market.code} type="button"
             aria-label={'Explore '+market.name+', '+market.count+' listed scheduled-service airports'}
             onClick={()=>handleSelect({code:market.code,name:market.name,country:'US'})}>
             <b>{market.code}</b><span>{market.count} gateways</span><ArrowRight size={13}/>
           </button>)}
         </div>
         <button className="atlas-public-market-flight" type="button" onClick={()=>ctx.go('radar')}>
           <PlaneTakeoff size={16}/> Research flights
         </button>
       </section></details>}
       {mapLens==='visits'&&<section className="atlas-visit-timeline" aria-label="Scheduled field visits by date range">
         <div className="atlas-visit-timeline-heading">
           <CalendarClock size={20}/>
           <span>
             <strong>See the field schedule before it happens.</strong>
             <small>Scheduled visits in saved records · Not verified against external calendars</small>
           </span>
         </div>
         <div className="atlas-visit-horizons" role="group" aria-label="Upcoming visit date range">
           {([7,30,90] as const).map(days=><button type="button" key={days}
             aria-pressed={visitHorizon===days}
             className={visitHorizon===days?'selected':''}
             onClick={()=>updateVisitHorizon(days)}>
             {days} days
           </button>)}
         </div>
         <div className="atlas-visit-range-legend" aria-label="Scheduled visit color scale">
           <span><i className="none"/> None</span>
           <span><i className="low"/> 1 visit</span>
           <span><i className="medium"/> 2–3</span>
           <span><i className="high"/> 4+</span>
         </div>
         <button type="button" className="atlas-visit-open-calendar" onClick={()=>ctx.go('calendar')}>
           Calendar <ArrowRight size={16}/>
         </button>
       </section>}
       {region&&!focusMap&&<section className="atlas-v5-region-actions"
         aria-label={'Field actions for '+region.name}>
         <div className="atlas-v5-region-summary">
           <span><MapPin size={14}/> TERRITORY IN FOCUS</span>
           <strong>{region.name}</strong>
           <small>{relatedManagers.length} manager{relatedManagers.length===1?'':'s'} · {selectedAirports.length} scheduled-service gateway{selectedAirports.length===1?'':'s'}</small>
         </div>
         <div className="atlas-v5-region-buttons">
           {region.country==='US'&&<button type="button" className={mapLens==='territories'?'atlas-v5-strong':''}
             onClick={()=>{ctx.setState(region.code);ctx.setMapMode('state');ctx.go('map');}}>
             <Compass size={17}/> Explore counties <ArrowRight size={15}/>
           </button>}
           <button type="button" className={mapLens==='coaching'?'atlas-v5-strong':''}
             onClick={()=>{
               if(leadMarketManager){
                 ctx.setSelectedManager(leadMarketManager.person.id);ctx.go('managers');
               }else ctx.go('coaching');
             }}>
             <Sparkles size={17}/> Coaching priorities <ArrowRight size={15}/>
           </button>
           <button type="button" className={mapLens==='airports'?'atlas-v5-strong':''}
             onClick={()=>continueToTravel(region,focusedManager||undefined)}>
             <PlaneTakeoff size={17}/> Plan a trip <ArrowRight size={15}/>
           </button>
         </div>
       </section>}
       <div className="mv-map-body">
      <div className="atlas-map-coordinates" aria-hidden="true"><span>GEOGRAPHIC TERRITORY SYSTEM</span><span>{countryScope==='us'?'USA / ALBERS':'CAN / MERCATOR'}</span></div>
      <div ref={frameRef} className={'mv-map-frame'+(mapStyle==='roads'?' mv-map-frame-roads':' mv-map-frame-vice')}>
        {showLiveMap&&<Suspense fallback={null}><LiveTerritoryMap ref={liveMapRef} atlas={atlas} canadaFeatures={(canada?.features||EMPTY_CANADIAN_BOUNDARIES) as never}
          theme={theme} scope={countryScope} region={region} styleChoice={mapStyle}
          airports={airports} managers={managers} assignments={assignments}
          airportLayer={airportLayer} trainer={trainer} showAssigned={showAssigned}
          lens={mapLens} priorities={priorities} regionPriorities={regionPriorities} visitCounts={visitCounts}
          showLabels={showStateLabels} showManagers={showManagers}
          selectedAirportId={selectedAirportId} homeCode={homeCode} route={liveFlightGuide}
          trainerNames={[trainerProfiles[0]?.name||'Trainer 1',trainerProfiles[1]?.name||'Trainer 2']}
          showCounties={showCounties} showTowns={showTowns} selectedCounty={selectedMapArea?.kind==='county'?selectedMapArea.code:''}
          countyNames={geographicDetails.countyNames}
          towns={geographicDetails.towns}
          onSelectRegion={handleSelect} onSelectAirport={openMapAirport} onSelectManager={focusPin}
          onSelectCounty={area=>{setSelectedMapArea({...area,kind:'county'});ctx.setSelectedCounty(area.code);setPanelTab('coverage');}}
          onSelectTown={area=>{setSelectedMapArea({...area,kind:'town'});setPanelTab('coverage');}}
          onHoverRegion={setHoveredRegion}
          onReady={setLiveReady} onZoom={setLiveZoom}/></Suspense>}
        <div className="fsa-map-hud" aria-hidden="true">
          <span><i/> {showLiveMap&&liveReady?'STREET BASEMAP · PUBLIC TILES':showLiveMap?'LOADING STREETS · VECTOR BACKUP READY':'VECTOR TERRITORY ATLAS'}</span>
          <span>{region?region.name:countryScope==='canada'?'CANADA / PROVINCES':'UNITED STATES / INTERACTIVE'}</span>
        </div>
        {(hoveredAirport||inspectedRegion)&&<div className="mv-map-insight" aria-label="Map location details">
          {hoveredAirport?<>
            <span className="mv-map-insight-kicker"><Plane size={13}/> AIRPORT · {hoveredAirport.tier}</span>
            <strong>{hoveredAirport.iata} <small>{hoveredAirport.name}</small></strong>
            <span>Select airport for travel and market details</span>
          </>:inspectedRegion&&<>
            <span className="mv-map-insight-kicker"><MapPin size={13}/> {inspectedRegion.country==='US'?'U.S. STATE':'CANADIAN PROVINCE'}</span>
            <strong>{inspectedRegion.name} <small>{inspectedRegion.code}</small></strong>
            <span>{inspectedManagerCount} manager{inspectedManagerCount===1?'':'s'} · {inspectedAirportCount} scheduled airport{inspectedAirportCount===1?'':'s'}</span>
            <span>{new Set(assignments.filter(a=>a.stateCode===inspectedRegion.code).map(a=>a.managerId)).size>1?'Multiple territory assignments':assignments.some(a=>a.stateCode===inspectedRegion.code)?'Territory assignment saved':'No territory assignments saved'}</span>
            <span className="mv-map-insight-action">Select to inspect the territory</span>
          </>}
        </div>}
        {hasMap?<svg className={'mv-map-svg'+(panning?' is-dragging':'')+(showLiveMap&&liveReady?' atlas-static-hidden':'')} viewBox={"0 0 "+mapW+" "+mapH} role="group"
          aria-label="Interactive United States map with southern Canada. Select states, use zoom controls, and drag to pan when zoomed."
          style={{touchAction:zoom>1?'none':'pan-y',cursor:zoom>1?'grab':'default'}}
          onPointerDown={beginMapDrag} onPointerMove={moveMapDrag}
          onPointerUp={endMapDrag} onPointerCancel={endMapDrag}
          onClickCapture={captureMapClick}
          onDoubleClick={e=>{e.preventDefault();setZoom(z=>Math.min(2.4,z+.35));}}>
          <defs>
            <linearGradient id="fsa-sunset" x1="0%" x2="40%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#ffde9a"/>
              <stop offset="55%" stopColor="#ff8aab"/>
              <stop offset="100%" stopColor="#f440a7"/>
            </linearGradient>
            <clipPath id="fsa-sunset-clip"><circle cx="814" cy="131" r="132"/></clipPath>
            <linearGradient id="vice-territory-land" x1="0%" y1="0%" x2="55%" y2="100%"><stop className="vice-land-first" offset="0%"/><stop className="vice-land-last" offset="100%"/></linearGradient>
             <linearGradient id="mv-map-water" x1="0" x2="1" y1="0" y2="1">
              <stop className="mv-water-start" offset="0"/>
              <stop className="mv-water-middle" offset=".56"/>
              <stop className="mv-water-end" offset="1"/>
            </linearGradient>
            <radialGradient id="mv-map-halo" cx="82%" cy="9%" r="82%">
              <stop className="mv-halo-inner" offset="0"/>
              <stop className="mv-halo-outer" offset="1"/>
            </radialGradient>
            <linearGradient id="atlas-terrain-land" x1="0%" x2="75%" y1="0%" y2="100%">
              <stop offset="0%" className="atlas-land-start"/>
              <stop offset="100%" className="atlas-land-end"/>
            </linearGradient>
            <pattern id="atlas-chart-lines" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M80 0H0V80" stroke="var(--at-cyan)" strokeWidth=".6" opacity=".12" fill="none"/>
              <circle cx="0" cy="0" r="1" fill="var(--at-cyan)" opacity=".18"/>
            </pattern>
            <pattern id="atlas-contour-lines" width="170" height="128" patternUnits="userSpaceOnUse">
              <g stroke="var(--at-cyan)" strokeWidth=".9" fill="none" opacity=".28">
                <path d="M-40 22Q42 -18 92 19T208 14"/>
                <path d="M-40 36Q42 -4 92 33T208 28"/>
                <path d="M-40 50Q42 10 92 47T208 42"/>
                <path d="M-40 64Q42 24 92 61T208 56"/>
                <path d="M-40 78Q42 38 92 75T208 70"/>
                <path d="M-40 92Q42 52 92 89T208 84"/>
                <path d="M-40 106Q42 66 92 103T208 98"/>
                <path d="M-40 120Q42 80 92 117T208 112"/>
              </g>
            </pattern>
            <radialGradient id="atlas-land-glow" cx="32%" cy="25%" r="75%">
              <stop offset="0%" stopColor="#43C4D5" stopOpacity=".23"/>
              <stop offset="100%" stopColor="#102B4D" stopOpacity="0"/>
            </radialGradient>
            <clipPath id="atlas-country-mask" clipPathUnits="userSpaceOnUse">
              {(geography.canadaView?geography.canada:geography.usa).map((f,i)=><path key={'mask-'+i} d={geography.path(f as never)||''}/>)}
            </clipPath>
            <pattern id="mv-map-grid" width="42" height="42" patternUnits="userSpaceOnUse">
              <path d="M42 0 H0 V42" className="mv-map-grid-path" fill="none" strokeWidth=".75"/>
            </pattern>
          </defs>
          <rect width={mapW} height={mapH} fill="url(#mv-map-water)"/>
          <rect width={mapW} height={mapH} fill="url(#atlas-chart-lines)" pointerEvents="none" opacity=".32"/>
          <rect className="mv-map-halo" width={mapW} height={mapH} fill="url(#mv-map-halo)"/>
          <g className="atlas-map-corners" pointerEvents="none">
            <path d={'M 15 65 V 15 H 65 M '+(mapW-65)+' 15 H '+(mapW-15)+' V 65'}/>
            <path d={'M 15 '+(mapH-65)+' V '+(mapH-15)+' H 65 M '+(mapW-65)+' '+(mapH-15)+' H '+(mapW-15)+' V '+(mapH-65)}/>
          </g>

          <g className="mv-map-camera" style={{transition:panning?'none':'transform .22s cubic-bezier(.2,.7,.3,1)'}}
            transform={'translate('+(mapW/2*(1-zoom)+pan.x)+' '+(mapH/2*(1-zoom)+pan.y)+') scale('+zoom+')'}>
            <path className="atlas-graticule" d={graticulePath} pointerEvents="none"/>
            {!geography.canadaView&&geography.outline&&<g className="atlas-geographic-silhouette" pointerEvents="none">
              <path className="atlas-coast-shadow" d={geography.outline} transform="translate(0 6)"/>
              <path className="atlas-coast-rim" d={geography.outline}/>
            </g>}
            <g pointerEvents="none">
              {geography.canadaView&&geography.canada.map((f,i)=><path key={'fallback-ca-'+i} className="mv-country-base mv-country-canada" d={geography.path(f as never)||''}/>)}
              {!geography.canadaView&&geography.usa.map((f,i)=><path key={'fallback-us-'+i} className="mv-country-base mv-country-us" d={geography.path(f as never)||''}/>)}            </g>
            {geography.canadaView&&geography.canada.map((f,i)=>{
              const code=canadaCode(f.properties||{}),r=CANADA_REGION_BY_CODE[code];
              if(!r)return null;
              const active=region?.code===code&&region.country==='CA';
              return <path key={'CA-'+code+'-'+i} d={geography.path(f as never)||''}
                className={'mv-region mv-region-canada'+(active?' active':'')+(countryScope==='canada'?' emphasized':'')+(mapLens==='coaching'?' priority-'+(regionPriorities[code]||'none'):'')+(mapLens==='visits'?' visit-'+(visitCounts[code]>=4?'high':visitCounts[code]>=2?'medium':visitCounts[code]===1?'low':'none'):'')}
                strokeWidth={active?2.3:1.1} vectorEffect="non-scaling-stroke"
                role="button" tabIndex={0} aria-label={'Explore '+r.name}
                onMouseEnter={()=>setHoveredRegion({code,name:r.name,country:'CA'})}
                onMouseLeave={()=>setHoveredRegion(null)}
                onFocus={()=>setHoveredRegion({code,name:r.name,country:'CA'})}
                onBlur={()=>setHoveredRegion(null)}
                onClick={()=>handleSelect({code,name:r.name,country:'CA'})}
                onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();handleSelect({code,name:r.name,country:'CA'});}}}>
                <title>{r.name}</title>
              </path>;
            })}            {!geography.canadaView&&geography.usa.map(f=>{
              const st=US_LOOKUP[String(f.id).padStart(2,'0')];
              if(!st)return null;
              const active=region?.code===st.code&&region.country==='US';
              const assigned=showAssigned&&assignedStates.has(st.code);
              const shared=new Set(assignments.filter(a=>a.stateCode===st.code).map(a=>a.managerId)).size>1;
              return <path key={'US-'+st.code} d={geography.path(f as never)||''}
                className={'mv-region mv-region-us'+(active?' active':'')+(assigned?' assigned':'')+(shared?' shared':'')+(mapLens==='coaching'?' priority-'+(regionPriorities[st.code]||'none'):'')+(mapLens==='visits'?' visit-'+(visitCounts[st.code]>=4?'high':visitCounts[st.code]>=2?'medium':visitCounts[st.code]===1?'low':'none'):'')}
                strokeWidth={active?2.6:1.25}
                vectorEffect="non-scaling-stroke" role="button" tabIndex={0}
                aria-label={'Explore '+st.name+(assigned?' · assigned market':'')}
                onMouseEnter={()=>setHoveredRegion({code:st.code,name:st.name,country:'US'})}
                onMouseLeave={()=>setHoveredRegion(null)}
                onFocus={()=>setHoveredRegion({code:st.code,name:st.name,country:'US'})}
                onBlur={()=>setHoveredRegion(null)}
                onClick={()=>handleSelect({code:st.code,name:st.name,country:'US'})}
                onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();handleSelect({code:st.code,name:st.name,country:'US'});}}}>
                <title>{st.name+(mapLens==='coaching'?' · '+(regionPriorities[st.code]||'No')+' saved coaching urgency':'')+(mapLens==='visits'?' · '+(visitCounts[st.code]||0)+' scheduled visits in next '+visitHorizon+' days':'')}</title>
              </path>;
            })}
            <g clipPath="url(#atlas-country-mask)" className="atlas-cartographic-ink" pointerEvents="none">
              {mapStyle==='vice'&&<rect width={mapW} height={mapH} fill="url(#atlas-contour-lines)" opacity=".23"/>}
              <rect width={mapW} height={mapH} fill="url(#atlas-land-glow)" opacity=".56"/>
            </g>
            {selectedCenter&&region&&<g className="atlas-selected-beacon" pointerEvents="none"
              transform={'translate('+selectedCenter.x+' '+selectedCenter.y+')'}>
              <circle className="atlas-beacon-ring" r={16/zoom}/>
              <circle className="atlas-beacon-inner" r={5.8/zoom}/>
              <path className="atlas-beacon-cross" d={'M '+(-23/zoom)+' 0 h '+(14/zoom)+' M '+(9/zoom)+' 0 h '+(14/zoom)+' M 0 '+(-23/zoom)+' v '+(14/zoom)+' M 0 '+(9/zoom)+' v '+(14/zoom)}/>
            </g>}
            {showStateLabels&&!geography.canadaView&&geography.usa.map(f=>{
              const st=US_LOOKUP[String(f.id).padStart(2,'0')];
              if(!st||(zoom<1.45&&['RI','CT','DE','DC','NJ','MA','NH','VT','MD'].includes(st.code))||(mapW<550&&zoom<1.25&&!['CA','TX','FL','NY','WA','IL','CO','GA','NC'].includes(st.code)))return null;
              const c=geography.path.centroid(f as never);
              if(!c.every(Number.isFinite)||c[0]<10||c[0]>mapW-10||c[1]<12||c[1]>mapH-12)return null;
              return <text key={'label-'+st.code} x={c[0]} y={c[1]} textAnchor="middle"
                dominantBaseline="central" pointerEvents="none" className="mv-state-label"
                style={{fontSize:Math.max(11,Math.min(15,mapW/75))/Math.sqrt(zoom)}}>{st.code}</text>;
            })}
            {showStateLabels&&geography.canadaView&&geography.canada.map(f=>{
              const code=canadaCode(f.properties||{});
              const c=geography.path.centroid(f as never);
              if(!CANADA_REGION_BY_CODE[code]||!c.every(Number.isFinite))return null;
              return <text key={'province-'+code} x={c[0]} y={c[1]} textAnchor="middle"
                dominantBaseline="central" pointerEvents="none" className="mv-state-label">{code}</text>;
            })}
            {routeGuide&&<g className="mv-illustrative-route" pointerEvents="none">
              <path d={routeGuide.d} className="mv-travel-arc"/>
              <circle cx={routeGuide.start[0]} cy={routeGuide.start[1]} r={6/zoom} className="mv-arc-node mv-arc-origin"/>
              <circle cx={routeGuide.end[0]} cy={routeGuide.end[1]} r={6/zoom} className="mv-arc-node mv-arc-destination"/>
              <text x={routeGuide.start[0]} y={routeGuide.start[1]-12/zoom} className="mv-arc-label" textAnchor="middle" fontSize={11/zoom}>{routeGuide.from}</text>
            </g>}
            {mapAirports.map(({airport:a,x,y},i)=>{
              const primary=region?.code===a.state||a.iata===homeCode;
              const major=a.tier==='Major';
              const chosen=a.iata===selectedAirportId;
              const signal=chosen||(major&&(zoom>1.55||Boolean(region)));
              const showCode=chosen&&mapW>=480;
              return <g key={'airport-'+a.iata+'-'+i}
                transform={'translate('+x+' '+y+')'} className={'mv-airport-mark'+(primary?' primary':'')+(major?' major':' secondary')+(chosen?' chosen':'')}
                role="button" tabIndex={0} aria-label={'Explore public airport location reference '+a.iata}
                onMouseEnter={()=>setHoveredAirport(a)}
                onMouseLeave={()=>setHoveredAirport(null)}
                onFocus={()=>setHoveredAirport(a)}
                onBlur={()=>setHoveredAirport(null)}
                onClick={()=>openMapAirport(a)}
                onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openMapAirport(a);}}}>
                <circle className="atlas-airport-halo" r={(chosen?12:major?7:5)/zoom}/>
                <circle className="mv-airport-bubble" r={(chosen?6.5:major?4.6:3.1)/zoom} strokeWidth={1.5/zoom}/>
                {signal&&<path d="M0 -6L1.8 -1L6.3 1L6.3 2.3L1.5 1.2L1.5 5L3.4 6L3.4 6.8L0 5.8L-3.4 6.8L-3.4 6L-1.5 5L-1.5 1.2L-6.3 2.3L-6.3 1L-1.8 -1Z"
                  transform={'scale('+(1/zoom)+')'} className="mv-airport-glyph"/>}
                {showCode&&<text className="mv-airport-code" y={-17/zoom}
                  fontSize={11/zoom} textAnchor="middle">{a.iata}</text>}
                <title>{a.iata+' · '+a.name+' · public airport location reference · live flights and seat availability are not included'}</title>
              </g>;
            })}
            {clusters.map((group,i)=>{
              const lead=group.members[0].manager;
              const multi=group.members.length>1;
              const urgency=group.members.some(x=>priorities[x.manager.id]==='high')?'high':group.members.some(x=>priorities[x.manager.id]==='moderate')?'moderate':'routine';
               const color=mapLens==='coaching'?(urgency==='high'?'#FF5FAA':urgency==='moderate'?'#FFC46C':'#42DDCA'):multi?'#087ac4':colors[lead.trainer]||'#738ba6';
              const selected=group.members.some(x=>x.manager.id===focusedManager?.id);
              const approximate=group.members.some(x=>x.approx);
              return <g key={'manager-'+i} className={'mv-manager-marker'+(selected?' selected':'')+(approximate?' approximate':'')}
                role="button" tabIndex={0} aria-label={(multi?group.members.length+' managers near this point':lead.name)+(approximate?' · approximate region location':' · mapped base location')}
                transform={'translate('+group.x+' '+group.y+')'}
                onClick={()=>focusPin(lead)}
                onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focusPin(lead);}}}>
                <g transform={'scale('+(1/zoom)+')'}>
                  <path d="M0 -19C-10.5 -19 -16 -11 -16 -3C-16 8 0 21 0 21C0 21 16 8 16 -3C16 -11 10.5 -19 0 -19Z"
                    fill={color} stroke="#fff" strokeWidth="2.4" strokeDasharray={approximate?'3.5 2.3':undefined}/>
                  {multi?<text x="0" y="-1" fontSize="14" fontWeight="900" fill="#fff" textAnchor="middle">{group.members.length}</text>
                    :<circle cx="0" cy="-3" r="5" fill="#f4fcff"/>}
                </g>
                <title>{multi?group.members.map(x=>x.manager.name).join(', '):[
                  lead.name,lead.trainer||'Trainer unassigned',
                  [lead.baseCity,lead.baseState].filter(Boolean).join(', '),
                  'Last coaching: '+(managerSummary(lead).last||'Not recorded'),
                  'Next visit: '+(managerSummary(lead).next||'Not scheduled'),
                  group.members[0].approx?'Approximate pin: geographic region center until manager coordinates are entered':'Pin uses saved manager coordinates'
                ].join(' · ')}</title>
              </g>;
            })}
          </g>
        </svg>:<div className="mv-map-loading"><Compass size={30}/><strong>Loading territory map</strong><span>The region selector will remain available if the map service is unavailable.</span></div>}
        {!focusMap&&!region&&<div className="mv-map-hint"><MapPin size={15}/> Select a state to explore</div>}
        {routeGuide&&<div className="mv-route-guide-note">
          <Plane size={16}/>
          <div>{routeGuide.from} → {routeGuide.to}<small>Schematic direction · not a booked flight</small></div>
        </div>}
        <div className="mv-map-legend" aria-label="Map legend and visible layers">
           {mapLens==='coaching'&&<div className="atlas-v5-priority-legend">
             <span><i className="high"/> High</span><span><i className="moderate"/> Moderate</span><span><i className="routine"/> Routine</span><span><i className="none"/> No manager data</span>
           </div>}
           {mapLens==='airports'&&<div className="atlas-v5-airport-legend"><Plane size={14}/> Airport gateways</div>}
            {mapLens==='visits'&&<div className="atlas-visit-legend">
              <span><CalendarCheck size={15}/> Planned coaching visits · {visitHorizon} days</span>
              <button type="button" onClick={()=>ctx.go('calendar')}>Shared calendar <ArrowRight size={14}/></button>
            </div>}
          {mapLens==='territories'&&clusters.length>0&&trainerProfiles.map((profile,i)=><div key={profile.id}>
            <span className={'mv-pin-dot mv-pin-'+i}/>{profile.name}
          </div>)}
          {mapLens==='territories'&&<div className="atlas-legend-unassigned"><span className="atlas-unassigned-swatch"/> Unassigned</div>}
          {mapLens==='territories'&&showAssigned&&assignedStates.size>0&&<div className="mv-legend-assigned">
            <span className="mv-assigned-swatch"/> Assigned territory
          </div>}
          <button type="button" className={'mv-map-airport-toggle'+(airportLayer!=='none'?' is-on':'')}
            onClick={()=>setAirportLayer(value=>value==='none'?'major':'none')}
            aria-pressed={airportLayer!=='none'} title="Show or hide airport hubs">
            <Plane size={15}/> Airports {airportLayer==='none'?'off':'on'}
          </button>
          {pins.some(p=>p.approx)&&<div><span className="mv-approx-pin-swatch" aria-hidden="true"/>Approximate manager locations</div>}
        </div>
        <div className="mv-map-tools" role="group" aria-label="Map zoom controls">
          <button type="button" title="Zoom to selected state" aria-label="Zoom to selected state"
            disabled={!region||(!liveReady&&(region.country!=='US'||['AK','HI'].includes(region.code)))}
            onClick={()=>{
              if(liveReady&&showLiveMap){liveMapRef.current?.focus();return;}
              if(!region||!geography)return;
              const st=STATES.find(item=>item.code===region.code);
              const shape=st&&geography.usa.find(item=>String(item.id).padStart(2,'0')===st.fips);
              if(!shape)return;
              const [[x0,y0],[x1,y1]]=geography.path.bounds(shape as never);
              if(![x0,y0,x1,y1].every(Number.isFinite))return;
              const z=Math.min(2.4,Math.max(1.25,Math.min(mapW*.72/Math.max(1,x1-x0),mapH*.72/Math.max(1,y1-y0))));
              const x=Math.max(-(mapW/2)*(z-1),Math.min((mapW/2)*(z-1),z*(mapW/2-(x0+x1)/2)));
              const y=Math.max(-(mapH/2)*(z-1),Math.min((mapH/2)*(z-1),z*(mapH/2-(y0+y1)/2)));
              setZoom(z);setPan({x,y});
            }}><Maximize2 size={17}/></button>
          <button type="button" title="Zoom in" disabled={!liveReady&&zoom>=2.399}
            onClick={()=>{if(liveReady&&showLiveMap)liveMapRef.current?.zoomIn();else setZoom(z=>Math.min(2.4,z+.35));}} aria-label="Zoom in">+</button>
          <button type="button" title="Zoom out" disabled={!liveReady&&zoom<=1}
            onClick={()=>{if(liveReady&&showLiveMap)liveMapRef.current?.zoomOut();else{setZoom(z=>Math.max(1,z-.35));if(zoom<=1.35)setPan({x:0,y:0});}}} aria-label="Zoom out">−</button>
          <output className="mv-map-zoom" aria-label="Map magnification">{liveReady&&showLiveMap?liveZoom:Math.round(zoom*100)}%</output>
          <button type="button" title="Reset map" onClick={()=>{if(liveReady&&showLiveMap)liveMapRef.current?.reset();setZoom(1);setPan({x:0,y:0});setRegion(null);setFocusedManager(null);}} aria-label="Reset map"><Compass size={17}/></button>
        </div>
        {countryScope==='us'&&<div className="mv-insets" role="group" aria-label="Alaska and Hawaii inset maps">
          {([{code:'AK',name:'Alaska'},{code:'HI',name:'Hawaii'}] as const).map(item=>
            <button key={item.code} type="button" onClick={()=>handleSelect({code:item.code,name:item.name,country:'US'})}
              aria-label={'Explore '+item.name} title={'Explore '+item.name}>
              {geography?.insets[item.code]&&<svg viewBox="0 0 120 70" aria-hidden="true" focusable="false">
                <path d={geography.insets[item.code]} className="mv-inset-shape"/>
              </svg>}
              <span>{item.name}</span>
            </button>
          )}
        </div>}
        {countryScope==='us'&&<details className="atlas-ne-shortcuts">
          <summary>Small states <ChevronDown size={14}/></summary>
          <div>{(['VT','NH','MA','RI','CT','NJ','DE','MD','DC'] as const).map(code=>{
            const st=STATES.find(item=>item.code===code);
            return st?<button type="button" key={code} title={st.name}
              onClick={()=>handleSelect({code,name:st.name,country:'US'})}>{code}</button>:null;
          })}</div>
        </details>}
        <div className="mv-map-credit">Boundaries are geographic references, not routing estimates</div>
        {canadaError&&<p className="mv-map-warning">Canadian boundary source temporarily unavailable. Provinces remain accessible in the region selector.</p>}
        {mapHint&&<div className="mv-map-toast" role="status">{mapHint}<button onClick={()=>setMapHint('')} aria-label="Dismiss"><X size={15}/></button></div>}
      </div>


      {!region&&!focusMap&&<aside className="vice-map-welcome" aria-label="Explore your territories">
        <div><Compass size={25}/><h3>Find your<br/> next destination.</h3>
        <p>Select a state or province to explore your people, coverage and arrival airports.</p></div>
        <div className="vice-market-list">
          {(['FL','CA','TX'] as const).map(code=>{const st=STATES.find(item=>item.code===code)!;return <button type="button" key={code} onClick={()=>handleSelect({code,name:st.name,country:'US'})}>
            <span>{st.name}</span><ArrowRight size={17}/></button>;})}
        </div>
        <small>Public airport references. Flight availability and road routes require verification.</small>
      </aside>}
      </div>
        <div className="atlas-map-key" role="group" aria-label="Map symbols and workspace freshness" data-testid="atlas-map-key">
          <div className="atlas-map-key-item">
            <span className="atlas-map-key-territory" aria-hidden="true"/>
            <span className="atlas-map-key-copy"><strong>Saved territory</strong><small>Workspace assignment</small></span>
          </div>
          <div className="atlas-map-key-item">
            <span className="atlas-map-key-airport" aria-hidden="true"><Plane size={13}/></span>
            <span className="atlas-map-key-copy"><strong>Public airport</strong><small>Location reference, not live flights</small></span>
          </div>
          <div className="atlas-map-key-item">
            <span className={'atlas-map-key-state '+ctx.syncStatus} aria-hidden="true"/>
            <span className="atlas-map-key-copy">
              <strong>Workspace records</strong>
              <small>{mapSyncLabel} · {compactSourceTime(ctx.lastSyncAt)}</small>
            </span>
          </div>
        </div>
       <details className="atlas-data-sources" data-testid="data-sources">
         <summary><Info size={15}/><span>Data sources & freshness</span><ChevronDown size={14}/></summary>
         <div className="atlas-data-source-list">
           <article data-testid="source-workspace">
             <strong>Saved managers, territories and visits</strong>
             <span>Workspace records · {ctx.syncStatus==='live'?'live connection':ctx.syncStatus==='offline'?'connection offline':ctx.syncStatus==='connecting'?'connecting':'recently updated'}.</span>
             <small>Last successful refresh: {sourceTimestamp(ctx.lastSyncAt)}</small>
           </article>
           <article data-testid="source-airports">
             <strong>Airport location markers</strong>
             <span>Public OurAirports reference directory · {ctx.airportSource==='live'?'current provider response':ctx.airportSource==='cached'?'cached public snapshot':ctx.airportSource==='starter'?'limited starter fallback':'loading'}.</span>
             <small>Directory checked: {sourceTimestamp(ctx.airportCheckedAt)}. Airport dots are locations, not live flights.</small>
           </article>
           <article data-testid="source-flight-status">
             <strong>Flight status and availability</strong>
             <span>Not included in airport markers. Flight DNA shows separate FAA airport advisories; these are not airline schedules, seat availability or a booked-flight feed.</span>
           </article>
           <article data-testid="source-geography">
             <strong>Regional boundaries and basemap</strong>
             <span>{ctx.geo.source||'Census geography reference'} · loaded on demand for a selected U.S. region. {showLiveMap&&liveReady?'OpenFreeMap public vector tiles are loaded for the basemap.':'The bundled vector map is shown until public tiles load.'}</span>
             <small>Boundary refresh time is not provided by the source.</small>
           </article>
         </div>
       </details>
    </div>
      {region&&!focusMap&&<button type="button" className="ios-market-scrim" aria-label="Dismiss territory details"
        onClick={()=>{setRegion(null);setFocusedManager(null);}}/>}
      {region&&!focusMap&&<aside className="mv-inspector" ref={inspectorRef} aria-label={'Territory details for '+region.name}>
        <button type="button" className="ios-sheet-grab ios-market-grab" aria-label="Close territory details"
          onTouchStart={e=>{inspectorTouchY.current=e.touches[0]?.clientY??null;}}
          onTouchEnd={e=>{
            if(inspectorTouchY.current!==null&&(e.changedTouches[0]?.clientY??0)-inspectorTouchY.current>55){
              setRegion(null);setFocusedManager(null);
            }
            inspectorTouchY.current=null;
          }}
          onClick={()=>{setRegion(null);setFocusedManager(null);}}><span aria-hidden="true"/></button>
        <div className="mv-inspector-art">
          <div className="mv-inspector-kicker"><Compass size={14}/> MARKET INTELLIGENCE / {region.code}</div>
          <button className="mv-inspector-close" onClick={()=>{setRegion(null);setFocusedManager(null);}}
            aria-label="Close destination inspector"><X size={19}/></button>
          <div className="mv-inspector-cover">
            <strong>{region.name}</strong>
            <span>{relatedManagers.length} manager{relatedManagers.length===1?'':'s'} <i/> {majorCount} major airport{majorCount===1?'':'s'} <i/> {secondaryCount} other airport{secondaryCount===1?'':'s'}</span>
          </div>
        </div>
        {region.country==='US'&&<div className="studio-geography-status" role="status">
          <MapPin size={15}/>
          {ctx.geoBusy?'Loading local counties and towns…':
           ctx.geo.state===region.code&&!ctx.geoError?
             ctx.geo.counties.length+' Census counties · '+ctx.geo.places.length+' listed places':
           'County or town detail unavailable from the public source'}
        </div>}
        {leadMarketManager&&<section className="studio-market-opportunity" aria-label="Coaching priority in this territory">
          <div className="studio-market-priority-title">
            <span>PRIORITY IN {region.code}</span>
            <strong>{leadMarketManager.person.name}</strong>
            <p>{leadMarketManager.priority.reasons[0]||'Marked for coaching attention in your workspace'}</p>
          </div>
          <button type="button" onClick={()=>{
            const existing=visits.find(v=>v.managerId===leadMarketManager.person.id&&
              ['Planned','Rescheduled'].includes(v.status)&&v.date>=today());
            if(existing)ctx.open('visit',existing);
            else continueToTravel(region,leadMarketManager.person);
          }}>{visits.some(v=>v.managerId===leadMarketManager.person.id&&
              ['Planned','Rescheduled'].includes(v.status)&&v.date>=today())?'Review visit':'Plan coaching'}
            <ArrowRight size={15}/>
          </button>
        </section>}
        {selectedMapArea&&selectedMapArea.stateCode===region.code&&<div className="atlas-map-area-focus" aria-label="Selected geographic area">
          <span className="atlas-map-area-type">{selectedMapArea.kind==='county'?'COUNTY':'CITY / TOWN'} · {selectedMapArea.code}</span>
          <div className="atlas-map-area-row">
            <strong>{selectedMapArea.name}</strong>
            <button type="button" onClick={()=>setSelectedMapArea(null)} aria-label="Clear selected county or town"><X size={15}/></button>
          </div>
          <p>{assignments.filter(a=>a.areaType===(selectedMapArea.kind==='county'?'county':'place')&&a.areaCode===selectedMapArea.code).length} matching area assignments · Saved workspace data</p>
          <button type="button" onClick={()=>{ctx.setState(region.code);if(selectedMapArea.kind==='county')ctx.setSelectedCounty(selectedMapArea.code);ctx.setMapMode('state');ctx.go('map');}}>Open territory details <ArrowRight size={14}/></button>
        </div>}
        {selectedMapAirport&&<div className="atlas-airport-focus" aria-label="Selected airport">
          <span><Plane size={15}/> SELECTED AIRPORT</span>
          <strong>{selectedMapAirport.iata} <small>{selectedMapAirport.name}</small></strong>
          <p>{selectedMapAirport.tier} · {selectedMapAirport.scheduled?'Scheduled service listed':'Service not confirmed'}</p>
          <button type="button" onClick={()=>continueToTravel(region,focusedManager||undefined,selectedMapAirport.iata)}>
            Plan arrival through {selectedMapAirport.iata} <ArrowRight size={15}/>
          </button>
        </div>}
        <div className="mv-inspector-tabs" role="tablist" aria-label="Market information">
          {(['managers','airports','coverage'] as const).map((tab,i)=><button type="button" key={tab}
            role="tab" aria-selected={panelTab===tab}
            className={panelTab===tab?'active':''} onClick={()=>setPanelTab(tab)}
            onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
              event.preventDefault();
              const tabs=['managers','airports','coverage'] as const;
              const next=(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
              setPanelTab(tabs[next]);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')[next]?.focus();
            }}}>{tab.charAt(0).toUpperCase()+tab.slice(1)}</button>)}
        </div>
        <div className="mv-inspector-main" role="tabpanel">
          {panelTab==='managers'&&<>
            <div className="mv-inspector-search"><Search size={17}/>
              <input value={panelQuery} onChange={e=>setPanelQuery(e.target.value)}
                placeholder={'Search managers in '+region.name} aria-label="Search managers in selected region"/>
            </div>
            <div className="mv-inspector-list" role="list" aria-label="Managers in selected market">
              {panelManagers.length?panelManagers.map(m=>{
                const status=managerSummary(m);
                return <button className={'mv-manager-row'+(focusedManager?.id===m.id?' active':'')} key={m.id} onClick={()=>setFocusedManager(m)}>
                  <span className="mv-manager-circle" style={{background:colors[m.trainer]||'#7b91a8'}}/>
                  <span className="mv-manager-name"><strong>{m.name}</strong><small>{m.baseCity||'Location not set'} · {m.trainer||'Trainer unassigned'}</small>
                    {(!Number.isFinite(m.lat)||!Number.isFinite(m.lon))&&<small className="mv-location-caveat">Approximate state-level pin · confirm address</small>}</span>
                  <ArrowRight className="mv-manager-chevron" size={17}/>
                  <span className="mv-manager-timeline">
                    <span className="mv-manager-dates"><small>LAST COACHING</small><strong>{status.last?dateLabel(status.last,{month:'short',day:'numeric',year:'2-digit'}):'Not recorded'}</strong></span>
                    <span className="mv-manager-dates"><small>NEXT VISIT</small><strong>{status.next?dateLabel(status.next,{month:'short',day:'numeric',year:'2-digit'}):'Not scheduled'}</strong></span>                  </span>
                </button>;
              }):<div className="mv-inspector-empty"><Users size={23}/><strong>No managers found</strong>
                <p>{relatedManagers.length?'Try another search.':'Public county and airport records are available now, without a manager.'}</p>
                <button type="button" onClick={()=>setPanelTab('airports')}><Plane size={15}/> Explore {selectedAirports.length} gateways</button>
                 {ctx.identity==='member'&&<button type="button" onClick={()=>onAddManager(region.code)}><Plus size={15}/> Add manager</button>}
              </div>}
            </div>
            {focusedManager&&<div className="mv-focus-summary">
              <div><strong>{focusedManager.name}</strong><span>{focusedManager.baseCity||'City not set'} · {focusedManager.trainer||'Trainer not assigned'}</span></div>
              <div className="fsa-manager-next-actions">                <button type="button" onClick={()=>{ctx.setSelectedManager(focusedManager.id);ctx.go('managers');}}>Open profile <ArrowRight size={14}/></button>
                <button type="button" onClick={()=>continueToTravel(region,focusedManager)}>Plan visit <PlaneTakeoff size={14}/></button>
              </div>
            </div>}
          </>}
          {panelTab==='airports'&&<div className="mv-airport-list studio-airport-browser">
            <p className="fsa-airport-disclaimer">
              {selectedAirports.length} scheduled gateway{selectedAirports.length===1?'':'s'} listed for {region.name}.
              {' '}Data: {ctx.airportSource==='live'?'Recent public airport directory':ctx.airportSource==='cached'?'saved public airport snapshot':'limited starter directory'}.
              {' '}Flight schedules and prices require confirmation.
            </p>
            {selectedAirports.length>7&&<div className="studio-airport-search">
              <Search size={16}/>
              <input value={airportFilter} onChange={e=>{setAirportFilter(e.target.value);setShowAllRegionalAirports(false);}}
                placeholder="Find airport name or IATA code…" aria-label="Filter regional airports"/>
              {airportFilter&&<button type="button" onClick={()=>setAirportFilter('')} aria-label="Clear airport filter"><X size={15}/></button>}
            </div>}
            {visibleRegionalAirports.map(a=>
              <button type="button" className="fsa-airport-choice" key={a.iata}
                onClick={()=>continueToTravel(region,focusedManager||undefined,a.iata)}>
                <span className="fsa-airport-code">{a.iata}</span>
                <span className="fsa-airport-description">
                  <strong>{a.name}</strong>
                  <small>{a.tier} · Scheduled service listed</small>
                </span>
                <span className="fsa-airport-arrow"><ArrowRight size={17}/></span>
              </button>
            )}
            {matchingAirports.length>visibleRegionalAirports.length&&<button type="button"
              className="studio-airport-expand" onClick={()=>setShowAllRegionalAirports(true)}>
              Show all {matchingAirports.length} matching airports <ChevronDown size={16}/>
            </button>}
            {matchingAirports.length===0&&<div className="mv-inspector-empty">
              <Plane size={23}/><strong>{airportFilter?'No airport matches this search':'No scheduled-service airport listed'}</strong>
              <p>{airportFilter?'Try another airport name or code.':'Use the travel planner to search gateways in neighboring states.'}</p>
            </div>}
          </div>}
          {panelTab==='coverage'&&<div className="mv-coverage">
            <strong>Trainer coverage</strong>
            {trainerProfiles.map((profile,i)=><div className="mv-coverage-row" key={profile.id}>
              <span className={'mv-pin-dot mv-pin-'+i}/><span>{profile.name}</span>
              <strong>{relatedManagers.filter(m=>m.trainer===profile.name).length} managers</strong>
            </div>)}
            {panelTrainers.filter(name=>!trainerProfiles.some(p=>p.name===name)).map(name=><div className="mv-coverage-row" key={name}>
              <span className="mv-pin-dot"/><span>{name}</span><strong>{relatedManagers.filter(m=>m.trainer===name).length}</strong>
            </div>)}
            {region.country==='US'&&<button type="button" className="atlas-county-drill"
              onClick={()=>{ctx.setState(region.code);ctx.setMapMode('state');ctx.go('map');}}>
              <MapPin size={16}/> Explore counties <ArrowRight size={15}/>
            </button>}
            <button onClick={()=>onAddManager(region.code)} className="mv-coverage-add"><Plus size={15}/> Add manager in {region.name}</button>
          </div>}
        </div>
        <button className="mv-inspector-trip" onClick={()=>continueToTravel(region,focusedManager||undefined)}>
          <PlaneTakeoff size={22}/> Plan Trip to {region.name}<ArrowRight size={20}/>
        </button>
      </aside>}
    <details className="atlas-deep-intelligence">
      <summary>
        <span className="atlas-deep-summary-title"><Sparkles size={18}/> Field intelligence</span>
        <span className="atlas-deep-summary-action">Explore insights <ChevronDown size={17}/></span>
      </summary>
      <section className="atlas-telemetry-strip" aria-label="Field intelligence and geographic overview">

      <div className="atlas-telemetry-item"><Compass size={20}/><span><small>GEOGRAPHY AVAILABLE</small><strong>{STATES.length}<em>regions · 50 states + D.C.</em></strong></span></div>
      <div className="atlas-telemetry-item"><Users size={20}/><span><small>TERRITORY MANAGERS</small><strong>{managers.length}<em>saved profiles</em></strong></span></div>
      <div className="atlas-telemetry-item"><MapPin size={20}/><span><small>MAPPED MARKETS</small><strong>{mappedMarkets}<em>covered markets</em></strong></span></div>
      <div className="atlas-telemetry-item"><Plane size={20}/><span><small>AIRPORT INTELLIGENCE</small><strong>{airports.filter(a=>a.scheduled).length}<em>{ctx.airportSource==='live'?'Recent public airport feed':ctx.airportSource==='cached'?'Stored airport snapshot':'Starter airport index'}</em></strong></span></div>
      </section>
    </details>
  </div>;
}
