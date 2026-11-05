
import { ArrowDownToLine,ArrowRight,CalendarDays,CalendarRange,CheckCircle2,ChevronLeft,ChevronRight,CircleAlert,Clock3,List,Plus,X } from 'lucide-react';
import { useEffect,useMemo,useRef,useState } from 'react';
import './CalendarAvailability.css';
import { useOp } from './Operations';
import { AvailabilityBlock,dateLabel,exportCalendar,Manager,today,toStateLabel,TrainerProfile,Trip,Visit } from './opsModels';
import { api } from './workspaceApi';

type CalEvent = {id:string;date:string;label:string;trainer:string} & ({type:'visit';record:Visit}|{type:'trip';record:Trip}|{type:'availability';record:AvailabilityBlock});
const iso=(date:Date)=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
const local=(v:string)=>new Date(v+'T12:00:00');
const addDays=(date:Date,n:number)=>{const copy=new Date(date.getFullYear(),date.getMonth(),date.getDate());copy.setDate(copy.getDate()+n);return copy;};
function dayEvents(visits:Visit[],trips:Trip[],trainer:string,managers:Manager[],blocks:AvailabilityBlock[],profiles:TrainerProfile[]):CalEvent[]{
  const out:CalEvent[]=[];
  visits.filter(v=>v.status!=='Canceled'&&(!trainer||v.trainer===trainer)).forEach(v=>{
    out.push({id:v.id,date:v.date,label:'Coach · '+(managers.find(m=>m.id===v.managerId)?.name||toStateLabel(v.stateCode)),trainer:v.trainer||'',type:'visit',record:v});
  });
  trips.filter(t=>t.status!=='Canceled'&&(!trainer||t.trainer===trainer)).forEach(t=>{
    const start=local(t.startDate),end=local(t.endDate);
    if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime()))return;
    for(let cursor=start,i=0;cursor<=end && i<45;cursor=addDays(cursor,1),i++){
      out.push({id:t.id+'-'+i,date:iso(cursor),label:'Trip · '+t.title,trainer:t.trainer||'',type:'trip',record:t});
    }
  });
  for(const block of blocks){
    const name=profiles.find(p=>p.id===block.trainerId)?.name||'Trainer';
    if(trainer&&name!==trainer)continue;
    const a=local(block.startDate),b=local(block.endDate);
    if(!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime()))continue;
    for(let d=a,n=0;d<=b&&n<=90;d=addDays(d,1),n++){
      out.push({id:'hold-'+block.id+'-'+n,date:iso(d),
        label:block.reason+' · '+name,trainer:name,type:'availability',record:block});
    }
  }
  return out;
}
export function CalendarPage(){
  const ctx=useOp();
  const visits=ctx.board.visits||[],trips=ctx.board.trips||[],managers=ctx.board.managers||[];
  const availability=ctx.board.availability||[];
  const [month,setMonth]=useState(()=>new Date(today()+'T12:00:00'));
  const [trainer,setTrainer]=useState('');
  const [selectedDay,setSelectedDay]=useState(today());
  const [daySheetOpen,setDaySheetOpen]=useState(false);
  const [holdOpen,setHoldOpen]=useState(false);
  const holdFocusRef=useRef<HTMLSelectElement>(null);
  const holdDialogRef=useRef<HTMLFormElement>(null);
  const [holdBusy,setHoldBusy]=useState(false);
  const [holdError,setHoldError]=useState('');
  useEffect(()=>{
    if(!holdOpen)return;
    const previousFocus=document.activeElement as HTMLElement|null;
    const oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    holdFocusRef.current?.focus({preventScroll:true});
    function handle(event:KeyboardEvent){
      if(event.key==='Escape'&&!holdBusy){
        event.preventDefault();setHoldOpen(false);return;
      }
      if(event.key!=='Tab')return;
      const controls=Array.from(holdDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),select:not([disabled]),input:not([disabled])'
      )||[]).filter(item=>item.getClientRects().length>0);
      if(!controls.length)return;
      if(event.shiftKey&&document.activeElement===controls[0]){
        event.preventDefault();controls[controls.length-1].focus();
      }else if(!event.shiftKey&&document.activeElement===controls[controls.length-1]){
        event.preventDefault();controls[0].focus();
      }
    }
    window.addEventListener('keydown',handle);
    return()=>{
      window.removeEventListener('keydown',handle);
      document.body.style.overflow=oldOverflow;
      previousFocus?.focus({preventScroll:true});
    };
  },[holdOpen,holdBusy]);
  const [hold,setHold]=useState<{trainerId:'trainer_a'|'trainer_b';startDate:string;endDate:string;reason:'Unavailable'|'Personal time'|'Travel hold'}>({
    trainerId:ctx.activeTrainerId,startDate:today(),endDate:today(),reason:'Unavailable'
  });
  function openHold(){
    setHold(v=>({...v,trainerId:ctx.activeTrainerId,startDate:selectedDay,endDate:selectedDay}));
    setDaySheetOpen(false);setHoldError('');setHoldOpen(true);
  }
  async function saveHold(){
    if(ctx.identity!=='member'||holdBusy)return;
    const a=Date.parse(hold.startDate+'T12:00:00Z'),b=Date.parse(hold.endDate+'T12:00:00Z');
    if(!Number.isFinite(a)||!Number.isFinite(b)||a>b||(b-a)/86400000>90){
      setHoldError('Choose a valid date range of no more than 90 days.');return;
    }
    setHoldBusy(true);setHoldError('');
    try{
      await api.post('/api/trainer-availability',{id:crypto.randomUUID(),...hold,notes:''});
      await ctx.reload();
      setHoldOpen(false);
      ctx.setNotice('Trainer time block saved in the shared calendar.');
    }catch(err){setHoldError(err instanceof Error?err.message:'Could not save trainer time.');}
    finally{setHoldBusy(false);}
  }
  const daySheetRef=useRef<HTMLDivElement>(null);
  const swipeStart=useRef<{x:number;y:number}|null>(null);
  const swipeConsumed=useRef(false);
  const sheetTouchY=useRef<number|null>(null);
  const [calendarView,setCalendarView]=useState<'agenda'|'month'>(()=>
    typeof window!=='undefined'&&window.matchMedia('(max-width:720px)').matches?'agenda':'month'
  );
  const trainerChoices=[...new Set([...ctx.trainerProfiles.map(p=>p.name),...managers.map(m=>m.trainer),...visits.map(v=>v.trainer||''),...trips.map(t=>t.trainer)].filter(Boolean))];
  const all=useMemo(()=>dayEvents(visits,trips,trainer,managers,availability,ctx.trainerProfiles),[visits,trips,trainer,managers,availability,ctx.trainerProfiles]);

  const conflictDays=useMemo(()=>{
    const byDay=new Map<string,CalEvent[]>();
    for(const event of all){
      const events=byDay.get(event.date)||[];
      events.push(event);byDay.set(event.date,events);
    }
    const issues=new Map<string,string[]>();
    for(const [date,events] of byDay){
      const warnings:string[]=[];
      const tripByTrainer=new Map<string,Set<string>>();
      const visitByManager=new Map<string,Set<string>>();
      const visitLocations=new Map<string,Set<string>>();
      for(const e of events){
        if(e.type==='trip'&&e.trainer){
          const group=tripByTrainer.get(e.trainer)||new Set<string>();group.add((e.record as Trip).id);tripByTrainer.set(e.trainer,group);
        }else if(e.type==='visit'){
          const visit=e.record as Visit;
          const ids=visitByManager.get(visit.managerId)||new Set<string>();ids.add(visit.id);visitByManager.set(visit.managerId,ids);
          if(e.trainer&&['Planned','Rescheduled'].includes(visit.status)){
            const regions=visitLocations.get(e.trainer)||new Set<string>();
            regions.add(visit.stateCode);visitLocations.set(e.trainer,regions);
          }
        }
      }
      for(const [name,ids] of tripByTrainer)if(ids.size>1)
        warnings.push(name+' has '+ids.size+' overlapping trips');
      for(const [managerId,ids] of visitByManager)if(ids.size>1){
        const person=managers.find(m=>m.id===managerId);
        warnings.push((person?.name||'A manager')+' has duplicate coaching visits');
      }
      for(const [name,regions] of visitLocations)if(regions.size>1)
        warnings.push(name+' has visits in different states or provinces ('+[...regions].join(', ')+')');
      const held=new Set(events.filter(event=>event.type==='availability'&&event.record.reason!=='Travel hold').map(event=>event.trainer));
      for(const name of held)if(events.some(event=>event.type!=='availability'&&event.trainer===name))
        warnings.push(name+' has scheduled field activity during a blocked day');
      // A coaching visit within its trainer's trip is normal, not a conflict.
      if(warnings.length)issues.set(date,warnings);
    }
    return issues;
  },[all,managers]);
  const upcomingIssues=[...conflictDays.entries()].filter(([date])=>date>=today()).sort(([a],[b])=>a.localeCompare(b));
  function jumpToIssue(day:string){
    const date=new Date(day+'T12:00:00');
    if(Number.isNaN(date.getTime()))return;
    setMonth(new Date(date.getFullYear(),date.getMonth(),1));setSelectedDay(day);setCalendarView('month');
    if(window.matchMedia('(max-width:900px)').matches)setDaySheetOpen(true);
  }
  const year=month.getFullYear(),m=month.getMonth(),first=new Date(year,m,1),start=new Date(year,m,1-first.getDay());
  const days=Array.from({length:42},(_,i)=>addDays(start,i));
  const eventsFor=(date:string)=>all.filter(e=>e.date===date);
  const selected=eventsFor(selectedDay).sort((a,b)=>a.label.localeCompare(b.label));
  const upcomingDates=Array.from({length:30},(_,i)=>iso(addDays(new Date(today()+'T12:00:00'),i)))
    .map(date=>({date,events:all.filter(event=>event.date===date)}))
    .filter(day=>day.events.length>0);
  function changeMonth(n:number){const next=new Date(year,m+n,1);setMonth(next);setSelectedDay(iso(next));}
  function openCalendarDay(day:string){
    if(swipeConsumed.current)return;
    setSelectedDay(day);
    if(window.matchMedia('(max-width:900px)').matches)setDaySheetOpen(true);
  }
  useEffect(()=>{
    if(!daySheetOpen)return;
    const previous=document.activeElement as HTMLElement|null;
    const originalOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    daySheetRef.current?.querySelector<HTMLButtonElement>('.ios-calendar-sheet-close')?.focus({preventScroll:true});
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setDaySheetOpen(false);return;}
      if(event.key!=='Tab')return;
      const controls=Array.from(daySheetRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],[tabindex="0"]'
      )||[]).filter(item=>item.getClientRects().length>0);
      if(!controls.length)return;
      if(event.shiftKey&&document.activeElement===controls[0]){
        event.preventDefault();controls[controls.length-1].focus();
      }else if(!event.shiftKey&&document.activeElement===controls[controls.length-1]){
        event.preventDefault();controls[0].focus();
      }
    };
    window.addEventListener('keydown',onKey);
    return ()=>{
      window.removeEventListener('keydown',onKey);
      document.body.style.overflow=originalOverflow;
      previous?.focus({preventScroll:true});
    };
  },[daySheetOpen]);
  return <>
    <div className="op-head atlas-editorial-head"><div><p className="op-eyebrow"><span className="atlas-beacon" aria-hidden="true"/>SHARED FIELD CALENDAR</p><h1>Calendar</h1>
      <p className="op-subtitle">View trainer travel, coaching visits and competing commitments before booking.</p></div>
      <div className="op-head-actions fsa-calendar-header-actions">
        <button type="button" className="op-btn" onClick={()=>ctx.go('air')}>
          <CalendarDays size={16}/> Plan travel
        </button>
        <button type="button" className="op-btn" onClick={openHold} disabled={ctx.identity!=='member'}>
          <Plus size={16}/> Block trainer time
        </button>
        <button className="op-btn" onClick={()=>exportCalendar(visits,trips,managers,availability,ctx.trainerProfiles)} disabled={ctx.identity!=='member'}><ArrowDownToLine size={16}/> Export to Outlook (.ics)</button>
        <button className="op-btn primary"
          onClick={()=>managers.length?ctx.open('visit'):openHold()}
          disabled={ctx.identity!=='member'}>
          <Plus size={16}/>{managers.length?'Plan visit':'Block trainer time'}
        </button>
      </div>
    </div>
    <div className="op-toolbar">
      <select value={trainer} onChange={e=>setTrainer(e.target.value)} aria-label="Filter calendar by trainer"><option value="">All trainers</option>{trainerChoices.map(t=><option key={t}>{t}</option>)}</select>
      <span className="op-subtle">{visits.filter(v=>v.status==='Planned').length} planned visits · {trips.filter(t=>t.status==='Planned').length} planned trips · {availability.length} shared blocks</span>
    </div>
    {upcomingIssues.length>0&&<div className="op-calendar-review" role="status"><CircleAlert size={17}/>
      <span><strong>{upcomingIssues.length} schedule day{upcomingIssues.length===1?'':'s'} to review.</strong> Same-manager visits, overlapping trips, or same-day travel between different regions.</span>
      <button onClick={()=>jumpToIssue(upcomingIssues[0][0])}>Review {dateLabel(upcomingIssues[0][0],{month:'short',day:'numeric'})}</button>
    </div>}
    {availability.length>0&&<section className="atlas-calendar-availability"
      aria-label="Shared unavailable trainer days">
      <div>
        <span>SHARED AVAILABILITY</span>
        <strong>{availability.length} unavailable-time block{availability.length===1?'':'s'} recorded</strong>
        <small>These dates are excluded from coordination recommendations. External appointments remain unverified.</small>
      </div>
      <div className="atlas-calendar-blocks">
        {availability.filter(b=>!trainer||ctx.trainerProfiles.find(p=>p.id===b.trainerId)?.name===trainer)
          .slice().sort((a,b)=>a.startDate.localeCompare(b.startDate)).slice(0,8).map(b=>
          <span key={b.id}>
            {ctx.trainerProfiles.find(p=>p.id===b.trainerId)?.name||'Trainer'} ·
            {' '+dateLabel(b.startDate,{month:'short',day:'numeric'})}
            {b.endDate!==b.startDate?' – '+dateLabel(b.endDate,{month:'short',day:'numeric'}):''}
            {' · '+b.reason}
          </span>)}
      </div>
      <button type="button" onClick={()=>ctx.go('coordinate')}>
        Edit trainer availability <ArrowRight size={15}/>
      </button>
    </section>}
    <div className="fsa-calendar-view-switch" role="group" aria-label="Calendar display mode">
      <button type="button" className={calendarView==='agenda'?'is-active':''}
        aria-pressed={calendarView==='agenda'} onClick={()=>setCalendarView('agenda')}><List size={18}/> Agenda</button>
      <button type="button" className={calendarView==='month'?'is-active':''}
        aria-pressed={calendarView==='month'} onClick={()=>setCalendarView('month')}><CalendarRange size={18}/> Month</button>
      <span>Shared field visits, travel and trainer time blocks · not synchronized with external calendars.</span>
    </div>
    {calendarView==='agenda'?<section className="fsa-calendar-agenda" aria-label="Upcoming team commitments">
      <header><div><p className="fsa-kicker">THE NEXT 30 DAYS</p><h2>Upcoming commitments</h2>
        <p>Committed visits and saved trips, organized by day. Choose an event to review it.</p></div>
        <button type="button" className="op-btn"
          onClick={()=>managers.length?ctx.open('visit'):openHold()}
          disabled={ctx.identity!=='member'}>
          <Plus size={16}/>{managers.length?'Plan visit':'Block trainer time'}
        </button>
      </header>
      {upcomingDates.length?upcomingDates.map(day=><div className="fsa-agenda-day" key={day.date}>
        <div className="fsa-agenda-date"><strong>{dateLabel(day.date,{weekday:'short'})}</strong>
          <span>{dateLabel(day.date,{month:'short',day:'numeric'})}</span>
          {conflictDays.has(day.date)&&<small><CircleAlert size={13}/> Review conflict</small>}
        </div>
        <div className="fsa-agenda-events">
          {day.events.map(event=><button type="button" key={event.id} onClick={()=>{
            if(event.type==='visit')ctx.open('visit',event.record);
             else if(event.type==='availability')ctx.go('coordinate');
             else ctx.go('trips');
          }}>
            <span className={'fsa-agenda-type '+event.type}><CalendarDays size={17}/></span>
            <span><strong>{event.label}</strong><small>{event.trainer||'Trainer not assigned'} · {event.type==='visit'?event.record.stateCode||'Region not set':event.type==='availability'?'Shared availability block':'Saved multi-day trip'}</small></span>
            <ChevronRight size={17}/>
          </button>)}
        </div>
      </div>):<div className="fsa-agenda-empty"><CalendarDays size={28}/>
        <h3>Nothing scheduled in the next 30 days.</h3>
        <p>{managers.length?
          'Use Plan to coordinate a manager visit or build a shared coaching week.':
          'Block trainer time or plan travel now. Coaching visits become available when managers are connected.'}</p>
        <button type="button" className="op-btn primary"
          onClick={()=>managers.length?ctx.go('week'):openHold()}>
          {managers.length?'Build our week':'Block trainer time'}
        </button>
      </div>}
    </section>:<div className="op-geo-layout">
      <div className="op-card" style={{overflow:'hidden'}}>
        <div className="op-calendar-head"><strong>{new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(month)}</strong>
          <div className="op-calendar-nav"><button className="op-btn tiny" onClick={()=>{const d=new Date(today()+'T12:00:00');setMonth(d);setSelectedDay(today());}}>Today</button>
            <button className="op-icon-button" aria-label="Previous month" onClick={()=>changeMonth(-1)}><ChevronLeft size={18}/></button>
            <button className="op-icon-button" aria-label="Next month" onClick={()=>changeMonth(1)}><ChevronRight size={18}/></button>
          </div>
        </div>
        <div className="op-calendar-grid"
          onTouchStart={event=>{
            if(event.touches.length===1)swipeStart.current={
              x:event.touches[0].clientX,y:event.touches[0].clientY
            };
          }}
          onTouchEnd={event=>{
            const start=swipeStart.current;
            swipeStart.current=null;
            if(!start||!event.changedTouches.length)return;
            const dx=event.changedTouches[0].clientX-start.x;
            const dy=event.changedTouches[0].clientY-start.y;
            if(Math.abs(dx)>75&&Math.abs(dx)>Math.abs(dy)*1.65){
              swipeConsumed.current=true;
              changeMonth(dx<0?1:-1);
              window.setTimeout(()=>{swipeConsumed.current=false;},270);
            }
          }} aria-label="Calendar month, swipe horizontally to change month">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=><div key={x} className="op-weekday">{x}</div>)}
          {days.map((d,i)=>{
            const day=iso(d),events=eventsFor(day),conflict=conflictDays.has(day);
            const unavailable=availability.some(block=>block.startDate<=day&&block.endDate>=day&&
              (!trainer||ctx.trainerProfiles.find(profile=>profile.id===block.trainerId)?.name===trainer));
            return <div key={i} className={'op-day'+(d.getMonth()!==m?' other':'')+(day===today()?' today':'')+
              (day===selectedDay?' selected':'')+(unavailable?' atlas-day-unavailable':'')}>
              <button className="op-icon-button op-day-number" style={{padding:0,minWidth:24,justifyContent:'flex-start'}} onClick={()=>openCalendarDay(day)} aria-pressed={selectedDay===day} aria-label={'Show schedule for '+day+', '+events.length+' events'}>{d.getDate()}</button>
              <span className="ios-calendar-dots" aria-hidden="true">
                {events.slice(0,3).map(e=><i key={e.id} className={e.type==='trip'?'trip':e.type==='availability'?'unavailable':'visit'}/>)}
                {conflict&&<i className="conflict"/>}
                {unavailable&&<i className="unavailable"/>}
              </span>
              {unavailable&&<span className="atlas-day-unavailable-label">Unavailable</span>}
              {events.slice(0,3).map(e=><button title={e.label} className={'op-calendar-event'+(e.type==='trip'?' trip':e.type==='availability'?' availability':'')+(conflict?' conflict':'')} key={e.id} onClick={()=>openCalendarDay(day)}>{e.label}</button>)}
              {events.length>3&&<button className="op-calendar-event" onClick={()=>openCalendarDay(day)}>+ {events.length-3} more</button>}
            </div>;
          })}
        </div>
        <div className="op-calendar-foot atlas-calendar-legend">
          <span><i className="atlas-legend-visit" aria-hidden="true"/> Coaching visits</span>
          <span><i className="atlas-legend-trip" aria-hidden="true"/> Field trips</span>
          <span><i className="atlas-legend-hold" aria-hidden="true"/> Trainer holds</span>
          <span><i className="atlas-legend-warning" aria-hidden="true"/> Needs review</span>
        </div>
      </div>
      <aside className="op-card ios-calendar-desktop-details">
        <div className="op-card-header"><div><h2>{dateLabel(selectedDay,{weekday:'long',month:'short',day:'numeric'})}</h2><p>Trainer activity on the selected day</p></div><CalendarDays size={20}/></div>
        <div className="op-side-pane">
          {conflictDays.has(selectedDay)&&<div className="op-alert warn"><CircleAlert size={16}/><div>
            <strong>Schedule issues to review</strong>
            {(conflictDays.get(selectedDay)||[]).map(issue=><p key={issue} style={{margin:'6px 0 0'}}>{issue}</p>)}
          </div></div>}
          {!selected.length?<div className="op-empty">
            <Clock3 size={26}/><strong>Nothing scheduled</strong>
            <span>{managers.length?'Plan a coaching visit for this day.':
              'Block trainer time or plan travel without saving a manager.'}</span>
            {ctx.identity==='member'&&<button type="button" className="op-btn"
              onClick={()=>managers.length?ctx.open('visit'):openHold()}>
              <Plus size={16}/>{managers.length?'Plan visit':'Block trainer time'}
            </button>}
          </div>:
            selected.map(e=><div className="op-info-row" key={e.id}>
              <div className="op-info-icon">{e.type==='trip'?<CalendarDays size={16}/>:<CheckCircle2 size={16}/>}</div>
              <div><strong>{e.label}</strong><span>{e.type==='visit'?managers.find(m=>m.id===e.record.managerId)?.name:e.type==='availability'?'Shared time block':'Field trip'}</span>
                <span>{e.trainer||'Trainer not assigned'} · {e.type==='trip'?'Multi-day itinerary':e.type==='availability'?e.record.reason:e.record.airport||'Airport not specified'}</span>
                {e.type==='visit'&&((e.record as Visit).startTime||(e.record as Visit).endTime)&&<span>Proposed coaching window: {[(e.record as Visit).startTime,(e.record as Visit).endTime].filter(Boolean).join(' – ')} · confirm with manager</span>}
              </div>
              {e.type==='visit'&&<button className="op-btn tiny" onClick={()=>ctx.open('visit',e.record)}>Edit</button>}
              {e.type==='trip'&&<button className="op-btn tiny" onClick={()=>ctx.go('trips')}>Trips</button>}
                {e.type==='availability'&&<button className="op-btn tiny" onClick={()=>ctx.go('coordinate')}>Manage</button>}
            </div>)}
          <div className="op-muted-block" style={{marginTop:20}}>Outlook export creates an ICS file with proposed coaching windows in event notes. It does not create timezone-verified appointments, live bookings, two-way Microsoft 365 sync, or automatically detect external meeting changes.</div>
        </div>
      </aside>
    </div>}
    {calendarView==='month'&&<section className="op-section">
      <div className="op-section-head"><h2>Upcoming visits</h2><span className="op-subtle">Editable team records</span></div>
      <div className="op-card">
        {visits.filter(v=>v.date>=today()&&v.status!=='Canceled').length?
          <div className="op-table-scroll"><table className="op-table"><thead><tr><th>Date</th><th>Manager</th><th>Trainer</th><th>Airport</th><th>Status</th><th/></tr></thead><tbody>
            {visits.filter(v=>v.date>=today()&&v.status!=='Canceled').sort((a,b)=>a.date.localeCompare(b.date)).slice(0,25).map(v=><tr key={v.id}>
              <td>{dateLabel(v.date)}</td><td><strong>{managers.find(m=>m.id===v.managerId)?.name||'Former manager'}</strong></td><td>{v.trainer||'Not assigned'}</td><td>{v.airport||'Not set'}</td>
              <td><span className="op-badge">{v.status}</span></td><td><button className="op-icon-button" onClick={()=>ctx.open('visit',v)}><ChevronRight size={16}/></button></td>
            </tr>)}
          </tbody></table></div>:
          <div className="op-empty">
            <CalendarDays size={25}/><strong>No upcoming visits on the calendar</strong>
            <span>{managers.length?'Plan a visit to get started.':
              'Add a territory manager to make coaching visits available.'}</span>
            {ctx.identity==='member'&&<button type="button" className="op-btn"
              onClick={()=>managers.length?ctx.open('visit'):openHold()}>
              <Plus size={16}/>{managers.length?'Plan visit':'Block trainer time'}
            </button>}
          </div>
      }</div>
    </section>}
    {holdOpen&&<div className="fsa-hold-scrim" onMouseDown={event=>{
      if(event.target===event.currentTarget&&!holdBusy)setHoldOpen(false);
    }}>
      <form role="dialog" aria-modal="true" aria-labelledby="fsa-hold-heading"
        className="fsa-hold-sheet" ref={holdDialogRef} onSubmit={event=>{event.preventDefault();void saveHold();}}>
        <header><div><span>FIELD CALENDAR · SHARED AVAILABILITY</span>
          <h2 id="fsa-hold-heading">Block trainer time</h2>
          <p>Schedule independently of manager records.</p></div>
          <button type="button" disabled={holdBusy} onClick={()=>setHoldOpen(false)} aria-label="Close time editor"><X size={20}/></button>
        </header>
        <div className="fsa-hold-grid">
          <label className="wide">Trainer
            <select ref={holdFocusRef} value={hold.trainerId}
              onChange={e=>setHold(s=>({...s,trainerId:e.target.value as 'trainer_a'|'trainer_b'}))}>
              {ctx.trainerProfiles.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Start date<input type="date" required value={hold.startDate}
            onChange={e=>setHold(s=>({...s,startDate:e.target.value,endDate:s.endDate<e.target.value?e.target.value:s.endDate}))}/></label>
          <label>End date<input type="date" required value={hold.endDate} min={hold.startDate}
            onChange={e=>setHold(s=>({...s,endDate:e.target.value}))}/></label>
          <label className="wide">Block type
            <select value={hold.reason} onChange={e=>setHold(s=>({...s,reason:e.target.value as typeof s.reason}))}>
              <option>Unavailable</option><option>Personal time</option><option>Travel hold</option>
            </select>
          </label>
        </div>
        <p className="fsa-hold-disclosure">This creates a shared availability record, not an external Outlook or Google appointment.</p>
        {holdError&&<p className="fsa-hold-error" role="alert">{holdError}</p>}
        <footer><button type="button" disabled={holdBusy} onClick={()=>setHoldOpen(false)}>Cancel</button>
          <button className="fsa-hold-primary" type="submit" disabled={holdBusy||ctx.identity!=='member'}>
            {holdBusy?'Saving…':'Save shared time block'}
          </button>
        </footer>
      </form>
    </div>}
    {daySheetOpen&&calendarView==='month'&&
      <div className="ios-calendar-backdrop" onMouseDown={event=>{
        if(event.target===event.currentTarget)setDaySheetOpen(false);
      }}>
        <section className="ios-calendar-day-sheet" ref={daySheetRef}
          role="dialog" aria-modal="true" aria-label={'Calendar activity for '+selectedDay}>
          <button type="button" className="ios-sheet-grab" aria-label="Dismiss day details"
            onTouchStart={event=>{sheetTouchY.current=event.touches[0]?.clientY??null;}}
            onTouchEnd={event=>{
              if(sheetTouchY.current!==null&&(event.changedTouches[0]?.clientY??0)-sheetTouchY.current>55)
                setDaySheetOpen(false);
              sheetTouchY.current=null;
            }} onClick={()=>setDaySheetOpen(false)}><span aria-hidden="true"/></button>
          <header className="ios-calendar-sheet-header">
            <div><span>SELECTED DAY</span>
              <h2>{dateLabel(selectedDay,{weekday:'long',month:'long',day:'numeric'})}</h2>
              <p>{selected.length} scheduled event{selected.length===1?'':'s'}</p>
            </div>
            <button type="button" className="ios-calendar-sheet-close"
              onClick={()=>setDaySheetOpen(false)} aria-label="Close calendar day"><X size={20}/></button>
          </header>
          <div className="ios-calendar-sheet-content">
            {conflictDays.has(selectedDay)&&<div className="ios-calendar-warnings">
              <CircleAlert size={18}/>
              <div><strong>Schedule needs review</strong>
                {(conflictDays.get(selectedDay)||[]).map(issue=><p key={issue}>{issue}</p>)}
              </div>
            </div>}
            {selected.length?selected.map(e=>
              <button type="button" key={e.id} className="ios-calendar-event-row"
                onClick={()=>{
                  setDaySheetOpen(false);
                  if(e.type==='visit')ctx.open('visit',e.record);
                   else if(e.type==='availability')ctx.go('coordinate');
                   else ctx.go('trips');
                }}>
                <span className={e.type==='trip'?'is-trip':'is-visit'}>
                  {e.type==='trip'?<CalendarDays size={19}/>:e.type==='availability'?<Clock3 size={19}/>:<CheckCircle2 size={19}/>}
                </span>
                <span><strong>{e.label}</strong>
                  <small>{e.trainer||'Trainer not assigned'} · {e.type==='visit'?
                    e.record.stateCode||'Region not set':e.type==='availability'?'Shared time block':'Multi-day field trip'}</small>
                </span>
                <ArrowRight size={17}/>
              </button>
            ):<div className="ios-calendar-empty-day">
              <Clock3 size={26}/><strong>No events on this day</strong>
              <p>{managers.length?'Schedule a manager visit from this date.':
                'Create a time block before a coaching manager has been added.'}</p>
            </div>}
          </div>
          <footer className="ios-calendar-sheet-footer">
            <button type="button"
              onClick={()=>{
                setDaySheetOpen(false);
                if(managers.length)ctx.open('visit');
                else openHold();
              }}
              disabled={ctx.identity!=='member'}>
              <Plus size={17}/>{managers.length?'New coaching visit':'Block trainer time'}
            </button>
          </footer>
        </section>
      </div>}
  </>;
}
