
import { geoCentroid } from 'd3-geo';
import type { Map as GLInstance,GeoJSONSource } from 'maplibre-gl';
import { AttributionControl,Map as GLMap,setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef,useEffect,useImperativeHandle,useMemo,useRef,useState } from 'react';
import { feature } from 'topojson-client';
import { CANADA_REGIONS } from './CanadaRegions';
import './LiveTerritoryMap.css';
import type { Airport,Assignment,Manager } from './opsModels';
import { STATES } from './opsModels';

setWorkerUrl(workerUrl);
type Region={code:string;name:string;country:'US'|'CA'};
type CountyChoice={code:string;name:string;stateCode:string};
type TownChoice={code:string;name:string;stateCode:string};
type FeatureShape={type:'Feature';id?:string|number;properties:Record<string,any>;geometry:any};
type Collection={type:'FeatureCollection';features:FeatureShape[]};
type Props={
 atlas:unknown;canadaFeatures:FeatureShape[];
 theme:'dark'|'light';scope:'us'|'canada';region:Region|null;styleChoice:'vice'|'roads';
 airports:Airport[];managers:Manager[];assignments:Assignment[];
 airportLayer:'major'|'all'|'none';trainer:string;
  lens:'territories'|'coaching'|'airports'|'visits';priorities:Record<string,string>;regionPriorities:Record<string,'high'|'moderate'|'routine'>;visitCounts:Record<string,number>;
 showAssigned:boolean;showLabels:boolean;showManagers:boolean;
 selectedAirportId:string;homeCode:string;route:{start:[number,number];end:[number,number]}|null;
 trainerNames:[string,string];showCounties:boolean;showTowns:boolean;selectedCounty:string;
 countyNames:Record<string,string>;towns:Array<{code:string;name:string;lat?:number|null;lon?:number|null}>;
 onSelectRegion:(r:Region)=>void;onSelectAirport:(a:Airport)=>void;
 onSelectManager:(m:Manager)=>void;onSelectCounty:(c:CountyChoice)=>void;
 onSelectTown:(t:TownChoice)=>void;onHoverRegion:(r:Region|null)=>void;
 onReady:(ready:boolean)=>void;onZoom:(percent:number)=>void;
};
export type LiveMapHandle={zoomIn:()=>void;zoomOut:()=>void;focus:()=>void;reset:()=>void};
const caName=new Map(CANADA_REGIONS.map(r=>[r.code,r.name]));
const caCode=new Map(CANADA_REGIONS.map(r=>[r.name.toLowerCase(),r.code]));
const hub=new Set(['ATL','ORD','DFW','DEN','LAX','JFK','EWR','BOS','MCO','MIA','CLT','SEA','SFO','IAH','MSP','DTW','LAS','PHX','SLC','YYZ','YVR','YUL']);
const empty=():Collection=>({type:'FeatureCollection',features:[]});
const ownerColors=['#56E4E5','#FF5F91','#A98BFF'] as const;
function territoryOwner(code:string,assignments:Assignment[],managers:Manager[],names:[string,string]){
 const members=new Set(assignments.filter(a=>a.stateCode===code).map(a=>a.managerId));
 const roles=new Set(managers.filter(m=>members.has(m.id)).map(m=>m.trainer).filter(Boolean));
 const a=roles.has(names[0]),b=roles.has(names[1]);
 return a&&b?'shared':a?'a':b?'b':roles.size?'other':'unassigned';
}
const ownershipColor=['match',['get','owner'],'a',ownerColors[0],
 'b',ownerColors[1],'shared',ownerColors[2],'other','#9AB7D2','#5A93AD'];

const countryBounds=(scope:'us'|'canada'): [[number,number],[number,number]]=>scope==='canada'?[[-141,41],[-52,83]]:[[-126,23.5],[-66,50.8]];
function codeOfProvince(p:Record<string,any>){
 const direct=String(p.postal||p.code||p.abbr||'').toUpperCase();
 if(caName.has(direct))return direct;
 const name=String(p.name||p.NAME||p.nom||p.province||'').toLowerCase();
 return ({'québec':'QC','quebec':'QC','newfoundland and labrador':'NL'} as Record<string,string>)[name]||caCode.get(name)||'';
}
function bbox(shape:FeatureShape):[[number,number],[number,number]]|null{
 let x0=180,y0=90,x1=-180,y1=-90,n=0;
 const walk=(v:any):void=>{
  if(!Array.isArray(v))return;
  if(typeof v[0]==='number'&&typeof v[1]==='number'){
   if(Number.isFinite(v[0])&&Number.isFinite(v[1])){
    x0=Math.min(x0,v[0]);y0=Math.min(y0,v[1]);x1=Math.max(x1,v[0]);y1=Math.max(y1,v[1]);n++;
   }
  }else for(const child of v)walk(child);
 };
 walk(shape.geometry?.coordinates);
 return n?[[x0,y0],[x1,y1]]:null;
}
const LiveTerritoryMap=forwardRef<LiveMapHandle,Props>(function LiveTerritoryMap(p,ref){
 const host=useRef<HTMLDivElement>(null);
 const map=useRef<GLInstance|null>(null);
 const latest=useRef(p);latest.current=p;
 const airportReferenceColor=p.theme==='light'?'#9B5B20':'#FFC49B';
 const airportSecondaryColor=p.theme==='light'?'#B66C3E':'#E5A06E';
 const airportSelectedColor=p.theme==='light'?'#087F90':'#42F8F1';
 const [ready,setReady]=useState(false);
 const states=useMemo<Collection>(()=>{
  const result=empty();
  try{
   const atlas=p.atlas as {objects?:{states?:unknown}};
   if(!atlas?.objects?.states)return result;
   const geo=feature(p.atlas as never,atlas.objects.states as never) as unknown as Collection;
   for(const item of geo.features){
    const state=STATES.find(s=>s.fips===String(item.id).padStart(2,'0'));
    if(state)result.features.push({type:'Feature',geometry:item.geometry,id:String(item.id),
     properties:{code:state.code,name:state.name,
       owner:territoryOwner(state.code,p.assignments,p.managers,p.trainerNames),urgency:p.regionPriorities[state.code]||'none',visits:p.visitCounts[state.code]||0,
       assigned:p.assignments.some(a=>a.stateCode===state.code)?1:0}});
   }
  }catch{/* Original SVG still provides geographic selection. */}
  return result;
 },[p.atlas,p.assignments,p.managers,p.trainerNames.join('|'),p.regionPriorities,p.visitCounts]);
 const provinces=useMemo<Collection>(()=>{
  const result=empty();
  for(const item of p.canadaFeatures){
   const code=codeOfProvince(item.properties||{});
   if(code)result.features.push({type:'Feature',geometry:item.geometry,id:code,
    properties:{code,name:caName.get(code)||code,
      owner:territoryOwner(code,p.assignments,p.managers,p.trainerNames),urgency:p.regionPriorities[code]||'none',visits:p.visitCounts[code]||0,
      assigned:p.assignments.some(a=>a.stateCode===code)?1:0}});
  }
  return result;
 },[p.canadaFeatures,p.assignments,p.managers,p.trainerNames.join('|'),p.regionPriorities,p.visitCounts]);
 const selectedGeo=p.scope==='canada'?provinces:states;
 const countyGeo=useMemo<Collection>(()=>{
   const out=empty();
   if(p.scope!=='us'||!p.region||!p.showCounties)return out;
   const fips=STATES.find(s=>s.code===p.region!.code)?.fips||'';
   if(!fips)return out;
   try{
     const topo=p.atlas as {objects?:{counties?:unknown}};
     if(!topo?.objects?.counties)return out;
     const counties=feature(p.atlas as never,topo.objects.counties as never) as unknown as Collection;
     for(const f of counties.features){
       const code=String(f.id||'').padStart(5,'0');
       if(code.slice(0,2)!==fips)continue;
       const assignment=p.assignments.filter(a=>a.areaType==='county'&&a.stateCode===p.region?.code&&a.areaCode===code);
       const names=new Set(p.managers.filter(m=>assignment.some(a=>a.managerId===m.id)).map(m=>m.trainer));
       const owner=names.has(p.trainerNames[0])&&names.has(p.trainerNames[1])?'shared':
         names.has(p.trainerNames[0])?'a':names.has(p.trainerNames[1])?'b':assignment.length?'other':'unassigned';
       out.features.push({type:'Feature',geometry:f.geometry,id:code,properties:{
         code,stateCode:p.region.code,name:p.countyNames[code]||code,
         assigned:assignment.length?1:0,owner
       }});
     }
   }catch{/* No invented county polygon when topology is unavailable. */}
   return out;
 },[p.atlas,p.scope,p.region?.code,p.showCounties,p.assignments,p.managers,p.countyNames,p.trainerNames.join('|')]);
 const townGeo=useMemo<Collection>(()=>{
   const out=empty();
   if(!p.region||p.scope!=='us'||!p.showTowns)return out;
   for(const town of p.towns){
     if(typeof town.lat!=='number'||typeof town.lon!=='number'||!Number.isFinite(town.lat)||!Number.isFinite(town.lon))continue;
     out.features.push({type:'Feature',geometry:{type:'Point',coordinates:[town.lon,town.lat]},id:town.code,
       properties:{code:town.code,stateCode:p.region.code,name:town.name}});
   }
   return out;
 },[p.region?.code,p.scope,p.towns,p.showTowns]);
 const airportGeo=useMemo<Collection>(()=>{
  const result=empty();
  if(p.airportLayer==='none')return result;
  for(const airport of p.airports){
   if(!airport.scheduled||typeof airport.lon!=='number'||typeof airport.lat!=='number')continue;
   if(p.scope==='canada'?!caName.has(airport.state):!STATES.some(st=>st.code===airport.state))continue;
   if(p.airportLayer!=='all'&&!hub.has(airport.iata)&&airport.state!==p.region?.code&&airport.iata!==p.homeCode)continue;
   result.features.push({type:'Feature',geometry:{type:'Point',coordinates:[airport.lon,airport.lat]},properties:{
    iata:airport.iata,state:airport.state,name:airport.name,
    major:airport.tier==='Major'?1:0,selected:airport.iata===p.selectedAirportId?1:0
   }});
  }
  return result;
 },[p.airports,p.airportLayer,p.region?.code,p.scope,p.homeCode,p.selectedAirportId]);
 const managerGeo=useMemo<Collection>(()=>{
  const result=empty();
  if(!p.showManagers)return result;
  for(const manager of p.managers){
   if(p.trainer!=='all'&&manager.trainer!==p.trainer)continue;
   const code=manager.baseState||p.assignments.find(a=>a.managerId===manager.id)?.stateCode||'';
   if(p.scope==='canada'?!caName.has(code):caName.has(code))continue;
   let lon=manager.lon,lat=manager.lat,approx=0;
   if(typeof lon!=='number'||typeof lat!=='number'||!Number.isFinite(lon)||!Number.isFinite(lat)){
    const shape=(p.scope==='canada'?provinces:states).features.find(s=>s.properties.code===code);
    const center=shape?geoCentroid(shape as never):null;
    const ca=CANADA_REGIONS.find(x=>x.code===code);
    if(center&&center.every(Number.isFinite)){lon=center[0];lat=center[1];approx=1;}
    else if(ca){lon=ca.lon;lat=ca.lat;approx=1;}
   }
   if(typeof lon==='number'&&typeof lat==='number'&&Number.isFinite(lon)&&Number.isFinite(lat)){
    result.features.push({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},
     properties:{id:manager.id,name:manager.name,trainer:manager.trainer,
      owner:manager.trainer===p.trainerNames[0]?'a':manager.trainer===p.trainerNames[1]?'b':'other',priority:p.priorities[manager.id]||'routine',approx}});
   }
  }
  return result;
 },[p.managers,p.assignments,p.trainer,p.showManagers,p.scope,states,provinces,p.trainerNames.join('|'),p.priorities]);
 const routeGeo=useMemo<Collection>(()=>{
   const out=empty();
   if(!p.route)return out;
   const {start,end}=p.route;
   const bend=Math.min(5,Math.max(1,Math.abs(end[0]-start[0])*.08));
   const coords=Array.from({length:35},(_,i)=>{
     const t=i/34;
     return [start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t+Math.sin(t*Math.PI)*bend];
   });
   out.features.push({type:'Feature',geometry:{type:'LineString',coordinates:coords},
     properties:{kind:'Schematic planning reference; not a booked flight'}});
   return out;
 },[p.route?.start?.[0],p.route?.start?.[1],p.route?.end?.[0],p.route?.end?.[1]]);
 const dataRef=useRef({selectedGeo,airportGeo,managerGeo,routeGeo,countyGeo,townGeo});
 dataRef.current={selectedGeo,airportGeo,managerGeo,routeGeo,countyGeo,townGeo};
 const adjust=(instance:GLInstance,region:Region|null,duration=450)=>{
  const viewportWidth=instance.getContainer().clientWidth;
  const floats=typeof window!=='undefined'&&window.innerWidth>1270&&viewportWidth>=850;
  const opts={padding:{left:42,right:region&&floats?Math.min(368,viewportWidth*.33):42,top:65,bottom:65},duration,maxZoom:8.2};
  if(!region){instance.fitBounds(countryBounds(latest.current.scope),{...opts,padding:42});return;}
  const shapes=latest.current.scope==='canada'?provinces:states;
  const match=shapes.features.find(f=>f.properties.code===region.code);
  const box=region.code==='AK'?[[-171,51],[-129,72]] as [[number,number],[number,number]]:
   region.code==='HI'?[[-162,18],[-154,23]] as [[number,number],[number,number]]:match?bbox(match):null;
  if(box)instance.fitBounds(box,opts);
  else{
   const c=CANADA_REGIONS.find(x=>x.code===region.code);
   if(c)instance.easeTo({center:[c.lon,c.lat],zoom:5,duration});
  }
 };
 const adjustRef=useRef(adjust);adjustRef.current=adjust;
 useImperativeHandle(ref,()=>({
  zoomIn(){map.current?.zoomIn({duration:230});},
  zoomOut(){map.current?.zoomOut({duration:230});},
  focus(){if(map.current)adjustRef.current(map.current,latest.current.region);},
  reset(){if(map.current)adjustRef.current(map.current,null);}
 }),[]);
 useEffect(()=>{
  const node=host.current;if(!node||typeof window==='undefined')return;
  let disposed=false;let instance:GLInstance|null=null;
  const report=(value:boolean)=>{if(disposed)return;setReady(value);latest.current.onReady(value);};
  report(false);
  try{
   instance=new GLMap({
    container:node,
    style:'https://tiles.openfreemap.org/styles/'+(p.theme==='light'?'positron':p.styleChoice==='roads'?'dark':'fiord'),
    center:[-98,39],zoom:3,attributionControl:false,
    minZoom:1.7,maxZoom:13,dragRotate:false,cooperativeGestures:false
   });
   map.current=instance;
   const mapInstance=instance;
   mapInstance.setMissingStyleImageResolver(async imageId=>{
    if(imageId!=='circle-11'||mapInstance.hasImage(imageId))return;
    const data=new Uint8Array(11*11*4);
    for(let y=0;y<11;y++)for(let x=0;x<11;x++){
     const distance=Math.hypot(x-5,y-5);
     if(distance>4.5)continue;
     const offset=(y*11+x)*4;
     const border=distance>=3.5;
     data[offset]=border?243:105;
     data[offset+1]=border?251:161;
     data[offset+2]=border?255:185;
     data[offset+3]=255;
    }
    mapInstance.addImage(imageId,{width:11,height:11,data});
   });
   instance.addControl(new AttributionControl({compact:true}),'bottom-right');
   instance.touchZoomRotate.disableRotation();
   instance.on('zoom',()=>{if(!disposed&&instance)latest.current.onZoom(Math.round(100*Math.pow(2,instance.getZoom()-3)));});
   // A basemap that cannot retrieve tiles is not an empty success state.
   // After repeated failed map resources, expose the keyboard-accessible
   // bundled SVG map; the map source toggle lets users retry.
   let externalErrors=0;
   let mapFailed=false;
   let mapPresented=false;
   instance.on('error',()=>{
     if(!disposed&&++externalErrors>=8){
       mapFailed=true;
       mapPresented=false;
       report(false);
     }
   });
   const i=instance;
   instance.on('load',()=>{
    if(disposed)return;
    try{
     const names=i.getStyle().layers||[];
     // Map foundation is intentionally re-colored, not merely outlined.
     // This uses the style's own discovered layers so it works with either
     // official public style variant and does not assume private tile schemas.
     if(p.styleChoice==='vice'){
       const dark=p.theme==='dark';
       const palette={
         water:dark?'#092D44':'#C6E5EC',
         land:dark?'#0C2538':'#F1F8F9',
         parks:dark?'#154E52':'#D7F0E9',
         roads:dark?'#397486':'#A6C8D0',
         minorRoads:dark?'#2A5067':'#C7DCE2',
         borders:dark?'#4A839B':'#87A8B8'
       };
       for(const layer of names){
         const id=layer.id.toLowerCase();
         if(id.startsWith('atlas-'))continue;
         let property:'background-color'|'fill-color'|'line-color'|null=null;
         let color='';
         if(layer.type==='background'){property='background-color';color=palette.land;}
         else if(layer.type==='fill'&&/water|lake|ocean|sea|river/.test(id)){
           property='fill-color';color=palette.water;
         }else if(layer.type==='fill'&&/park|grass|forest|wood|landcover|green/.test(id)){
           property='fill-color';color=palette.parks;
         }else if(layer.type==='line'&&/boundary|admin/.test(id)){
           property='line-color';color=palette.borders;
         }else if(layer.type==='line'&&/waterway|river|canal/.test(id)){
           property='line-color';color=palette.water;
         }else if(layer.type==='line'&&/motorway|trunk|primary|highway/.test(id)){
           property='line-color';color=palette.roads;
         }else if(layer.type==='line'&&/road|street|secondary|tertiary/.test(id)){
           property='line-color';color=palette.minorRoads;
         }
         if(property){
           try{i.setPaintProperty(layer.id,property,color);}
           catch{/* Unknown provider layers keep their original paint. */}
         }
       }
     }
     // Suppress only provider level-one region labels duplicated by Atlas labels.
     for(const layer of names){
       const name=layer.id.toLowerCase();
       if(layer.type==='symbol' &&
         /(?:state|province|admin[_-]?1|admin[_-]?level[_-]?1)/.test(name) &&
         /(?:label|name|text)/.test(name) &&
         !/(?:city|town|airport|highway)/.test(name)){
         try{i.setLayoutProperty(layer.id,'visibility','none');}catch{}
       }
     }
     const before=names.find(l=>l.type==='symbol')?.id;
     const add=(name:string,data:Collection,cluster=false)=>{
      i.addSource(name,{type:'geojson',data:data as any,...(cluster?{cluster:true,clusterRadius:42,clusterMaxZoom:6}:{})});
     };
     add('atlas-states',dataRef.current.selectedGeo);
     i.addLayer({id:'atlas-fill',source:'atlas-states',type:'fill',
      paint:{'fill-color':ownershipColor as any,
       'fill-opacity':['case',['==',['get','assigned'],1],.24,.065]}},before);
     i.addLayer({id:'atlas-selected-halo',source:'atlas-states',type:'line',
        filter:['==',['get','code'],''],paint:{'line-color':'#FF5F91','line-width':4.5,'line-blur':1.4,'line-opacity':.14}},before);
     i.addLayer({id:'atlas-state-outline',source:'atlas-states',type:'line',
      paint:{'line-color':ownershipColor as any,
       'line-width':['interpolate',['linear'],['zoom'],2,1.05,7,2.1],
        'line-opacity':.74}},before);
     i.addLayer({id:'atlas-selected-outline',source:'atlas-states',type:'line',
       filter:['==',['get','code'],''],paint:{'line-color':'#FFE4EC','line-width':2.6}},before);
     add('atlas-counties',dataRef.current.countyGeo);
     i.addLayer({id:'atlas-county-hits',source:'atlas-counties',type:'fill',minzoom:4.2,
       paint:{'fill-color':['case',['==',['get','assigned'],1],'#A98BFF','#48CEE3'],
              'fill-opacity':['case',['==',['get','assigned'],1],.14,.015]}});
     i.addLayer({id:'atlas-county-boundaries',source:'atlas-counties',type:'line',minzoom:4.2,
       paint:{'line-color':['case',['==',['get','assigned'],1],'#E1BBFF','#79B9CA'],
              'line-width':['interpolate',['linear'],['zoom'],4,0.4,8,1.25],
              'line-opacity':['interpolate',['linear'],['zoom'],4.2,.26,8,.68]}});
     i.addLayer({id:'atlas-selected-county',source:'atlas-counties',type:'line',
        filter:['==',['get','code'],''],paint:{'line-color':'#FFB6CE','line-width':2.1,
         'line-opacity':1}});
     add('atlas-towns',dataRef.current.townGeo);
     i.addLayer({id:'atlas-town-points',source:'atlas-towns',type:'circle',minzoom:7,
        paint:{'circle-color':'#56E4E5','circle-radius':2.9,'circle-opacity':.68,
              'circle-stroke-color':'#0C2943','circle-stroke-width':1.1}});
     i.addLayer({id:'atlas-town-labels',source:'atlas-towns',type:'symbol',minzoom:7,
       layout:{'text-field':['get','name'],'text-size':10.5,'text-font':['Noto Sans Regular'],
               'text-offset':[0,1.6],'text-allow-overlap':false},
       paint:{'text-color':p.theme==='light'?'#15485C':'#EAF8FB',
              'text-halo-color':p.theme==='light'?'#F1FAFD':'#0D2B3E',
              'text-halo-width':1.4}});
     add('atlas-route',dataRef.current.routeGeo);
     i.addLayer({id:'atlas-route-glow',source:'atlas-route',type:'line',
         paint:{'line-color':'#FF5F91','line-width':4.5,'line-opacity':.08,'line-blur':1.3}});
     i.addLayer({id:'atlas-route-dash',source:'atlas-route',type:'line',
        paint:{'line-color':'#FF7FA5','line-width':2.2,'line-opacity':.82,'line-dasharray':[2.5,2]}});
     add('atlas-airports',dataRef.current.airportGeo);
     i.addLayer({id:'atlas-airport-halo',source:'atlas-airports',type:'circle',
       paint:{'circle-color':airportReferenceColor,'circle-radius':6,'circle-opacity':.12,'circle-blur':.25}});
     i.addLayer({id:'atlas-airport-dots',source:'atlas-airports',type:'circle',
       paint:{'circle-color':['case',['==',['get','selected'],1],airportSelectedColor,
         ['==',['get','major'],1],airportReferenceColor,airportSecondaryColor],
       'circle-radius':['case',['==',['get','selected'],1],7,['==',['get','major'],1],4.7,3],
        'circle-stroke-color':p.theme==='light'?'#FFFFFF':'#102A3E','circle-stroke-width':1.65}});
     i.addLayer({id:'atlas-airport-names',source:'atlas-airports',type:'symbol',minzoom:5.2,
      layout:{'text-field':['get','iata'],'text-font':['Noto Sans Bold'],'text-size':11,'text-offset':[0,1.5]},
      paint:{'text-color':p.theme==='light'?'#153A4E':'#EFF9FE','text-halo-width':1.6,
       'text-halo-color':p.theme==='light'?'#F1F9FC':'#091F32'}});
     add('atlas-managers',dataRef.current.managerGeo,true);
     i.addLayer({id:'atlas-manager-groups',source:'atlas-managers',type:'circle',filter:['has','point_count'],
      paint:{'circle-color':p.lens==='coaching'?'#FF5FAA':'#42F8F1','circle-stroke-color':'#FFF','circle-stroke-width':2,'circle-radius':17}});
     i.addLayer({id:'atlas-manager-numbers',source:'atlas-managers',type:'symbol',filter:['has','point_count'],
      layout:{'text-field':['get','point_count_abbreviated'],'text-font':['Noto Sans Bold'],'text-size':12},
      paint:{'text-color':'#102F45'}});
     i.addLayer({id:'atlas-manager-dots',source:'atlas-managers',type:'circle',filter:['!',['has','point_count']],
       paint:{'circle-color':(p.lens==='coaching'?['match',['get','priority'],'high','#FF5F91','moderate','#FFC46C','#56E4E5']:ownershipColor) as any,
        'circle-stroke-color':['case',['==',['get','approx'],1],'#FFBB77','#081C30'],
        'circle-stroke-width':2.5,'circle-radius':['case',['==',['get','approx'],1],5.3,7]}});
     i.addLayer({id:'atlas-state-codes',source:'atlas-states',type:'symbol',minzoom:4.3,
      layout:{'text-field':['get','code'],'text-font':['Noto Sans Bold'],'text-size':12,'text-allow-overlap':false},
      paint:{'text-color':p.theme==='light'?'#17354A':'#F6FBFE',
       'text-halo-color':p.theme==='light'?'#EDF8FB':'#08263A','text-halo-width':1.8}});
     i.on('click','atlas-fill',(e:any)=>{
      // Markers take priority over their underlying state polygon.
      if(i.queryRenderedFeatures(e.point,{layers:['atlas-airport-dots','atlas-manager-dots','atlas-manager-groups','atlas-town-points','atlas-town-labels','atlas-county-hits']}).length)return;
      const code=String(e.features?.[0]?.properties?.code||'');
      const scope=latest.current.scope;
      const r=(scope==='canada'?CANADA_REGIONS:STATES).find(x=>x.code===code);
      if(r)latest.current.onSelectRegion({code,name:r.name,country:scope==='canada'?'CA':'US'});
     });
     i.on('click','atlas-county-hits',(e:any)=>{
       const code=String(e.features?.[0]?.properties?.code||'');
       if(code.length!==5)return;
       const f=e.features?.[0]?.properties||{};
       latest.current.onSelectCounty({code,name:String(f.name||code),stateCode:String(f.stateCode||'')});
     });
     i.on('click','atlas-town-points',(e:any)=>{
       const f=e.features?.[0]?.properties||{};
       if(f.code)latest.current.onSelectTown({code:String(f.code),name:String(f.name||f.code),stateCode:String(f.stateCode||'')});
     });
     i.on('click','atlas-town-labels',(e:any)=>{
       const f=e.features?.[0]?.properties||{};
       if(f.code)latest.current.onSelectTown({code:String(f.code),name:String(f.name||f.code),stateCode:String(f.stateCode||'')});
     });
     // Updating React for every pointer pixel triggered unnecessary
     // rerenders of map geometry and labels; notify only on region change.
     let hoveredCode='';
     i.on('mousemove','atlas-fill',(e:any)=>{
       const f=e.features?.[0]?.properties||{};
       const s=(latest.current.scope==='canada'?CANADA_REGIONS:STATES).find(x=>x.code===f.code);
       if(s&&s.code!==hoveredCode){
         hoveredCode=s.code;
         latest.current.onHoverRegion({code:s.code,name:s.name,country:latest.current.scope==='canada'?'CA':'US'});
       }
     });
     i.on('mouseleave','atlas-fill',()=>{
       if(!hoveredCode)return;
       hoveredCode='';latest.current.onHoverRegion(null);
     });
     i.on('click','atlas-airport-dots',(e:any)=>{
      const code=String(e.features?.[0]?.properties?.iata||'');
      const airport=latest.current.airports.find(x=>x.iata===code);
      if(airport)latest.current.onSelectAirport(airport);
     });
     i.on('click','atlas-manager-dots',(e:any)=>{
      const id=String(e.features?.[0]?.properties?.id||'');
      const manager=latest.current.managers.find(x=>x.id===id);
      if(manager)latest.current.onSelectManager(manager);
     });
     i.on('click','atlas-manager-groups',(e:any)=>{
      const center=e.features?.[0]?.geometry?.coordinates;
      if(Array.isArray(center)&&center.length>=2)i.easeTo({center:[Number(center[0]),Number(center[1])],zoom:Math.min(9,i.getZoom()+1.6),duration:500});
     });
     for(const layer of ['atlas-fill','atlas-county-hits','atlas-town-points','atlas-town-labels','atlas-airport-dots','atlas-manager-dots','atlas-manager-groups']){
      i.on('mouseenter',layer,()=>{i.getCanvas().style.cursor='pointer';});
      i.on('mouseleave',layer,()=>{i.getCanvas().style.cursor='grab';});
     }
     adjustRef.current(i,latest.current.region,0);
     // MapLibre's load event can fire when the style exists but no map
     // tiles have been fetched yet. Keep our bundled map visible until
     // idle and actual tile completion.
     i.on('idle',()=>{
       if(disposed||mapFailed||mapPresented||!i.areTilesLoaded())return;
       mapPresented=true;
       report(true);
     });
    }catch{report(false);}
   });
  }catch{report(false);}
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{if(!disposed)map.current?.resize();}):null;
  observer?.observe(node);
  return ()=>{disposed=true;observer?.disconnect();map.current=null;try{instance?.remove();}catch{}};
 },[p.scope,p.theme,p.styleChoice]);
 useEffect(()=>{
  const i=map.current;if(!ready||!i)return;
  try{
   (i.getSource('atlas-states') as GeoJSONSource).setData(selectedGeo as any);
   (i.getSource('atlas-counties') as GeoJSONSource).setData(countyGeo as any);
   (i.getSource('atlas-towns') as GeoJSONSource).setData(townGeo as any);
   (i.getSource('atlas-airports') as GeoJSONSource).setData(airportGeo as any);
   (i.getSource('atlas-route') as GeoJSONSource).setData(routeGeo as any);
   (i.getSource('atlas-managers') as GeoJSONSource).setData(managerGeo as any);
   i.setLayoutProperty('atlas-state-codes','visibility',p.showLabels?'visible':'none');
   const code=p.region?.code||'';
   i.setFilter('atlas-selected-county',['==',['get','code'],p.selectedCounty]);
   i.setFilter('atlas-selected-outline',['==',['get','code'],code]);
   i.setFilter('atlas-selected-halo',['==',['get','code'],code]);
   const riskColor=['match',['get','urgency'],'high','#FF5FAA','moderate','#FFC46C','routine','#35DCD1','#34536C'] as any;
   const visitColor=['interpolate',['linear'],['get','visits'],0,'#355B6F',1,'#FFC37D',3,'#FF84B5',6,'#FF55A3'] as any;
   i.setPaintProperty('atlas-fill','fill-opacity',
     p.lens==='coaching'
       ?['case',['==',['get','code'],code],.55,['==',['get','urgency'],'none'],.045,.38]
       :p.lens==='visits'
         ?['case',['==',['get','code'],code],.63,['>',['get','visits'],0],.53,.055]
         :['case',['==',['get','code'],code],.34,['==',['get','assigned'],1],p.showAssigned?.21:.085,.065]);
   i.setPaintProperty('atlas-fill','fill-color',
     p.lens==='coaching'?riskColor:p.lens==='visits'?visitColor:
       ['case',['==',['get','code'],code],'#FF5F91',ownershipColor] as any);
   i.setPaintProperty('atlas-state-outline','line-color',
     p.lens==='coaching'?riskColor:p.lens==='visits'?visitColor:ownershipColor as any);
     i.setPaintProperty('atlas-manager-dots','circle-color',(p.lens==='coaching'?['match',['get','priority'],'high','#FF5F91','moderate','#FFC46C','#56E4E5']:ownershipColor) as any);
   i.setPaintProperty('atlas-manager-groups','circle-color',p.lens==='coaching'?'#FF5FAA':'#42F8F1');
  }catch{/* Original SVG is independently available. */}
 },[selectedGeo,countyGeo,townGeo,airportGeo,managerGeo,routeGeo,p.showAssigned,p.showLabels,p.selectedCounty,p.region?.code,p.lens,ready]);
 useEffect(()=>{if(ready&&map.current)adjust(map.current,p.region,450);},[ready,p.region?.code,p.region?.country]);
 return <div ref={host} className={'atlas-live-map'+(ready?' atlas-live-map-ready':'')} role="application"
  aria-label="Interactive geographic map showing roads, cities, state territories, airports and field managers"/>;
});
export default LiveTerritoryMap;
