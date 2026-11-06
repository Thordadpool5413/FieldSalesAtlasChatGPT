
import {
ArrowDown,
ArrowDownToLine,
ArrowUp,CalendarDays,Check,ChevronRight,CircleAlert,
ExternalLink,MapPin,Plane,Plus,Route,
Trash2,X
} from 'lucide-react';
import { useMemo,useState } from 'react';
import { useOp } from './Operations';
import {
Manager,
Trip,TripStop,
dateLabel,
distanceMiles,downloadFile,routeUrl,
toStateLabel,
today
} from './opsModels';
import { api } from './workspaceApi';
type Draft={
  title:string;trainer:string;startDate:string;endDate:string;arrivalAirport:string;
  status:'Planned'|'Completed'|'Canceled';notes:string;stops:TripStop[];
};
const blank=():Draft=>({title:'',trainer:'',startDate:today(),endDate:today(),arrivalAirport:'',status:'Planned',notes:'',stops:[]});
function toDraft(t:Trip):Draft{return {
  title:t.title,trainer:t.trainer||'',startDate:t.startDate,endDate:t.endDate,
  arrivalAirport:t.arrivalAirport||'',status:t.status||'Planned',notes:t.notes||'',
  stops:t.stops||[],
};}
function stopFor(manager:Manager, date:string, assignments:{managerId:string;stateCode:string}[],state:string):TripStop{
  const s=manager.baseState||assignments.find(a=>a.managerId===manager.id)?.stateCode||state;
  return {
    managerId:manager.id,stateCode:s,date,location:manager.baseCity?[manager.baseCity,s].filter(Boolean).join(', '):'',
    ...(manager.lat!==undefined&&manager.lon!==undefined?{lat:manager.lat,lon:manager.lon}:{}),
  };
}
export function TripsPage(){
  const ctx=useOp();
  const trips=ctx.board.trips||[];
  const managers=ctx.board.managers||[];
  const visits=ctx.board.visits||[];
  const assignments=ctx.board.assignments||[];
  const {airports}=ctx;
  const [selected,setSelected]=useState('');
  const [selectedUpdatedAt,setSelectedUpdatedAt]=useState('');
  const [draft,setDraft]=useState<Draft>(blank);
  const [,setEditing]=useState(true);
  const [saving,setSaving]=useState(false);
  const [localError,setLocalError]=useState('');
  const [airportQuery,setAirportQuery]=useState('');
  const []=useState('');
  const [statusFilter,setStatusFilter]=useState('all');
  const currentTrip=trips.find(t=>t.id===selected);
  const staleTrip=Boolean(selected&&selectedUpdatedAt&&(!currentTrip||(currentTrip.updatedAt&&currentTrip.updatedAt!==selectedUpdatedAt)));
  const sameTrainer=trips.filter(t=>t.id!==selected&&t.status!=='Canceled'&&t.trainer&&t.trainer===draft.trainer&&t.startDate<=draft.endDate&&t.endDate>=draft.startDate);
  const visitConflicts=visits.filter(v=>v.status!=='Canceled'&&v.trainer&&v.trainer===draft.trainer&&v.date>=draft.startDate&&v.date<=draft.endDate&&
    !draft.stops.some(s=>s.managerId===v.managerId&&(!s.date||s.date===v.date)));
  const airportsByCode=new Map(airports.map(a=>[a.iata,a]));
  const airport=airportsByCode.get(draft.arrivalAirport);
  const groundedStops=draft.stops.filter(s=>s.lat!==undefined&&s.lon!==undefined);
  const completeRoute= draft.stops.length>0 && groundedStops.length===draft.stops.length;
  const route=completeRoute?routeUrl(airport,draft.stops,managers):'';
  const candidates=useMemo(()=>{
    if(!groundedStops.length)return [];
    return airports
      .filter(a=>a.lat!==undefined&&a.lon!==undefined&&a.scheduled===true)
      .map(a=>{
        const sum=groundedStops.reduce((total,s)=>total+distanceMiles(s.lat!,s.lon!,a.lat!,a.lon!),0)/groundedStops.length;
        return {...a,miles:sum};
      })
      .sort((a,b)=>a.miles-b.miles)
      .slice(0,6);
  },[draft.stops,airports]);
  const matchingAirports=airports
    .filter(a=>(a.iata+' '+a.name+' '+a.state).toLowerCase().includes(airportQuery.toLowerCase()))
    .sort((a,b)=>Number(b.scheduled)-Number(a.scheduled)||a.iata.localeCompare(b.iata))
    .slice(0,65);
  const filteredTrips=trips.filter(t=>statusFilter==='all'||t.status===statusFilter).sort((a,b)=>b.startDate.localeCompare(a.startDate));
  function newTrip(){setSelected('');setSelectedUpdatedAt('');setDraft({...blank(),trainer:ctx.activeTrainer.name});setEditing(true);setLocalError('');}
  function loadTrip(t:Trip){setSelected(t.id);setSelectedUpdatedAt(t.updatedAt||'');setDraft(toDraft(t));setEditing(true);setLocalError('');}
  function set<K extends keyof Draft>(field:K,value:Draft[K]){setDraft(prev=>({...prev,[field]:value}));}
  function addStop(){
    if(!managers.length)return;
    setDraft(prev=>({...prev,stops:[...prev.stops,stopFor(managers[0],prev.startDate,assignments,ctx.state)]}));
  }
  function changeStop(index:number,patch:Partial<TripStop>){setDraft(prev=>({...prev,stops:prev.stops.map((s,i)=>i===index?{...s,...patch}:s)}));}
  function selectManagerForStop(index:number,managerId:string){
    const m=managers.find(m=>m.id===managerId);
    if(!m)return;
    const replacement=stopFor(m,draft.stops[index]?.date||draft.startDate,assignments,ctx.state);
    changeStop(index,replacement);
  }
  function removeStop(index:number){setDraft(prev=>({...prev,stops:prev.stops.filter((_,i)=>i!==index)}));}
  function moveStop(index:number,shift:number){setDraft(prev=>{
    const next=[...prev.stops];const to=index+shift;if(to<0||to>=next.length)return prev;
    [next[index],next[to]]=[next[to],next[index]];
    return {...prev,stops:next};
  });}
  function arrangeByProximity(){
    if(!draft.stops.length || !draft.stops.every(s=>s.lat!==undefined&&s.lon!==undefined)){
      setLocalError('Map a Census place in every manager profile before arranging stops by proximity.');return;
    }
    const remaining=[...draft.stops];
    const sorted:TripStop[]=[];
    let location=airport?.lat!==undefined&&airport.lon!==undefined?{lat:airport.lat,lon:airport.lon}:{lat:remaining[0].lat!,lon:remaining[0].lon!};
    while(remaining.length){
      let bestIndex=0,best=Infinity;
      remaining.forEach((s,i)=>{
        const dist=distanceMiles(location.lat,location.lon,s.lat!,s.lon!);
        if(dist<best){best=dist;bestIndex=i;}
      });
      const picked=remaining.splice(bestIndex,1)[0];sorted.push(picked);location={lat:picked.lat!,lon:picked.lon!};
    }
    setDraft({...draft,stops:sorted});
    setLocalError('');
    ctx.setNotice('Stops sorted by straight-line proximity. Review actual driving routes before traveling.');
  }
  async function save(){
    if(staleTrip){setLocalError('Another trainer changed this itinerary. Load the latest before saving.');return;}
    if(!draft.title.trim()){setLocalError('Trip title is required.');return;}
    if(!draft.startDate||!draft.endDate||draft.startDate>draft.endDate){setLocalError('Choose valid trip dates.');return;}
    if(draft.stops.some(s=>!s.managerId)){setLocalError('Every stop needs a manager.');return;}
    setSaving(true);setLocalError('');
    try{
      const value={...draft,title:draft.title.trim(),expectedUpdatedAt:selectedUpdatedAt};
      const response=await ctx.submit(()=>selected
        ? api.put('/api/trips/'+encodeURIComponent(selected),value)
        : api.post('/api/trips',value),'Trip saved to the team workspace.');
      if(!selected&&response.data.trip?.id)setSelected(response.data.trip.id);
      const stamp=response.data.updatedAt||response.data.trip?.updatedAt;
      if(stamp)setSelectedUpdatedAt(stamp);
    }catch(e){setLocalError(e instanceof Error?e.message:'Trip could not be saved.');}
    finally{setSaving(false);}
  }
  async function deleteTrip(t:Trip){
    if(!confirm('Permanently delete this trip? Any linked, uncompleted coaching visits will be canceled on the shared calendar; completed visits will remain in history.'))return;
    try{
      await ctx.submit(()=>api.delete('/api/trips/'+encodeURIComponent(t.id)),'Trip removed; any linked, uncompleted coaching visits were canceled.');
      newTrip();
    }catch{}
  }
  function downloadItinerary(){
    const lines=['FIELD SALES ATLAS · COACHING TRIP',draft.title,'', 'Trainer: '+(draft.trainer||'Not assigned'),
      'Dates: '+draft.startDate+' to '+draft.endDate,'Arrival airport: '+(draft.arrivalAirport||'Not set'),
      'Status: '+draft.status,'','STOPS'];
    draft.stops.forEach((s,i)=>{
      const m=managers.find(m=>m.id===s.managerId);
      lines.push((i+1)+'. '+(m?.name||'Unknown manager')+' · '+toStateLabel(s.stateCode)+' · '+(s.date||'Date pending'),
        'Location: '+(s.location||m?.baseCity||'Not set'));
    });
    lines.push('','NOTES',draft.notes||'None','', 'Verify commercial flight schedules and ground travel separately.');
    downloadFile('field-atlas-itinerary.txt',lines.join('\n'),'text/plain;charset=utf-8');
  }
  return <>
    <div className="op-head atlas-editorial-head">
      <div><p className="op-eyebrow">TRAVEL INTELLIGENCE</p><h1>Itineraries</h1>
        <p className="op-subtitle">Build multi-stop field trips, compare nearby flight gateways and keep a shared itinerary.</p></div>
      <div className="op-head-actions"><button className="op-btn primary" onClick={newTrip} disabled={ctx.identity!=='member'}><Plus size={16}/> New trip</button></div>
    </div>
    <div className="op-geo-layout">
      <div className="op-card">
        <div className="op-card-header"><div><h2>{currentTrip?'Edit itinerary':'Build a new itinerary'}</h2><p>Saved trips are shared with your team. Flight bookings are not made here.</p></div></div>
        {staleTrip&&<div className="op-alert warn" role="alert" style={{margin:'12px 16px'}}>
          <CircleAlert size={16}/><span>Another trainer has updated or removed this trip. Your unsaved draft has not overwritten their work.</span>
          <button className="op-btn tiny" type="button" onClick={()=>currentTrip?loadTrip(currentTrip):newTrip()}>Load latest</button>
        </div>}
        {currentTrip&&(visits.some(v=>v.tripId===currentTrip.id))&&<div className="op-alert" style={{margin:'14px 20px 0'}}>
          <CalendarDays size={17}/><span>This itinerary has linked coaching visits on the calendar. Saving trip changes also updates its proposed calendar visits. Canceling or deleting the trip cancels any linked, uncompleted visits; completed coaching history is preserved.</span>
        </div>}
        <div className="op-form-grid-wrap">
          <div className="op-form">
            <label className="full">Trip name *<input value={draft.title} onChange={e=>set('title',e.target.value)} placeholder="e.g. Central Florida coaching circuit"/></label>
            <label>Start date *<input type="date" value={draft.startDate} onChange={e=>set('startDate',e.target.value)}/></label>
            <label>End date *<input type="date" value={draft.endDate} onChange={e=>set('endDate',e.target.value)}/></label>
            <label>Assigned trainer<select value={draft.trainer} onChange={e=>set('trainer',e.target.value)}>
              <option value="">Unassigned</option>
              {[...new Set([...ctx.trainerProfiles.map(p=>p.name),draft.trainer].filter(Boolean))].map(name=><option key={name} value={name}>{name}</option>)}
            </select></label>
            <label>Trip status<select value={draft.status} onChange={e=>set('status',e.target.value as Draft['status'])}><option>Planned</option><option>Completed</option><option>Canceled</option></select></label>
          </div>
          {(sameTrainer.length>0||visitConflicts.length>0)&&<div className="op-alert warn" style={{marginTop:15}}>
            <CircleAlert size={17}/><span>{sameTrainer.length} overlapping trips and {visitConflicts.length} visits outside this itinerary fall within the selected dates. Review the schedule before confirming travel.</span></div>}
          <div className="op-section-head" style={{marginTop:25}}><div><h2>Manager stops</h2><p>Reorder the visits or arrange them approximately by location.</p></div>
            <button className="op-btn tiny soft" onClick={arrangeByProximity} disabled={draft.stops.length<2}>Arrange by proximity</button>
          </div>
          {!draft.stops.length&&<div className="op-drop-empty"><MapPin size={24}/><strong>No stops added yet</strong><p>Add managers from your shared roster. City coordinates allow geographic sorting and external route directions.</p></div>}
          {draft.stops.map((stop,i)=>{
            const m=managers.find(m=>m.id===stop.managerId);
            return <div className="op-trip-stop" key={i}>
              <span className="op-number">{i+1}</span>
              <div className="op-trip-stop-info"><strong>{m?.name||'Choose manager'}</strong><small>{toStateLabel(stop.stateCode)} {stop.lat===undefined?'· Map location to enable routing':''}</small></div>
              <select value={stop.managerId} onChange={e=>selectManagerForStop(i,e.target.value)} aria-label={'Manager for stop '+(i+1)}>
                {managers.map(person=><option value={person.id} key={person.id}>{person.name}</option>)}
              </select>
              <input className="op-input-compact" type="date" value={stop.date} onChange={e=>changeStop(i,{date:e.target.value})} aria-label={'Date for stop '+(i+1)}/>
              <input className="op-input-place" value={stop.location} onChange={e=>changeStop(i,{location:e.target.value})} placeholder="City / address" aria-label={'Location for stop '+(i+1)}/>
              <div style={{display:'flex',gap:2}}>
                <button className="op-icon-button" disabled={i===0} onClick={()=>moveStop(i,-1)} title="Move stop up"><ArrowUp size={16}/></button>
                <button className="op-icon-button" disabled={i===draft.stops.length-1} onClick={()=>moveStop(i,1)} title="Move stop down"><ArrowDown size={16}/></button>
                <button className="op-icon-button" onClick={()=>removeStop(i)} title="Remove stop"><X size={16}/></button>
              </div>
            </div>;
          })}
          <button className="op-btn soft" style={{marginTop:11}} onClick={addStop} disabled={!managers.length||draft.stops.length>=30}><Plus size={15}/> Add manager stop</button>
          <div className="op-section-head" style={{marginTop:28}}><div><h2>Airport selection</h2><p>Prioritize scheduled commercial service and a realistic driving gateway.</p></div></div>
          <div className="op-form">
            <label className="full">Arrival airport
              <div className="op-search" style={{width:'100%'}}><Plane size={16}/><input value={airportQuery} onChange={e=>setAirportQuery(e.target.value)} placeholder="Search by IATA, airport or state..." aria-label="Search airport"/></div>
              <select value={draft.arrivalAirport} onChange={e=>set('arrivalAirport',e.target.value)}><option value="">Choose an airport</option>{matchingAirports.map(a=><option key={a.iata+a.name} value={a.iata}>{a.iata} · {a.name} · {a.state}{a.scheduled?' · scheduled service':''}</option>)}{draft.arrivalAirport&&!matchingAirports.some(a=>a.iata===draft.arrivalAirport)&&<option value={draft.arrivalAirport}>{draft.arrivalAirport}</option>}</select>
            </label>
          </div>
          {candidates.length>0&&<div className="op-trip-summary">
            <strong>Nearby airports by straight-line proximity</strong>
            <p>The distances average straight-line miles to mapped manager stops, not driving time or airline connectivity.</p>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:13}}>
              {candidates.map(a=><button className="op-btn tiny" key={a.iata} onClick={()=>{set('arrivalAirport',a.iata);setAirportQuery('');}}>
                {a.iata} · {Math.round(a.miles)} mi</button>)}
            </div>
          </div>}
          {!candidates.length&&<p className="op-subtle" style={{lineHeight:1.6}}>Map your managers' base cities to see proximity-ranked airport alternatives, including airports across state boundaries.</p>}
          <div className="op-form" style={{marginTop:20}}>
            <label className="full">Trip logistics and objectives<textarea rows={3} value={draft.notes} onChange={e=>set('notes',e.target.value)} placeholder="Ride-alongs, hotels, meetings, travel constraints, goals..."/></label>
          </div>
          {localError&&<div className="op-error" style={{marginTop:17}}><CircleAlert size={16}/>{localError}</div>}
          <div className="op-form-actions">
            {selected&&<button className="op-btn danger" onClick={()=>currentTrip&&deleteTrip(currentTrip)}><Trash2 size={15}/> Delete</button>}
            <button className="op-btn" onClick={downloadItinerary} disabled={!draft.title}><ArrowDownToLine size={15}/> Itinerary</button>
            {route&&<a className="op-btn" href={route} target="_blank" rel="noreferrer"><Route size={15}/> Open driving route <ExternalLink size={12}/></a>}
            <button className="op-btn primary" disabled={ctx.identity!=='member'||saving} onClick={save}><Check size={16}/>{saving?'Saving...':selected?'Save changes':'Save trip'}</button>
          </div>
          {!completeRoute&&draft.stops.length>0&&<p className="op-subtle" style={{lineHeight:1.7,marginTop:12}}>Driving routes use the saved manager base-place coordinates rather than a meeting street address. All stops need coordinates; free-text visit addresses are not geocoded. Verify exact destinations before driving.</p>}
        </div>
      </div>
      <aside className="op-card">
        <div className="op-card-header"><div><h2>Saved field trips</h2><p>{trips.length} itineraries on this shared workspace</p></div><Route size={19} color="#4b73aa"/></div>
        <div className="op-side-pane">
          <div className="op-segment" style={{marginBottom:12}}>
            {['all','Planned','Completed'].map(s=><button key={s} className={statusFilter===s?'active':''} onClick={()=>setStatusFilter(s)}>{s==='all'?'All':s}</button>)}
          </div>
          {!filteredTrips.length&&<div className="op-empty"><Route size={26}/><strong>No trips found</strong><span>Save an itinerary to coordinate your team's field travel.</span></div>}
          {filteredTrips.map(t=><button key={t.id} className={'op-queue-row'+(selected===t.id?' is-selected':'')} style={{paddingLeft:7,paddingRight:7,borderRadius:8}} onClick={()=>loadTrip(t)}>
            <div className="op-list-icon"><CalendarDays size={16}/></div>
            <div className="op-queue-main"><strong>{t.title}</strong><small>{dateLabel(t.startDate,{month:'short',day:'numeric'})} to {dateLabel(t.endDate,{month:'short',day:'numeric'})} · {t.stops.length} stops</small><small>{t.trainer||'Trainer not assigned'} · {t.arrivalAirport||'Airport pending'}</small></div>
            <ChevronRight size={15} color="#8fa2b6"/>
          </button>)}
          <div className="op-kpi-note" style={{marginTop:20}}><strong>What this tool does and doesn't calculate</strong>
            <p style={{margin:'8px 0 0'}}>Geographic sorting uses straight-line distances. The external routing link uses Google Maps. No live flight pricing, availability, estimated travel times or company booking integration is currently provided.</p></div>
        </div>
      </aside>
    </div>
  </>;
}
