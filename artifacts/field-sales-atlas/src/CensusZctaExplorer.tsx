import { ArrowRight,Compass,ExternalLink,Globe2,MapPin,Plane,Radar,RefreshCw,Search,ShieldCheck } from 'lucide-react';
import { useEffect,useMemo,useState } from 'react';
import './CensusZctaExplorer.css';
import { useOp } from './Operations';
import { distanceMiles,STATE_BY_CODE } from './opsModels';
import { api } from './workspaceApi';

type Zcta={code:string;lat:number;lon:number;landSqMiles:number|null};
type Found={
  available:boolean;results:Zcta[];indexedCount:number;sourceYear:number;
  source:string;sourceUrl?:string;message?:string;
};
type Detail={
  found:boolean;code:string;stateCode?:string|null;county?:string|null;
  locationStatus?:string;message?:string;sourceYear?:number;
};
const reference='https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html';
export default function CensusZctaExplorer({initialCode}:{initialCode?:string}){
  const ctx=useOp();
  const [query,setQuery]=useState(initialCode||'');
  useEffect(()=>{if(initialCode&&/^\d{5}$/.test(initialCode))setQuery(initialCode);},[initialCode]);
  const [data,setData]=useState<Found|null>(null);
  const [selected,setSelected]=useState<Zcta|null>(null);
  const [detail,setDetail]=useState<Detail|null>(null);
  const [busy,setBusy]=useState(false);
  const [resolving,setResolving]=useState(false);
  const [error,setError]=useState('');
  const valid=/^\d{2,5}$/.test(query);

  useEffect(()=>{
    let active=true;
    setSelected(null);setDetail(null);setError('');
    if(!valid){setData(null);setBusy(false);return()=>{active=false;};}
    setBusy(true);setData(null);
    const timer=setTimeout(()=>{
      void api.get('/api/locations/zcta?prefix='+query)
        .then(response=>{if(active)setData(response.data as Found);})
        .catch(()=>{if(active)setError('The Census national reference is unavailable. Retry when online.');})
        .finally(()=>{if(active)setBusy(false);});
    },380);
    return()=>{active=false;clearTimeout(timer);};
  },[query,valid]);

  const nearest=useMemo(()=>{
    if(!selected)return [];
    return ctx.airports.filter(a=>a.scheduled&&Number.isFinite(a.lat)&&Number.isFinite(a.lon))
      .map(a=>({airport:a,miles:distanceMiles(selected.lat,selected.lon,a.lat!,a.lon!)}))
      .sort((a,b)=>a.miles-b.miles).slice(0,4);
  },[ctx.airports,selected]);
  const assignments=(ctx.board.assignments||[]).filter(a=>
    a.areaType==='zip'&&a.areaCode===selected?.code
  );
  async function select(area:Zcta){
    setSelected(area);setDetail(null);setError('');setResolving(true);
    try{
      const response=await api.get('/api/locations/zcta/'+area.code);
      const value=response.data as Detail;
      setDetail(value);
      if(!value.found)setError(value.message||'This Census ZCTA is unavailable.');
    }catch{
      setError('State matching unavailable. Use the published point to inspect the area externally.');
    }finally{setResolving(false);}
  }
  function plan(){
    if(!selected||!detail?.stateCode)return;
    ctx.startTravel(
      {code:detail.stateCode,name:STATE_BY_CODE[detail.stateCode]?.name||detail.stateCode,country:'US'},
      undefined,
      {lat:selected.lat,lon:selected.lon,label:'Census ZCTA '+selected.code+' internal point · not an address'}
    );
  }
  function atlas(){
    if(detail?.stateCode)ctx.jumpToAtlas({code:detail.stateCode,country:'US'});
  }
  return <section className='fsa-zcta' aria-labelledby='fsa-zcta-title'>
    <div className='fsa-zcta-title'>
      <span className='fsa-zcta-emblem'><Radar size={19}/></span>
      <div><span className='fsa-zcta-kicker'>NATIONAL OPEN GEOGRAPHY</span>
        <h3 id='fsa-zcta-title'>Census ZCTA Explorer</h3>
        <p>Search published Census ZIP areas, reveal nearby airports, and explore the region.</p>
      </div>
    </div>
    <label htmlFor='fsa-zcta-search' className='fsa-zcta-label'>Find a five-digit Census area</label>
    <div className='fsa-zcta-search'>
      <Search size={18}/><input id='fsa-zcta-search' type='search'
        value={query} inputMode='numeric' maxLength={5} autoComplete='off'
        placeholder='Enter 2–5 digits'
        onChange={e=>setQuery(e.target.value.replace(/\D/g,'').slice(0,5))}/>
      {busy&&<RefreshCw size={16} className='fsa-zcta-loading' aria-label='Searching Census areas'/>}
    </div>
    <p className='fsa-zcta-note'>Census ZCTAs are statistical areas, not USPS delivery ZIP codes or street addresses.</p>
    {error&&<p className='fsa-zcta-warning' role='alert'>{error}</p>}
    {data&&<div className='fsa-zcta-source'>
      <span><ShieldCheck size={14}/> Census {data.sourceYear||2026}</span>
      <span>{data.available?data.indexedCount.toLocaleString()+' nationally indexed areas':'Source unavailable'}</span>
    </div>}
    {data&&!data.available&&<p className='fsa-zcta-warning' role='status'>
      {data.message||'Official ZCTA directory unavailable.'}
    </p>}
    {data?.available&&<div className='fsa-zcta-results' aria-label='Census search results'>
      {data.results.length?data.results.map(area=><button key={area.code} type='button'
        aria-pressed={selected?.code===area.code}
        className={selected?.code===area.code?'selected':''} onClick={()=>void select(area)}>
        <span><MapPin size={16}/> {area.code}</span>
        <small>{area.landSqMiles!=null?area.landSqMiles+' land sq mi':'Area unavailable'}</small>
        <ArrowRight size={16}/>
      </button>):<p>No Census area matches this prefix. Some valid USPS ZIP codes have no ZCTA equivalent.</p>}
    </div>}
    {selected&&<div className='fsa-zcta-detail'>
      <div className='fsa-zcta-point'><span>OFFICIAL CENSUS INTERNAL POINT</span>
        <strong>{selected.code}</strong>
        <small>{selected.lat.toFixed(4)}, {selected.lon.toFixed(4)} · Not a meeting address</small>
      </div>
      {resolving&&<p className='fsa-zcta-loading-text'><RefreshCw size={15} className='fsa-zcta-loading'/> Resolving geographic state…</p>}
      {detail?.stateCode&&<p className='fsa-zcta-found'><MapPin size={15}/>
        <strong>{STATE_BY_CODE[detail.stateCode]?.name||detail.stateCode}</strong>
        {detail.county?' · '+detail.county:''}
      </p>}
      {detail?.locationStatus&&<p className='fsa-zcta-note'>{detail.locationStatus}</p>}
      {assignments.length>0&&<p className='fsa-zcta-assigned'>
        {assignments.length} saved territory assignment{assignments.length===1?'':'s'} matching these digits.
      </p>}
      <div className='fsa-zcta-airports'>
        <h4><Plane size={16}/> Nearest listed airline-service airports</h4>
        {nearest.length?nearest.map(row=><div key={row.airport.iata}>
          <strong>{row.airport.iata}</strong>
          <span>{row.airport.name}</span>
          <small>{Math.round(row.miles)} air miles</small>
        </div>):<p>Airport coordinates are not available in the loaded directory.</p>}
        <p>Distances are straight-line estimates. Driving time, flight routes and actual service need verification.</p>
      </div>
      <div className='fsa-zcta-actions'>
        <button type='button' disabled={!detail?.stateCode} onClick={atlas}>
          <Compass size={16}/> Explore state in Atlas
        </button>
        <button type='button' disabled={!detail?.stateCode} onClick={plan}>
          <Plane size={16}/> Plan field travel here
        </button>
        <a target='_blank' rel='noopener noreferrer'
          href={'https://www.openstreetmap.org/?mlat='+selected.lat+'&mlon='+selected.lon+
            '#map=12/'+selected.lat+'/'+selected.lon}>
          <Globe2 size={15}/> Inspect exact point <ExternalLink size={13}/>
        </a>
      </div>
    </div>}
    <footer className='fsa-zcta-footer'>
      <a href={reference} target='_blank' rel='noopener noreferrer'>
        Official Census Gazetteer <ExternalLink size={13}/>
      </a>
      <span>2026 source preferred; 2025 fallback is labeled if used.</span>
    </footer>
  </section>;
}
