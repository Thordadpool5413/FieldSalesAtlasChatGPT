import { ArrowRight,CalendarDays,Command,MapPin,Plane,PlaneTakeoff,Search,Users,X } from 'lucide-react';
import { useEffect,useMemo,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { CANADA_REGIONS,CANADA_REGION_BY_CODE } from './CanadaRegions';
import type { Page } from './Operations';
import { useOp } from './Operations';
import type { Visit } from './opsModels';
import { STATES,dateLabel } from './opsModels';
import { api } from './workspaceApi';

type Result = {
  id:string; kind:'person'|'region'|'airport'|'county'|'place'|'zip'|'zcta'|'visit'|'trip'|'tool'; label:string; detail:string;
  managerId?:string; regionCode?:string; country?:'US'|'CA'; airportCode?:string; areaCode?:string;
  visit?:Visit;
  page?:Page;
};


const TOOL_CATALOG:Array<{page:Page;label:string;detail:string;terms:string}> = [
  {page:'home',label:'Atlas map',detail:'Interactive territory geography',terms:'states map geography'},
  {page:'mission',label:'Mission Control',detail:'Readiness and field priorities',terms:'dashboard mission overview'},
  {page:'plan',label:'Travel',detail:'Field travel workspace',terms:'travel booking flight planning'},
  {page:'radar',label:'Flight DNA',detail:'Flight history and aviation intelligence',terms:'weather delays flight radar'},
  {page:'booked',label:'Booked Flights',detail:'Review imported itinerary',terms:'flight guardian ticket'},
  {page:'air',label:'Travel planner',detail:'Airport and trip options',terms:'route airports comparison'},
  {page:'coordinate',label:'Trainer Coordination',detail:'Shared coverage and visit recommendations',terms:'two-trainer availability work'},
  {page:'week',label:'Our Week',detail:'Team weekly schedule',terms:'shared weekly agenda'},
  {page:'people',label:'People',detail:'Manager directory',terms:'contacts roster'},
  {page:'coaching',label:'Coaching Desk',detail:'Observations and commitments',terms:'ride along notes follow-up'},
  {page:'calendar',label:'Calendar',detail:'Visits and availability',terms:'appointments agenda'},
  {page:'overview',label:'Reports and Coverage Pulse',detail:'Interactive regional data visualization',terms:'dashboard charts distribution metrics'},
  {page:'map',label:'Territory Explorer',detail:'Counties, towns, ZIPs and airports',terms:'geography county drilldown'},
  {page:'data',label:'Data & Exports',detail:'Imports and downloaded records',terms:'csv download backup'},
  {page:'team',label:'Sharing & Recovery',detail:'Workspace collaboration and recovery',terms:'shared access restore'}
];
const LAUNCH_TOOLS:Page[]=['home','mission','radar','coordinate','overview','calendar'];

export default function GlobalFinder(){
  const ctx=useOp();
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [index,setIndex]=useState(0);
  const [nationalZctas,setNationalZctas]=useState<Array<{code:string;year:number}>>([]);
  const [nationalStatus,setNationalStatus]=useState<'idle'|'loading'|'unavailable'|'ready'>('idle');
  useEffect(()=>{
    const prefix=query.trim();
    if(!open||ctx.identity!=='member'||!/^\d{2,5}$/.test(prefix)){
      setNationalZctas([]);setNationalStatus('idle');
      return;
    }
    let active=true;
    setNationalStatus('loading');setNationalZctas([]);
    const job=setTimeout(()=>{
      void api.get('/api/locations/zcta?prefix='+prefix).then(reply=>{
        if(!active)return;
        const payload=reply.data as {available:boolean;results?:Array<{code:string}>;sourceYear?:number};
        setNationalZctas(payload.available
          ?(payload.results||[]).map(a=>({code:a.code,year:payload.sourceYear||2026})):[]);
        setNationalStatus(payload.available?'ready':'unavailable');
      }).catch(()=>{
        if(active){setNationalZctas([]);setNationalStatus('unavailable');}
      });
    },370);
    return()=>{active=false;clearTimeout(job);};
  },[open,query,ctx.identity]);
  const field=useRef<HTMLInputElement>(null);
  const dialogRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    function onKey(event:KeyboardEvent){
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();setOpen(v=>!v);
      }else if(event.key==='Escape')setOpen(false);
    }
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[]);
  useEffect(()=>{
    if(!open)return;
    const old=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    field.current?.focus();
    function trapKeyboard(event:KeyboardEvent){
      if(event.key!=='Tab')return;
      const controls=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'input:not([disabled]),button:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]'
      )||[]).filter(element=>element.getClientRects().length>0);
      if(!controls.length)return;
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
    window.addEventListener('keydown',trapKeyboard);
    return ()=>{
      window.removeEventListener('keydown',trapKeyboard);
      document.body.style.overflow=overflow;
      old?.focus({preventScroll:true});
    };
  },[open]);
  const results=useMemo(()=>{
    const value=query.trim().toLowerCase();
    if(value.length<2)return [] as Result[];
    const people=(ctx.board.managers||[])
      .filter(m=>(m.name+' '+m.baseCity+' '+m.baseState+' '+m.trainer).toLowerCase().includes(value))
      .slice(0,7).map(m=>({
        id:'person:'+m.id,kind:'person' as const,label:m.name,
        detail:[m.baseCity,m.baseState,m.trainer].filter(Boolean).join(' · ')||'Territory manager',
        managerId:m.id,
      }));
    const region=[
      ...STATES.map(s=>({code:s.code,name:s.name,country:'US' as const})),
      ...CANADA_REGIONS.map(s=>({code:s.code,name:s.name,country:'CA' as const}))
    ].filter(s=>(s.name+' '+s.code).toLowerCase().includes(value))
      .slice(0,7).map(s=>({
        id:s.country+':'+s.code,kind:'region' as const,label:s.name,
        detail:s.country==='US'?'U.S. state':'Canadian province or territory',
        regionCode:s.code,country:s.country,
      }));
    const counties=(ctx.geo.state===ctx.state?ctx.geo.counties:[])
      .filter(area=>(area.name+' '+area.code).toLowerCase().includes(value))
      .slice(0,7).map(area=>({
        id:'county:'+area.code,kind:'county' as const,
        label:area.name,detail:'County in '+ctx.geo.state+' · Loaded Census directory',
        areaCode:area.code,regionCode:ctx.geo.state,country:'US' as const,
      }));
    const places=(ctx.geo.state===ctx.state?ctx.geo.places:[])
      .filter(area=>(area.name+' '+area.code).toLowerCase().includes(value))
      .slice(0,6).map(area=>({
        id:'place:'+ctx.state+':'+area.code,kind:'place' as const,label:area.name,
        detail:'Loaded Census place · '+ctx.state+' · Open territory explorer',
        areaCode:area.code,regionCode:ctx.state,country:'US' as const,
      }));
    const foundZip=new Set<string>();
    const zipAreas=(ctx.board.assignments||[])
      .filter(a=>a.areaType==='zip'&&String(a.areaCode||'').length===5 &&
        (a.areaCode+' '+a.stateCode).toLowerCase().includes(value))
      .filter(a=>{
        const id=a.stateCode+':'+a.areaCode;
        if(foundZip.has(id))return false;
        foundZip.add(id);return true;
      }).slice(0,6).map(a=>({
        id:'zip:'+a.stateCode+':'+a.areaCode,kind:'zip' as const,
        label:'ZIP '+a.areaCode,
        detail:'Saved ZIP territory · '+a.stateCode+' · Open territory explorer',
        areaCode:a.areaCode,regionCode:a.stateCode,country:'US' as const,
      }));
    const airports=ctx.airports
      .filter(a=>(a.iata+' '+a.name+' '+a.state).toLowerCase().includes(value))
      .slice(0,7).map(a=>({
        id:'airport:'+a.iata+':'+a.state,kind:'airport' as const,
        label:a.iata+' · '+a.name,
        detail:(a.tier||'Airport')+' · '+a.state+' · Confirm flights with provider',
        regionCode:a.state,country:CANADA_REGION_BY_CODE[a.state]?'CA' as const:'US' as const,
        airportCode:a.iata,
      }));
    const savedVisits=(ctx.board.visits||[]).filter(v=>{
      const manager=(ctx.board.managers||[]).find(m=>m.id===v.managerId);
      return [manager?.name,v.stateCode,v.date,v.objective,v.location,v.trainer]
        .filter(Boolean).join(' ').toLowerCase().includes(value);
    }).slice(0,5).map(v=>({
      id:'visit:'+v.id,kind:'visit' as const,
      label:(ctx.board.managers||[]).find(m=>m.id===v.managerId)?.name||'Coaching visit',
      detail:'Coaching visit · '+dateLabel(v.date)+' · '+v.status,visit:v,
    }));
    const savedTrips=(ctx.board.trips||[]).filter(t=>
      [t.title,t.trainer,t.arrivalAirport,t.startDate,...(t.stops||[]).map(s=>s.stateCode)]
        .filter(Boolean).join(' ').toLowerCase().includes(value)
    ).slice(0,5).map(t=>({
      id:'trip:'+t.id,kind:'trip' as const,label:t.title||'Field trip',
      detail:'Saved trip · '+dateLabel(t.startDate)+' · Open trip planner',
    }));
    const censusZctas=nationalZctas
      .slice(0,8).map(item=>({
        id:'zcta:'+item.code,kind:'zcta' as const,label:'Census ZCTA '+item.code,
        detail:item.year+' U.S. Census · Nationwide geographic reference · Open ZCTA Explorer',
        areaCode:item.code
      }));
    const toolMatches=TOOL_CATALOG
      .filter(x=>(x.label+' '+x.detail+' '+x.terms).toLowerCase().includes(value))
      .slice(0,7).map(x=>({id:'tool:'+x.page,kind:'tool' as const,
        label:x.label,detail:'TOOL · '+x.detail,page:x.page}));
    return [...censusZctas,...people,...region,...airports,...toolMatches,...zipAreas,...counties,...places,...savedVisits,...savedTrips].slice(0,30);
  },[query,nationalZctas,ctx.board.managers,ctx.board.visits,ctx.board.trips,ctx.airports,ctx.geo.state,ctx.geo.counties,ctx.geo.places,ctx.board.assignments,ctx.state]);
  function choose(result:Result){
    if(result.kind==='tool'&&result.page){
      ctx.go(result.page);
    }else if(result.kind==='person'&&result.managerId){
      ctx.setSelectedManager(result.managerId);ctx.go('managers');
    }else if(result.kind==='visit'&&result.visit){
      if(ctx.identity==='member')ctx.open('visit',result.visit);
      else ctx.go('calendar');
    }else if(result.kind==='trip'){
      ctx.go('trips');
    }else if(result.kind==='zcta'&&result.areaCode){
      ctx.setSelectedCounty('');
      ctx.setZctaFocus(result.areaCode);
      ctx.go('map');
    }else if((result.kind==='place'||result.kind==='zip')&&result.regionCode){
      ctx.setState(result.regionCode);
      ctx.setMapMode('state');
      ctx.setSelectedCounty('');
      ctx.go('map');
    }else if(result.kind==='county'&&result.regionCode&&result.areaCode){
      ctx.setState(result.regionCode);
      ctx.setMapMode('state');
      ctx.setSelectedCounty(result.areaCode);
      ctx.go('map');
    }else if(result.regionCode&&result.country){
      ctx.jumpToAtlas({code:result.regionCode,country:result.country},result.airportCode);
    }
    setOpen(false);setQuery('');setIndex(0);
  }
  return <>
    <button type='button' className='fsa-command-trigger' onClick={()=>setOpen(true)}
      aria-label='Search people, places, trips and workspace tools' title='Search Field Sales Atlas (Ctrl or Command + K)'>
      <Search size={19}/><span>Search the field</span><kbd>⌘ K</kbd>
    </button>
    {open&&createPortal(<div className='fsa-command-backdrop' onMouseDown={event=>{
      if(event.target===event.currentTarget)setOpen(false);
    }}>
      <div className='fsa-command-dialog' ref={dialogRef} role='dialog' aria-modal='true' aria-label='Search the Field Sales Atlas'>
        <div className='fsa-command-input'>
          <Search size={22}/>
          <input ref={field} value={query} onChange={event=>{setQuery(event.target.value);setIndex(0);}}
            role='combobox' aria-expanded={Boolean(results.length)} aria-autocomplete='list'
            aria-controls='fsa-finder-results'
            aria-activedescendant={results.length?'fsa-find-'+Math.min(index,results.length-1):undefined}
            placeholder='Managers, airports, Census ZCTAs, flights or tools...'
            onKeyDown={event=>{
              if(event.key==='ArrowDown'&&results.length){event.preventDefault();setIndex(i=>(i+1)%results.length);}
              if(event.key==='ArrowUp'&&results.length){event.preventDefault();setIndex(i=>(i-1+results.length)%results.length);}
              if(event.key==='Enter'&&results.length){event.preventDefault();choose(results[Math.min(index,results.length-1)]);}
            }}/>
          <button type='button' onClick={()=>setOpen(false)} aria-label='Close search'><X size={19}/></button>
        </div>
        <div className='fsa-command-results' role={query.trim().length>=2?'listbox':undefined} id='fsa-finder-results' aria-label='Search results'>
          {/^\d{2,5}$/.test(query.trim())&&nationalStatus==='loading'&&<div className='fsa-command-source-status' role='status'>Searching the national Census ZCTA reference…</div>}
          {/^\d{2,5}$/.test(query.trim())&&nationalStatus==='unavailable'&&<div className='fsa-command-source-status' role='status'>National Census search is unavailable; saved ZIP assignments remain searchable.</div>}
          {query.trim().length<2?<div className='fsa-command-empty'><Command size={24}/>
            <strong>People, places and plans. One search.</strong>
            <p>Find managers, flights, tools, and nationwide Census ZIP tabulation areas.</p>
             <div className='fsa-command-shortcuts' role='group' aria-label='Launch a field tool'>
               {TOOL_CATALOG.filter(item=>LAUNCH_TOOLS.includes(item.page)).map(item=>
                 <button type='button' key={item.page}
                   onClick={()=>{ctx.go(item.page);setOpen(false);setQuery('');setIndex(0);}}>
                   <Command size={15}/><span>{item.label}</span><ArrowRight size={14}/>
                 </button>)}
             </div>
          </div>:results.length?results.map((result,i)=>{
            const Icon=result.kind==='tool'?Command:result.kind==='person'?Users:result.kind==='airport'?Plane:
              result.kind==='visit'?CalendarDays:result.kind==='trip'?PlaneTakeoff:MapPin;
            return <button type='button' role='option' aria-selected={i===index} id={'fsa-find-'+i}
              key={result.id} className={i===index?'is-active':''}
              onMouseEnter={()=>setIndex(i)} onClick={()=>choose(result)}>
              <span className='fsa-command-item-icon'><Icon size={18}/></span>
              <span><strong>{result.label}</strong><small>{result.detail}</small></span>
              <ArrowRight size={18}/>
            </button>;
          }):<div className='fsa-command-empty'><Search size={24}/>
            <strong>No matching item found</strong><p>Try a manager, airport, trip or Census ZCTA. Cities and counties use the loaded state, and some USPS delivery ZIPs have no Census ZCTA.</p>
          </div>}
        </div>
        <div className='fsa-command-footer'><span>↑ ↓ Navigate</span><span>Enter Select</span><span>Esc Close</span></div>
      </div>
    </div>,document.querySelector('.mv-app')||document.body)}
  </>;
}
