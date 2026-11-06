
import {
ArrowDownToLine,ArrowRight,CalendarCheck,CalendarDays,CheckCircle2,
ChevronRight,
CircleAlert,
ClipboardCheck,
Clock3,Compass,Database,ExternalLink,FileSpreadsheet,
Globe2,Layers2,
MapPin,Plane,Plus,Search,ShieldCheck,
Trash2,UploadCloud,Users
} from 'lucide-react';
import Papa from 'papaparse';
import { useEffect,useMemo,useState } from 'react';
import BackendReadiness from './BackendReadiness';
import { CANADA_REGIONS,CANADA_REGION_BY_CODE } from './CanadaRegions';
import CensusZctaExplorer from './CensusZctaExplorer';
import { useOp } from './Operations';
import {
Manager,
STATES,
closestAirports,coachingPriority,dateLabel,
exportCSV,toStateLabel,
today
} from './opsModels';
import TerritoryMap from './TerritoryMap';
import TerritoryPulse from './TerritoryPulse';
import { api } from './workspaceApi';

const PageTitle=({label,title,description,children}:{label:string;title:string;description:string;children?:React.ReactNode})=>
  <header className="op-head atlas-editorial-head">
    <div><p className="op-eyebrow"><span className="atlas-beacon" aria-hidden="true"/>{label}</p>
    <h1>{title}<span className="atlas-page-period" aria-hidden="true">.</span></h1>
    <p className="op-subtitle">{description}</p></div>
    {children&&<div className="op-head-actions">{children}</div>}
  </header>;
const Empty=({icon:Icon,title,description,action}:{icon:typeof Users;title:string;description:string;action?:React.ReactNode})=>
  <div className="op-empty"><Icon size={26}/><strong>{title}</strong><span>{description}</span>{action}</div>;
const regionOptions=<>
  <optgroup label="United States">{STATES.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</optgroup>
  <optgroup label="Canada">{CANADA_REGIONS.map(s=><option key={'CA'+s.code} value={s.code}>{s.name}</option>)}</optgroup>
</>;
export function Stats(){
  const {board}=useOp();
  const assignments=board.assignments||[],managers=board.managers||[],visits=board.visits||[],coaching=board.coaching||[];
  const covered=new Set(assignments.map(a=>a.stateCode)).size;
  const overdue=coaching.filter(n=>n.status==='Open'&&n.dueDate&&n.dueDate<today()).length;
  const upcoming=visits.filter(v=>v.status==='Planned'&&v.date>=today()).length;
  return <div className="op-metrics">
    <div className="op-metric"><label>Markets with coverage</label><strong>{covered}</strong><small>U.S. states & Canadian regions saved</small></div>
    <div className="op-metric"><label>Territory managers</label><strong>{managers.length}</strong><small>Tracked profiles</small></div>
    <div className="op-metric"><label>Upcoming coaching visits</label><strong>{upcoming}</strong><small>Scheduled field work</small></div>
    <div className="op-metric"><label>Overdue commitments</label><strong>{overdue}</strong><small>Open follow-up actions</small></div>
  </div>;
}
export function MapSurface({}:{compact?:boolean}){
  const ctx=useOp();
  const {atlas,airports,airportSource,board,state,setState,mapMode,setMapMode}=ctx;
  const isCanadian=Boolean(CANADA_REGION_BY_CODE[state]);
  const [showCounties,setShowCounties]=useState(true);
  const [showAirports,setShowAirports]=useState(true);
  const [airportHighlight,setAirportHighlight]=useState('');
  const selectState=(next:string)=>{setState(next);setMapMode('state');ctx.setSelectedCounty('');};
  const managers=board.managers||[],assignments=board.assignments||[];
  return <div className="op-card op-map-panel">
    <div className="op-map-toolbar">
      <div className="op-map-toolbar-left"><Globe2 size={17} color="var(--at-cyan)"/><strong>Territory map</strong>
        <select value={mapMode==='national'?'USA':state} onChange={e=>{if(e.target.value==='USA'){setMapMode('national');}else selectState(e.target.value);}} aria-label="Map view">
          <option value="USA">United States</option>{regionOptions}
        </select>
      </div>
      <div className="op-map-toolbar-right">
        {mapMode==='state'&&<button className="atlas-open-main-map" type="button"
          onClick={()=>ctx.jumpToAtlas({code:state,country:isCanadian?'CA':'US'})}>
          <Globe2 size={16}/> Open in Atlas <ArrowRight size={15}/>
        </button>}
        <button className={'op-toggle'+(showCounties?' on':'')} onClick={()=>setShowCounties(!showCounties)} aria-pressed={showCounties}><Layers2 size={14}/> Counties</button>
        <button className={'op-toggle'+(showAirports?' on':'')} onClick={()=>setShowAirports(!showAirports)} aria-pressed={showAirports}><Plane size={14}/> Airports</button>
      </div>
    </div>
    {isCanadian&&mapMode==='state'?<div className="atlas-canada-map-bridge">
      <Globe2 size={34}/><span>CANADIAN TERRITORY</span>
      <h3>{CANADA_REGION_BY_CODE[state]?.name}</h3>
      <p>Province boundaries are available on the Atlas. U.S. county geography is not used as a substitute for this Canadian region.</p>
      <button type="button" onClick={()=>ctx.jumpToAtlas({code:state,country:'CA'})}>
        Open province on Atlas <ArrowRight size={17}/>
      </button>
    </div>:<TerritoryMap atlas={atlas} airports={airports} state={state} mode={mapMode} assignments={assignments} managers={managers}
      showCounties={showCounties} showAirports={showAirports} onState={selectState} onNational={()=>setMapMode('national')}
      onCounty={code=>{ctx.setSelectedCounty(code);ctx.setMapMode('state');}}
      onAirport={iata=>{setAirportHighlight(iata);ctx.setNotice('Airport '+iata+' selected. See the airport directory in Territory explorer.');}}/>}
    <div className="op-map-footer">
      {airportSource==='starter'?'Limited starter airport reference · Live OurAirports feed unavailable':airportSource==='loading'?'Loading public airport directory...':airportSource==='cached'?'Saved airport snapshot (verify schedules)':'Recent OurAirports directory loaded'}
      {' · '}Map boundaries: public us-atlas shapes, which may differ from the 2026 Census name directory. Colors reflect saved team assignments.
      {airportHighlight&&' · Last airport: '+airportHighlight}
    </div>
  </div>;
}
export function OverviewPage(){
  const ctx=useOp(),{board,open,go}=ctx;
  const managers=board.managers||[],visits=board.visits||[],notes=board.coaching||[];
  const upcoming=visits.filter(v=>['Planned','Rescheduled'].includes(v.status)&&v.date>=today())
    .sort((a,b)=>a.date.localeCompare(b.date)).slice(0,6);
  const rank=useMemo(()=>managers.map(m=>({m,...coachingPriority(m,visits,notes)}))
    .sort((a,b)=>b.score-a.score||a.m.name.localeCompare(b.m.name)),[managers,visits,notes]);
  const profiles=ctx.trainerProfiles.map(profile=>{
    const owned=managers.filter(m=>m.trainer===profile.name).length;
    const next=visits.filter(v=>v.trainer===profile.name&&
      ['Planned','Rescheduled'].includes(v.status)&&v.date>=today()).length;
    const commitments=notes.filter(n=>n.trainer===profile.name&&n.status==='Open').length;
    return {profile,owned,next,commitments,percent:managers.length?Math.round(100*owned/managers.length):0};
  });
  const assignedIds=new Set(managers.filter(m=>!ctx.trainerProfiles.some(p=>p.name===m.trainer)).map(m=>m.id));
  return <div className="fsa-reports">
    <PageTitle label="OPERATIONAL REPORTS" title="Reports"
      description="A concise snapshot of saved coverage, coaching commitments and near-term field activity. No invented performance scores.">
      <button className="op-btn" onClick={()=>go('data')}><ArrowDownToLine size={16}/> Data & exports</button>
      <button className="op-btn primary" disabled={ctx.identity!=='member'||!managers.length}
        onClick={()=>open('visit')}><Plus size={16}/> Plan visit</button>
    </PageTitle>
    <Stats/>
    <TerritoryPulse/>
    <div className="fsa-report-columns">
      <section className="op-card fsa-report-panel" aria-label="Trainer territory distribution">
        <header className="fsa-report-panel-head">
          <span className="fsa-kicker">COVERAGE DISTRIBUTION</span>
          <h2>Two trainers. One territory.</h2>
          <p>Count of saved manager assignments per trainer. This is not an employee-performance comparison.</p>
        </header>
        {profiles.map((row,i)=><div className="fsa-report-trainer" key={row.profile.id}>
          <div className="fsa-report-trainer-heading">
            <strong><span className={'fsa-report-dot fsa-report-dot-'+i}/>{row.profile.name}</strong>
            <span>{row.owned} manager{row.owned===1?'':'s'}</span>
          </div>
          <div className="fsa-report-track" role="meter"
            aria-label={row.profile.name+' share of saved manager profiles'}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.percent}>
            <span className={'fsa-report-fill fsa-report-fill-'+i} style={{width:row.percent+'%'}}/>
          </div>
          <div className="fsa-report-trainer-foot"><span>{row.next} upcoming visit{row.next===1?'':'s'}</span>
            <span>{row.commitments} open coaching follow-up{row.commitments===1?'':'s'}</span></div>
        </div>)}
        {assignedIds.size>0&&<p className="fsa-report-caveat">{assignedIds.size} manager profile{assignedIds.size===1?' is':'s are'} unassigned or belong to a trainer name not in the two active profiles.</p>}
        {!managers.length&&<p className="fsa-report-caveat">Add manager profiles to see territory distribution.</p>}
      </section>
      <section className="op-card fsa-report-panel" aria-label="Coaching attention">
        <header className="fsa-report-panel-head">
          <span className="fsa-kicker">COACHING FOLLOW-THROUGH</span>
          <h2>Where attention is needed.</h2>
          <p>Prioritized from saved due dates, onboarding and visit cadence. Not sales-performance rankings.</p>
        </header>
        <div className="fsa-report-queue">
          {rank.length?rank.slice(0,5).map(({m,level,reasons})=>
            <button type="button" key={m.id} onClick={()=>{ctx.setSelectedManager(m.id);go('managers');}}>
              <span className="fsa-report-person-icon"><Users size={17}/></span>
              <span><strong>{m.name}</strong><small>{reasons[0]||'No flagged coaching issue'}</small></span>
              <span className={'fsa-report-priority fsa-report-priority-'+level.toLowerCase()}>{level}</span>
              <ChevronRight size={16}/>
            </button>
          ):<div className="fsa-report-empty">
            <Users size={23}/><strong>No manager profiles yet.</strong>
            <p>Start in People to build your coaching roster.</p>
          </div>}
        </div>
        <button type="button" className="fsa-report-open" onClick={()=>go('coaching')}>Open coaching workspace <ArrowRight size={16}/></button>
      </section>
    </div>
    <section className="op-card fsa-report-upcoming">
      <header className="fsa-report-panel-head">
        <span className="fsa-kicker">UPCOMING ACTIVITY</span>
        <h2>Visits worth preparing for.</h2>
        <p>Next six saved coaching visits across the team.</p>
      </header>
      {upcoming.length?<div className="fsa-report-visit-list">
        {upcoming.map(v=><button type="button" key={v.id} onClick={()=>open('visit',v)}>
          <span className="fsa-report-date">{dateLabel(v.date,{month:'short',day:'numeric'})}</span>
          <span><strong>{managers.find(m=>m.id===v.managerId)?.name||'Former manager'}</strong>
            <small>{toStateLabel(v.stateCode)} · {v.trainer||'Trainer unassigned'} · {v.airport||'Airport not selected'}</small></span>
          <span className="fsa-report-status">{v.status}</span><ChevronRight size={18}/>
        </button>)}
      </div>:<div className="fsa-report-empty">
        <CalendarDays size={23}/><strong>No upcoming coaching visits saved.</strong>
        <p>Use Plan to coordinate your first visit or coaching circuit.</p>
      </div>}
      <button type="button" className="fsa-report-open" onClick={()=>go('calendar')}>View shared calendar <ArrowRight size={16}/></button>
    </section>
    <p className="fsa-provenance">Reporting reflects saved workspace records. Coverage counts can overlap by design. Trip and visit totals do not verify attendance, availability, or productivity.</p>
  </div>;
}
export function MapPage(){
  const ctx=useOp();
  const {state,geo,geoBusy,geoError,board,airports,open,selectedCounty}=ctx;
  const [tab,setTab]=useState<'coverage'|'airports'|'counties'|'places'|'zip'>('coverage');
  const [filter,setFilter]=useState('');
  const canadian=!!CANADA_REGION_BY_CODE[state];
  const regionLabel=CANADA_REGION_BY_CODE[state]?.name||toStateLabel(state);
  const availableTabs=(canadian?['coverage','airports']:['coverage','airports','counties','places','zip']) as Array<typeof tab>;
  useEffect(()=>{if(canadian&&!['coverage','airports'].includes(tab))setTab('coverage');},[state,tab,canadian]);
  useEffect(()=>{if(ctx.zctaFocus&&!canadian){setTab('zip');setFilter('');}},[ctx.zctaFocus,canadian]);
  const managers=board.managers||[],assignments=(board.assignments||[]).filter(a=>a.stateCode===state);
  const selectedCountyArea=geo.counties.find(c=>c.code===selectedCounty);
  const airportOptions=airports.filter(a=>a.state===state).sort((a,b)=>Number(b.scheduled)-Number(a.scheduled)||Number(b.tier==='Major')-Number(a.tier==='Major')||a.name.localeCompare(b.name));
  const areas=tab==='counties'?geo.counties:geo.places;
  const shownAreas=areas.filter(a=>a.name.toLowerCase().includes(filter.toLowerCase())).slice(0,120);
  function showDetailArea(next:'counties'|'places'|'coverage'){setTab(next);setFilter('');}
  useEffect(()=>{if(selectedCounty){setTab('counties');const found=geo.counties.find(c=>c.code===selectedCounty);setFilter(found?.name||'');}},[selectedCounty,geo.counties]);
  useEffect(()=>{setFilter('');},[state]);
  return <>
    <PageTitle label="GEOGRAPHIC COVERAGE" title="Territory explorer." description="Review saved manager ownership, airports and available public geographic reference information.">
      <button className="op-btn primary" disabled={ctx.identity!=='member'||!managers.length} onClick={()=>open('assignment')}><Plus size={16}/> Assign territory</button>
    </PageTitle>
    <div className="op-geo-layout">
      <div><MapSurface/>
        <div className="op-card" style={{marginTop:15,padding:18}}>
          <div className="op-section-head"><div><h2>{regionLabel} coverage</h2><p>Territory ownership comes from team records. Multiple managers may share a market.</p></div></div>
          <div className="op-grid-three" style={{marginTop:17}}>
            <div><div className="op-subtle">Active assignments</div><strong style={{fontSize:23,fontFamily:'var(--atlas-font)'}}>{assignments.length}</strong></div>
            <div><div className="op-subtle">{canadian?'County geography':'Counties listed'}</div><strong style={{fontSize:23,fontFamily:'var(--atlas-font)'}}>{canadian?'N/A':geo.counties.length||'—'}</strong></div>
            <div><div className="op-subtle">Airport gateways</div><strong style={{fontSize:23,fontFamily:'var(--atlas-font)'}}>{airportOptions.length}</strong></div>
          </div>
          <p className="op-subtle" style={{lineHeight:1.6,marginTop:14}}>Coverage counts are saved assignments, not independently verified. {canadian?'U.S. Census county and ZIP directories are not available for Canadian provinces in this explorer.':'County and ZIP assignments can overlap by design.'}</p>
        </div>
      </div>
      <aside className="op-card op-inspector">
        <div className="op-inspector-title"><p className="op-eyebrow" style={{marginBottom:6}}>SELECTED REGION</p><h2>{regionLabel}</h2><p>{state} · {canadian?'Canada':'United States'} {selectedCountyArea&&!canadian?' · '+selectedCountyArea.name:''}</p></div>
        <div className="op-tabs fsa-geography-tabs" role="tablist" aria-label="Regional directory sections">
          {availableTabs.map((t,i)=><button type="button" role="tab" aria-selected={tab===t}
            key={t} className={tab===t?'active':''} onClick={()=>{setTab(t);setFilter('');}}
            onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
              event.preventDefault();const next=(i+(event.key==='ArrowRight'?1:-1)+availableTabs.length)%availableTabs.length;
              setTab(availableTabs[next]);setFilter('');
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')[next]?.focus();
            }}}>{t==='places'?'Towns':t==='zip'?'ZIP':t.charAt(0).toUpperCase()+t.slice(1)}</button>)}
        </div>
        <div className="op-inspector-content" role="tabpanel">
          {tab==='coverage'&&<>
            <div className="op-mini-heading"><strong>Territory ownership</strong><button onClick={()=>open('assignment')} disabled={ctx.identity!=='member'||!managers.length}><Plus size={14}/> Assign</button></div>
            {!assignments.length?<Empty icon={Users} title="Coverage not assigned" description="Add one or more territory managers to this state, its counties or ZIP codes."/>:
              assignments.map(a=>{
                const person=managers.find(m=>m.id===a.managerId);
                return <div className="op-coverage-assign" key={a.id}>
                  <div className="op-avatar">{person?.name.slice(0,1).toUpperCase()||'?'}</div>
                  <div><strong>{person?.name||'Removed manager'}</strong><span>{a.areaType==='state'?'Statewide':a.areaName} · {a.role}</span><span>{person?.trainer?'Trainer: '+person.trainer:'Trainer not assigned'}</span></div>
                  {ctx.identity==='member'&&<button className="op-icon-button" title="Remove assignment" aria-label="Remove assignment" onClick={async()=>{
                    if(!confirm('Remove this territory assignment?'))return;
                    await ctx.submit(()=>api.delete('/api/assignments/'+a.id),'Assignment removed.').catch(()=>undefined);
                  }}><Trash2 size={15}/></button>}
                </div>;
              })}
            <div className="op-coverage-actions"><button className="op-btn soft" onClick={()=>showDetailArea('counties')} style={{width:'100%'}}>Browse county directory <ArrowRight size={14}/></button></div>
          </>}
          {tab==='airports'&&<>
            <div className="op-mini-heading"><strong>Airport directory</strong><span className="op-pill">{airportOptions.length}</span></div>
            <p className="op-subtle" style={{lineHeight:1.6}}>Major/secondary reflects airport type; scheduled service is a separate field. Verify flights before traveling.</p>
            {airportOptions.map(a=><div key={a.iata+a.name} className="op-location-row">
              <div className="op-airport-code">{a.iata}</div>
              <div><strong>{a.name}</strong><small>{a.tier} · {a.scheduled?'Scheduled service listed':'Scheduled service unverified'}</small></div>
              <a href={'https://www.google.com/travel/flights?q='+encodeURIComponent(a.iata)} target="_blank" rel="noreferrer" title="Search available flights"><ExternalLink size={16}/></a>
            </div>)}
            {airportOptions.length===0&&<Empty icon={Plane} title="No airports matching this directory" description="Nearby gateways may be in a neighboring state."/>}
          </>}
          {(tab==='counties'||tab==='places')&&<>
            <div className="op-mini-heading"><strong>{tab==='counties'?'County directory':'Cities and Census places'}</strong><span className="op-pill">{areas.length}</span></div>
            <div className="op-search" style={{marginBottom:15}}><Search size={16}/><input placeholder={'Find '+(tab==='counties'?'a county':'a place')+'...'} value={filter} onChange={e=>setFilter(e.target.value)}/></div>
            {geoBusy&&<p className="op-subtle">Loading Census geography...</p>}
            {geoError&&<div className="op-alert warn"><CircleAlert size={16}/><span>{geoError}</span></div>}
            {!geoBusy&&!shownAreas.length&&<Empty icon={MapPin} title="Nothing matches" description="Try a different name, or check whether the Census directory is reachable."/>}
            {shownAreas.map(a=><button className="op-location-row" key={a.code} onClick={()=>open('assignment',undefined,tab==='counties'?'county:'+a.code:'place:'+a.code)} disabled={ctx.identity!=='member'||!managers.length}>
              <div className="op-list-icon"><MapPin size={15}/></div><div><strong>{a.name}</strong><small>{tab==='counties'?'County or county equivalent':'Census place'} · {a.code}</small></div><Plus size={16}/>
            </button>)}
            {areas.length>120&&!filter&&<p className="op-subtle">Showing 120 results. Search by name for the full directory.</p>}
            <div className="op-muted-block" style={{marginTop:16}}>Geography: 2026 U.S. Census Gazetteer files. Some local community names are not Census places.</div>
          </>}
          {tab==='zip'&&<>
            <div className="op-mini-heading"><strong>ZIP assignments</strong></div>
            <CensusZctaExplorer initialCode={ctx.zctaFocus}/>
            <p className="op-subtle" style={{lineHeight:1.7}}>Assign a five-digit ZIP identifier to a manager. USPS delivery ZIP codes and Census ZIP Code Tabulation Areas are not identical; no ZIP polygon boundary is implied here.</p>
            {assignments.filter(a=>a.areaType==='zip').map(a=><div className="op-coverage-assign" key={a.id}>
              <div className="op-list-icon"><MapPin size={16}/></div><div><strong>ZIP {a.areaCode}</strong><span>{managers.find(m=>m.id===a.managerId)?.name} · {a.role}</span></div></div>)}
            <button className="op-btn soft" onClick={()=>open('assignment',undefined,'zip:')} disabled={ctx.identity!=='member'||!managers.length}><Plus size={14}/> Add ZIP assignment</button>
          </>}
        </div>
      </aside>
    </div>
  </>;
}
export function ManagersPage(){
  const ctx=useOp();
  const managers=ctx.board.managers||[],assignments=ctx.board.assignments||[],visits=ctx.board.visits||[],coaching=ctx.board.coaching||[];
  const [search,setSearch]=useState('');
  const [trainerFilter,setTrainerFilter]=useState('');
  const current=managers.find(m=>m.id===ctx.selectedManager)||managers[0];
  const trainerList=[...new Set(managers.map(m=>m.trainer).filter(Boolean))];
  const filtered=managers.filter(m=>(m.name+' '+m.trainer+' '+m.baseCity+' '+m.email).toLowerCase().includes(search.toLowerCase())&&(!trainerFilter||m.trainer===trainerFilter));
  return <>
    <PageTitle label="MANAGER INTELLIGENCE" title="Territory managers" description="Territory ownership, coaching cadence, base airports and commitments in one manager profile.">
      <button className="op-btn primary" disabled={ctx.identity!=='member'} onClick={()=>ctx.open('manager')}><Plus size={16}/> Add manager</button>
    </PageTitle>
    <div className="op-toolbar">
      <div className="op-search" style={{maxWidth:430}}><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search names, trainers, locations..." aria-label="Search territory managers"/></div>
      <select value={trainerFilter} onChange={e=>setTrainerFilter(e.target.value)}><option value="">All trainers</option>{trainerList.map(t=><option key={t}>{t}</option>)}</select>
      <span className="op-subtle">{filtered.length} managers shown</span>
    </div>
    {!managers.length?<div className="op-card"><Empty icon={Users} title="Start your manager directory" description="Every manager can own several states and counties. Profiles connect coaching and travel." action={ctx.identity==='member'?<button className="op-btn primary" onClick={()=>ctx.open('manager')}><Plus size={15}/> Add manager</button>:undefined}/></div>:
    <div className="op-overview-split">
      <section className="op-card fsa-manager-directory" aria-label="Territory manager directory">
        <div className="op-card-header">
          <div>
            <span className="fsa-card-eyebrow">YOUR PEOPLE</span>
            <h2>Territory managers</h2>
            <p>Select someone to see their coverage, coaching history and airport options.</p>
          </div>
          <span className="fsa-count-chip">{filtered.length} shown</span>
        </div>
        <div className="fsa-manager-cards">
          {filtered.map(m=>{
            const p=coachingPriority(m,visits,coaching);
            const zones=assignments.filter(a=>a.managerId===m.id).length;
            const nextVisit=visits.filter(v=>v.managerId===m.id&&
              ['Planned','Rescheduled'].includes(v.status)&&v.date>=today())
              .map(v=>v.date).sort()[0];
            const letters=m.name.trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase();
            return <button type="button" key={m.id}
              className={'fsa-manager-card'+(current?.id===m.id?' is-current':'')}
              aria-pressed={current?.id===m.id}
              onClick={()=>ctx.setSelectedManager(m.id)}>
              <span className="fsa-manager-card-main">
                <span className="fsa-manager-avatar" aria-hidden="true">{letters}</span>
                <span className="fsa-manager-card-identity">
                  <strong>{m.name}</strong>
                  <small><MapPin size={13}/>{[m.baseCity,m.baseState].filter(Boolean).join(', ')||'Location not set'} · {m.trainer||'Trainer unassigned'} · {zones} assigned area{zones===1?'':'s'}</small>
                </span>
                <ChevronRight className="fsa-manager-card-chevron" size={20}/>
              </span>
              <span className="fsa-manager-card-facts">
                <span><small>NEXT VISIT</small><strong>{nextVisit?dateLabel(nextVisit,{month:'short',day:'numeric'}):'Not scheduled'}</strong></span>
                <span><small>COACHING CONTEXT</small><strong>{p.reasons[0]||'No priority flag recorded'}</strong></span>
              </span>
              <span className="fsa-manager-card-bottom">
                <span className={'fsa-attention fsa-attention-'+p.level.toLowerCase()}>
                  <span className="fsa-attention-dot"/>{p.level} coaching attention
                </span>
                <span className="fsa-manager-open">Open profile <ArrowRight size={14}/></span>
              </span>
            </button>;
          })}
          {!filtered.length&&<div className="fsa-directory-empty">
            <Search size={23}/><strong>No managers match your filters</strong>
            <p>Try another search or choose all trainers.</p>
          </div>}
        </div>
      </section>
      {current&&<ManagerDetail manager={current}/>}
    </div>}
  </>;
}
function ManagerDetail({manager:m}:{manager:Manager}){
  const ctx=useOp(),{board,airports,open}=ctx;
  const visits=(board.visits||[]).filter(v=>v.managerId===m.id);
  const notes=(board.coaching||[]).filter(n=>n.managerId===m.id);
  const assignments=(board.assignments||[]).filter(a=>a.managerId===m.id);
  const priority=coachingPriority(m,board.visits||[],board.coaching||[]);
  const nearest=closestAirports(m,airports,5);
  const [section,setSection]=useState<'profile'|'airports'|'coaching'>('profile');
  return <div className="op-card">
    <div className="op-manager-header"><div className="op-avatar">{m.name.slice(0,2).toUpperCase()}</div>
      <div style={{minWidth:0,flex:1}}><h2>{m.name}</h2><p>{m.trainer?'Trainer: '+m.trainer:'Trainer not assigned'} · {m.coachingStatus||'No manual status set'}</p></div>
      <button className="op-btn tiny" onClick={()=>open('manager',m)}><Compass size={14}/> Edit profile</button>
    </div>
    <div className="op-detail-tabs">
      {(['profile','airports','coaching'] as const).map(t=><button key={t} className={section===t?'active':''} onClick={()=>setSection(t)}>{t==='airports'?'Airport options':t==='coaching'?'Coaching history':'Overview'}</button>)}
    </div>
    <div className="op-detail-body">
      {section==='profile'&&<>
        <div className="op-field-list">
          <div><label>Home airport</label><strong>{m.homeAirport||'Not assigned'}</strong></div>
          <div><label>Base location</label><strong>{[m.baseCity,m.baseState].filter(Boolean).join(', ')||'Not set'}</strong></div>
          <div><label>Coaching cadence</label><strong>{m.cadence||'Not set'}</strong></div>
          <div><label>Priority</label><strong>{priority.score} · {priority.level}</strong></div>
          <div><label>Last completed visit</label><strong>{visits.filter(v=>v.status==='Completed').map(v=>v.date).sort().reverse()[0]||'None recorded'}</strong></div>
          <div><label>Open follow-ups</label><strong>{notes.filter(n=>n.status==='Open').length}</strong></div>
        </div>
        {m.focus&&<div className="op-kpi-note" style={{marginTop:20}}><strong>Coaching focus</strong><p style={{margin:'6px 0 0'}}>{m.focus}</p></div>}
        <div className="op-section-head" style={{marginTop:22}}><h2>Assigned territories</h2><button className="op-btn tiny" onClick={()=>{ctx.setState(assignments[0]?.stateCode||ctx.state);open('assignment',undefined,'manager:'+m.id);}}><Plus size={13}/> Add</button></div>
        {assignments.length?assignments.map(a=><div className="op-info-row" key={a.id}>
          <div className="op-info-icon"><MapPin size={15}/></div><div><strong>{toStateLabel(a.stateCode)} · {a.areaName}</strong><span>{a.areaType} · {a.role}</span></div></div>):<p className="op-subtle">No territories assigned yet.</p>}
        {(m.email||m.phone)&&<p className="op-subtle" style={{marginTop:18}}>{[m.email,m.phone].filter(Boolean).join(' · ')}</p>}
      </>}
      {section==='airports'&&<>
        {nearest.length?<><p className="op-subtle" style={{lineHeight:1.6}}>Closest listed airports by straight-line miles. These are not driving distances, available flights or travel-time estimates.</p>
          {nearest.map(a=><div className="op-info-row" key={a.iata}><div className="op-airport-code">{a.iata}</div><div><strong>{a.name}</strong><span>{Math.round(a.miles)} straight-line miles · {a.scheduled?'Scheduled service listed':'Service unverified'}</span></div></div>)}
        </>:<Empty icon={Plane} title="Location not mapped" description="Edit the manager profile, choose a Census place, and the nearest-airport shortlist will appear."/>}
      </>}
      {section==='coaching'&&<>
        <div className="op-section-head"><h2>Coaching records</h2><button className="op-btn tiny" onClick={()=>open('coaching',undefined,'manager:'+m.id)}><Plus size={13}/> Log coaching</button></div>
        {notes.length?notes.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(n=><div className="op-info-row" key={n.id}>
          <div className="op-info-icon"><ClipboardCheck size={15}/></div><div><strong>{n.skill}</strong><span>{dateLabel(n.date)} · {n.status}</span><span>{n.commitment||'No commitment recorded'}</span></div><button onClick={()=>open('coaching',n)}>Edit</button>
        </div>):<p className="op-subtle">No coaching records for this manager yet.</p>}
      </>}
    </div>
  </div>;
}
export function CoachingPage(){
  const ctx=useOp(),{board}=ctx;
  const managers=board.managers||[],visits=board.visits||[],notes=board.coaching||[];
  const [filter,setFilter]=useState('open');
  const [managerFilter,setManagerFilter]=useState('');
  const ranked=managers.map(m=>({m,...coachingPriority(m,visits,notes)})).sort((a,b)=>b.score-a.score);
  const shown=notes.filter(n=>(filter==='all'||n.status.toLowerCase()===filter)&&(!managerFilter||n.managerId===managerFilter)).sort((a,b)=>b.date.localeCompare(a.date));
  return <>
    <PageTitle label="COACHING INTELLIGENCE" title="Coaching & commitments" description="Document what happened, what changes next, and which commitments are overdue.">
      <button className="op-btn primary" disabled={ctx.identity!=='member'||!managers.length} onClick={()=>ctx.open('coaching')}><Plus size={16}/> New coaching record</button>
    </PageTitle>
    <div className="op-grid-two">
      <div className="op-card op-side-pane">
        <div className="op-mini-heading"><strong>Coaching attention queue</strong><span className="op-pill">Rule-based</span></div>
        <p className="op-subtle" style={{lineHeight:1.65}}>Priorities combine overdue commitments, onboarding, manual support status and recorded visit cadence. This is not a performance rating.</p>
        {ranked.length?ranked.slice(0,7).map(({m,score,level,reasons})=><button key={m.id} className="op-queue-row" onClick={()=>ctx.open('coaching',undefined,'manager:'+m.id)}>
          <div className="op-avatar">{m.name.slice(0,2).toUpperCase()}</div>
          <div className="op-queue-main"><strong>{m.name}</strong><small>{reasons.join(' · ')||'No urgent rule-based flags'}</small></div>
          <div className={'op-score '+(level==='High'?'high':level==='Moderate'?'medium':'')}>{score}</div></button>):
          <Empty icon={Users} title="No manager profiles" description="Add managers to start the coaching queue."/>}
      </div>
      <div className="op-card op-side-pane">
        <div className="op-mini-heading"><strong>Open commitments</strong><span className="op-pill">{notes.filter(n=>n.status==='Open').length}</span></div>
        {notes.filter(n=>n.status==='Open').length?notes.filter(n=>n.status==='Open').sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')).slice(0,7).map(n=><div className="op-info-row" key={n.id}>
          <div className="op-info-icon"><Clock3 size={15}/></div><div><strong>{n.commitment||n.skill}</strong><span>{managers.find(m=>m.id===n.managerId)?.name||'Manager'} · {n.dueDate?dateLabel(n.dueDate):'No due date'}</span></div>
          <button className="op-btn tiny" onClick={()=>ctx.open('coaching',n)}>Review</button>
        </div>):<Empty icon={CheckCircle2} title="No open follow-ups" description="Log coaching commitments and due dates to build a follow-through queue."/>}
      </div>
    </div>
    <section className="op-section">
      <div className="op-section-head"><div><h2>Coaching history</h2><p>Saved notes, observations and commitments across managers.</p></div></div>
      <div className="op-toolbar"><div className="op-segment">{['open','completed','all'].map(t=><button key={t} onClick={()=>setFilter(t)} className={filter===t?'active':''}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>)}</div>
        <select value={managerFilter} onChange={e=>setManagerFilter(e.target.value)}><option value="">All managers</option>{managers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
      <div className="op-card">
        {shown.length?<div className="op-table-scroll"><table className="op-table"><thead><tr><th>Date</th><th>Manager</th><th>Coaching focus</th><th>Commitment due</th><th>Status</th><th/></tr></thead><tbody>
          {shown.map(n=><tr key={n.id}><td>{dateLabel(n.date)}</td><td><strong>{managers.find(m=>m.id===n.managerId)?.name||'Former manager'}</strong></td>
            <td>{n.skill}<small>{n.observation?.slice(0,95)||''}</small></td><td>{n.dueDate?dateLabel(n.dueDate):'Not specified'}</td>
            <td><span className={'op-badge '+(n.status==='Completed'?'low':n.dueDate&&n.dueDate<today()?'high':'')}>{n.status}</span></td>
            <td><button className="op-icon-button" onClick={()=>ctx.open('coaching',n)} title="Edit record"><ChevronRight size={17}/></button></td>
          </tr>)}
        </tbody></table></div>:
        <Empty icon={ClipboardCheck} title={notes.length?'No records match these filters':'No coaching records yet'} description="Record a coaching session or switch the filters to view existing work." action={ctx.identity==='member'&&!!managers.length?<button className="op-btn soft" onClick={()=>ctx.open('coaching')}>Add coaching record</button>:undefined}/>}
      </div>
    </section>
  </>;
}
const importerAliases:Record<string,string[]>={
  name:['name','manager','manager name','territory manager','territory manager name'],
  email:['email','email address','work email'],phone:['phone','phone number','mobile'],
  trainer:['trainer','assigned trainer','field trainer','trainer owner'],
  homeAirport:['home airport','homeairport','airport','home airport code'],
  cadence:['cadence','coaching cadence'],
  focus:['focus','coaching focus'],
  stateCode:['state','state code','state abbreviation','statecode','province','province code','province name','territory'],
  areaType:['area type','areatype','scope','territory type'],
  areaCode:['area code','areacode','county fips','county code','zip code','zip'],
  areaName:['area name','areaname','county','city','town'],
  role:['role','ownership role','assignment role'],
};
const importerFields=Object.keys(importerAliases);
function normalizeRow(row:Record<string,unknown>){
  const columns=Object.keys(row);
  const out:Record<string,string>={};
  for(const field of importerFields){
    const aliases=importerAliases[field];
    const match=columns.find(key=>aliases.includes(key.trim().toLowerCase().replace(/[_-]/g,' ')));
    out[field]=match?String(row[match]??'').trim():'';
  }
  if(out.stateCode){
    const byName=[...STATES,...CANADA_REGIONS].find(s=>s.name.toLowerCase()===out.stateCode.toLowerCase());
    out.stateCode=(byName?.code||out.stateCode).toUpperCase();
  }
  out.areaType=(out.areaType||'state').toLowerCase();
  out.role=out.role||'Primary';
  return out;
}
export function DataPage(){
  const ctx=useOp(),{board,airports,airportSource,geo}=ctx;
  const [preview,setPreview]=useState<Array<Record<string,string>>>([]);
  const [sourceFile,setSourceFile]=useState('');
  const [result,setResult]=useState('');
  const [uploading,setUploading]=useState(false);
  const [importedRows,setImportedRows]=useState(0);
  const [issues,setIssues]=useState<string[]>([]);
  const managers=board.managers||[],assignments=board.assignments||[],notes=board.coaching||[],visits=board.visits||[],trips=board.trips||[];
  async function readCSV(file:File|undefined){
    if(!file)return;
    setResult('');setIssues([]);setPreview([]);setImportedRows(0);setSourceFile(file.name);
    if(!file.name.toLowerCase().endsWith('.csv')){setIssues(['Only CSV imports are supported in this version. Save your Excel file as CSV first.']);return;}
    if(file.size>2_000_000){setIssues(['File is larger than 2 MB. Split the roster into smaller CSV files.']);return;}
    const parsed=Papa.parse<Record<string,unknown>>(await file.text(),{header:true,skipEmptyLines:true});
    if(parsed.errors.length){setIssues(parsed.errors.slice(0,5).map(e=>'CSV line '+e.row+': '+e.message));return;}
    const rows=parsed.data.map(normalizeRow).filter(r=>Object.values(r).some(Boolean));
    setPreview(rows.slice(0,1500));
    const errors:string[]=[];
    if(rows.length>1500)errors.push('Only the first 1,500 rows are staged. Split larger imports before saving.');
    const seen=new Set<string>();
    let duplicates=0;
    rows.slice(0,1500).forEach(row=>{
      const key=row.email?'email:'+row.email.toLowerCase():'name:'+row.name.toLowerCase();
      if(seen.has(key))duplicates++;else seen.add(key);
    });
    if(duplicates)errors.push(duplicates+' duplicate manager identifiers found in this file. Review duplicate names/emails before importing.');
    const invalid=rows.slice(0,1500).filter(row=>!row.name||
      row.stateCode&&![...STATES,...CANADA_REGIONS].some(region=>region.code===row.stateCode)||
      row.areaType==='zip'&&!/^\d{5}$/.test(row.areaCode)||
      ['county','place'].includes(row.areaType)&&(!STATES.some(region=>region.code===row.stateCode)||!/^\d{5,7}$/.test(row.areaCode)));
    if(invalid.length)errors.push(invalid.length+' rows have missing names, unsupported regions, invalid ZIPs or incomplete U.S. Census area identifiers.');
    setIssues(errors);
  }
  async function importRoster(){
    const bad=preview.filter(row=>!row.name||
      row.stateCode&&![...STATES,...CANADA_REGIONS].some(region=>region.code===row.stateCode)||
      row.areaType==='zip'&&!/^\d{5}$/.test(row.areaCode)||
      ['county','place'].includes(row.areaType)&&(!STATES.some(region=>region.code===row.stateCode)||!/^\d{5,7}$/.test(row.areaCode)));
    if(bad.length){setIssues([bad.length+' rows have incomplete or invalid manager/territory information. Review the CSV first.']);return;}
    const keys=new Set<string>();let repeats=0;
    for(const row of preview){const key=row.email?'email:'+row.email.toLowerCase():'name:'+row.name.toLowerCase();
      if(keys.has(key))repeats++;else keys.add(key);
    }
    if(repeats){setIssues([repeats+' duplicate manager identifiers found inside the CSV. Resolve duplicates before importing.']);return;}
    if(ctx.identity!=='member'){ctx.setError('Wait until the shared workspace opens before importing.');return;}
    const matching=preview.filter(row=>managers.some(manager=>row.email?
      manager.email?.toLowerCase()===row.email.toLowerCase():!manager.email&&manager.name.toLowerCase()===row.name.toLowerCase())).length;
    if(!confirm('Import '+preview.length+' manager rows into the shared workspace? '+matching+
      ' row(s) may update an existing manager. Download a full backup before changing a large roster. Continue?'))return;
    setUploading(true);setImportedRows(0);setIssues([]);setResult('');
    let created=0,updated=0,assigned=0,skipped=0;
    const warnings:string[]=[];
    try{
      for(let i=0;i<preview.length;i+=50){
        const response=await api.post('/api/import/managers',{rows:preview.slice(i,i+50)});
        const summary=response.data as {created:number;updated:number;assigned:number;skipped:number;problems?:Array<{row:number;message:string}>};
        created+=summary.created||0;updated+=summary.updated||0;assigned+=summary.assigned||0;skipped+=summary.skipped||0;
        setImportedRows(Math.min(preview.length,i+50));
        if(summary.problems?.length)warnings.push(...summary.problems.slice(0,8).map(x=>'Batch '+(Math.floor(i/50)+1)+' row '+x.row+': '+x.message));
      }
      await ctx.reload();
      setResult(created+' new managers · '+updated+' updated managers · '+assigned+' territory assignments · '+skipped+' skipped rows');
      setIssues(warnings.slice(0,10));
    }catch(e){setIssues(['Import stopped after a partial batch. Review the manager roster before retrying. '+(e instanceof Error?e.message:'')]);await ctx.reload().catch(()=>undefined);}
    finally{setUploading(false);}
  }
  function template(){
    const headers=['Name','Email','Phone','Home Airport','Trainer','Cadence','Focus','State Code','Area Type','Area Code','Area Name','Role'];
    exportCSV('field-atlas-import-template.csv',[],headers);
  }
  return <>
    <PageTitle label="DATA OPERATIONS" title="Data & exports" description="Import manager rosters, export current records, and verify where map and airport information originates.">
      <button className="op-btn" onClick={template}><ArrowDownToLine size={16}/> CSV template</button>
    </PageTitle>
    <div className="op-grid-two">
      <div className="op-card">
        <div className="op-card-header"><div><h2>Import manager roster</h2><p>Map a CSV roster into saved managers and territory assignments. Review before writing.</p></div><FileSpreadsheet size={20} color="var(--at-cyan)"/></div>
        <div className="op-form-grid-wrap">
          <label className="op-upload"><UploadCloud size={31}/><div><strong>{sourceFile||'Choose a CSV roster'}</strong><span>Review the mapped records before importing. Nothing is uploaded when a file is first selected.</span></div><input type="file" accept=".csv,text/csv" onChange={e=>readCSV(e.target.files?.[0])}/></label>
          {preview.length>0&&<>
            <div className="op-section-head" style={{marginTop:22}}><div><h2>Import preview</h2><p>{preview.length} rows staged · first 6 shown</p></div></div>
            <div className="op-table-scroll"><table className="op-table"><thead><tr><th>Manager</th><th>State</th><th>Scope</th><th>Trainer</th></tr></thead><tbody>{preview.slice(0,6).map((r,i)=><tr key={i}><td>{r.name||'Missing name'}</td><td>{r.stateCode||'—'}</td><td>{r.areaType||'—'} {r.areaCode||''}</td><td>{r.trainer||'—'}</td></tr>)}</tbody></table></div>
            {uploading&&<div className="fsa-import-progress" role="status" aria-live="polite">
              <strong>Importing records… {importedRows} of {preview.length}</strong>
              <progress value={importedRows} max={preview.length}/>
              <small>Keep this workspace open until the import finishes. Earlier batches may already be saved.</small>
            </div>}
            <button className="op-btn primary" style={{marginTop:16}} disabled={uploading||ctx.identity!=='member'||issues.length>0} onClick={importRoster}>{uploading?'Importing...':'Review and import '+preview.length+' manager rows'}</button>
          </>}
          {issues.map((msg,i)=><div className="op-alert warn" key={i} style={{marginTop:12}}><CircleAlert size={16}/><span>{msg}</span></div>)}
          {result&&<div className="op-alert good" style={{marginTop:15}}><CheckCircle2 size={17}/><span>{result}</span></div>}
          <p className="op-subtle" style={{lineHeight:1.7,marginTop:18}}>Rows are upserted using email when available, otherwise exact name for records without an email. Review duplicate names before importing. Imports are processed in batches of 50.</p>
        </div>
      </div>
      <div className="op-card">
        <div className="op-card-header"><div><h2>Export and portability</h2><p>Download your saved records, or open the secure structured backup page.</p></div></div>
        <div className="op-side-pane">
          {[
            {name:'Territory manager directory',count:managers.length,do:()=>exportCSV('field-atlas-managers.csv',managers as unknown as Record<string,unknown>[])},
            {name:'Territory assignments',count:assignments.length,do:()=>exportCSV('field-atlas-coverage.csv',assignments as unknown as Record<string,unknown>[])},
            {name:'Coaching records',count:notes.length,do:()=>exportCSV('field-atlas-coaching.csv',notes as unknown as Record<string,unknown>[])},
            {name:'Coaching visits',count:visits.length,do:()=>exportCSV('field-atlas-visits.csv',visits as unknown as Record<string,unknown>[])},
            {name:'Trip itinerary records',count:trips.length,do:()=>exportCSV('field-atlas-trips.csv',trips.map(t=>({...t,stops:JSON.stringify(t.stops)})) as Record<string,unknown>[])},
          ].map(row=><div className="op-info-row" key={row.name}>
            <div className="op-info-icon"><Database size={16}/></div><div><strong>{row.name}</strong><span>{row.count} records</span></div>
            <button className="op-btn tiny" onClick={row.do} disabled={ctx.identity!=='member'}><ArrowDownToLine size={13}/> CSV</button>
          </div>)}
          <button type="button" className="op-btn fsa-full-backup" onClick={()=>ctx.go('team')}><ShieldCheck size={17}/> Open full backup & recovery</button>
        </div>
      </div>
    </div>
    {ctx.identity==='member'?<BackendReadiness/>:
      <p className="atlas-screen-loading" role="status">{ctx.identity==='loading'?'Opening workspace diagnostics…':'Open your workspace to view diagnostics.'}</p>}
    <section className="op-section"><div className="op-section-head"><div><h2>Data provenance and reliability</h2><p>See what is live, what is editable and what still requires an external connector.</p></div></div>
      <div className="op-card op-side-pane">
        <div className="op-source-row"><Globe2 size={19}/><div><strong>Counties, places and centroids · 2026 U.S. Census Gazetteer</strong><p>Geographic names and coordinates from official published records. {geo.incomplete?'Selected-state directory reported partial coverage.':'Selected-state directory available when loaded.'} <a href="https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html" target="_blank" rel="noreferrer">Source</a></p></div></div>
        <div className="op-source-row"><Plane size={19}/><div><strong>Airport directory · {airportSource==='live'?'OurAirports feed loaded':airportSource==='starter'?'Limited starter reference':airportSource==='cached'?'Last complete public airport snapshot':'Loading'}</strong><p>{airports.length} medium or large airport records displayed nationally. Type categories do not prove direct flights, commercial routes or real-time airline schedules.</p></div></div>
        <div className="op-source-row"><MapPin size={19}/><div><strong>Territory coverage and sales intelligence · Team-entered data</strong><p>Manager assignments and coaching information come from your workspace records, not an independently verified territory roster.</p></div></div>
        <div className="op-source-row"><CalendarCheck size={19}/><div><strong>Outlook and CRM sync · Not connected</strong><p>Export calendar events using ICS. Two-way Outlook and CRM connections require approved organization access, permissions and provider setup.</p></div></div>
        <div className="op-source-row"><ShieldCheck size={19}/><div><strong>EMS and fire account overlays · Not connected</strong><p>External agency intelligence should only be imported or connected with permission and verified organization data rights.</p></div></div>
      </div>
    </section>
  </>;
}
