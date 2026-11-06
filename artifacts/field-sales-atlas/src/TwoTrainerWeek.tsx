
import { ArrowRight,CalendarDays,CircleAlert,Clock3,MapPin,Plane,Sparkles } from 'lucide-react';
import { useMemo,useState } from 'react';
import { CANADA_REGION_BY_CODE } from './CanadaRegions';
import { sequenceCircuit } from './fieldExperience';
import { useOp } from './Operations';
import type { Manager } from './opsModels';
import { STATES,coachingPriority,dateLabel,today } from './opsModels';
import './TwoTrainerWeek.css';

type Region={code:string;name:string;country:'US'|'CA'};
type Props={
  onDestination:(region:Region,manager?:Manager)=>void;
  onCircuit:(region:Region,managers:Manager[],departDate:string,returnDate:string)=>void;
};
function monday(value:string){
  const date=new Date(value+'T12:00:00Z');
  if(Number.isNaN(date.getTime()))return today();
  const days=(date.getUTCDay()+6)%7;
  date.setUTCDate(date.getUTCDate()-days);
  return date.toISOString().slice(0,10);
}
function addDay(value:string,days:number){
  const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
const regionFor=(code:string):Region|null=>{
  const ca=CANADA_REGION_BY_CODE[code],us=STATES.find(s=>s.code===code);
  return ca?{code:ca.code,name:ca.name,country:'CA'}:us?{code:us.code,name:us.name,country:'US'}:null;
};
export default function TwoTrainerWeek({onDestination,onCircuit}:Props){
  const ctx=useOp();
  const [week,setWeek]=useState(()=>monday(today()));
  const [showAll,setShowAll]=useState(false);
  const visits=ctx.board.visits||[];
  const managers=ctx.board.managers||[];
  const trips=ctx.board.trips||[];
  const coaching=ctx.board.coaching||[];
  const assignments=ctx.board.assignments||[];
  const last=addDay(week,6);
  const thisWeekVisits=visits.filter(v=>['Planned','Rescheduled'].includes(v.status)&&v.date>=week&&v.date<=last);
  const thisWeekTrips=trips.filter(t=>t.status==='Planned'&&t.startDate<=last&&t.endDate>=week);
  const assignmentsFor=(manager:Manager)=>manager.baseState||assignments.find(a=>a.managerId===manager.id)?.stateCode||'';
  const prioritized=useMemo(()=>managers.map(m=>({
    manager:m,
    priority:coachingPriority(m,visits,coaching),
    stateCode:assignmentsFor(m),
    scheduled:thisWeekVisits.some(v=>v.managerId===m.id)
  })).sort((a,b)=>b.priority.score-a.priority.score),[managers,visits,coaching,assignments,week]);
  const warnings=useMemo(()=>{
    const entries:Array<{trainer:string;date:string;details:string}>=[];
    for(const profile of ctx.trainerProfiles){
      const tv=thisWeekVisits.filter(v=>v.trainer===profile.name);
      const byDay=new Map<string,Set<string>>();
      for(const visit of tv){
        const set=byDay.get(visit.date)||new Set<string>();
        set.add(visit.stateCode);byDay.set(visit.date,set);
      }
      for(const [date,states] of byDay){
        if(states.size>1)entries.push({trainer:profile.name,date,details:'Coaching visits are scheduled in '+[...states].join(' and ')+' on the same day.'});
      }
      const pt=thisWeekTrips.filter(t=>t.trainer===profile.name);
      for(let i=0;i<pt.length;i++)for(let j=i+1;j<pt.length;j++){
        if(pt[i].startDate<=pt[j].endDate&&pt[i].endDate>=pt[j].startDate)
          entries.push({trainer:profile.name,date:pt[j].startDate,details:'Two field trips overlap. Review both itineraries.'});
      }
    }
    return entries;
  },[thisWeekVisits,thisWeekTrips,ctx.trainerProfiles]);
  const clusters=useMemo(()=>{
    const grouped=new Map<string,{name:string;state:string;trainer:string;people:typeof prioritized;priority:number}>();
    for(const row of prioritized){
      if(row.scheduled||!row.stateCode)continue;
      const key=row.manager.trainer+'-'+row.stateCode;
      const r=regionFor(row.stateCode);
      if(!r)continue;
      const group=grouped.get(key)||{name:r.name,state:row.stateCode,trainer:row.manager.trainer,people:[],priority:0};
      group.people.push(row);group.priority+=row.priority.score;
      grouped.set(key,group);
    }
    return [...grouped.values()].sort((a,b)=>b.priority-a.priority||b.people.length-a.people.length);
  },[prioritized]);
  function plan(manager:Manager){
    const region=regionFor(assignmentsFor(manager));
    if(!region){ctx.open('manager',manager);return;}
    const index=ctx.trainerProfiles.findIndex(p=>p.name===manager.trainer);
    if(index>=0)ctx.setActiveTrainerId(ctx.trainerProfiles[index].id);
    onDestination(region,manager);
  }
  function planCluster(state:string,trainerName:string,people:typeof prioritized){
    const region=regionFor(state);
    if(!region||!people.length)return;
    const profile=ctx.trainerProfiles.find(p=>p.name===trainerName);
    if(profile)ctx.setActiveTrainerId(profile.id);
    onCircuit(region,sequenceCircuit(people.map(person=>person.manager)).people,week,last);
  }
  return <div className="mv-week-page">
    <header className="mv-week-header atlas-editorial-head">
      <div><div className="mv-week-eyebrow"><Sparkles size={17}/> DUAL-TRAINER PLANNING</div>
        <h1>Our week</h1>
        <p>Coordinate both trainers, see what's already booked, and identify coaching visits worth grouping.</p>
      </div>
      <div className="mv-week-range">
        <label>Week beginning<input type="date" value={week} onChange={e=>setWeek(monday(e.target.value))}/></label>
        <small>{dateLabel(week,{month:'long',day:'numeric'})} – {dateLabel(last,{month:'short',day:'numeric',year:'numeric'})}</small>
        <button className="mv-week-calendar" onClick={()=>ctx.go('calendar')}><CalendarDays size={16}/> Open calendar</button>
      </div>
    </header>
    <div className="mv-week-overview">
      <div><strong>{thisWeekVisits.length}</strong><span>Planned coaching visits</span></div>
      <div><strong>{thisWeekTrips.length}</strong><span>Existing trips</span></div>
      <div><strong>{new Set(thisWeekVisits.map(v=>v.stateCode)).size}</strong><span>Destinations on the calendar</span></div>
      <div><strong>{warnings.length}</strong><span>Schedule items to review</span></div>
    </div>
    <div className="mv-week-trainers">
      {ctx.trainerProfiles.map((profile,i)=>{
        const ownVisits=thisWeekVisits.filter(v=>v.trainer===profile.name);
        const ownTrips=thisWeekTrips.filter(t=>t.trainer===profile.name);
        const candidates=prioritized.filter(r=>r.manager.trainer===profile.name);
        const unscheduled=candidates.filter(r=>!r.scheduled);
        return <section className={'mv-week-trainer mv-week-trainer-'+i} key={profile.id}>
          <div className="mv-week-trainer-head">
            <span className="mv-week-trainer-dot"/>
            <div><strong>{profile.name}</strong><small>{profile.homeCity||'Home city not configured'} · {profile.homeAirports.join(' / ')||'No home airport saved'}</small></div>
            <button onClick={()=>{ctx.setActiveTrainerId(profile.id);ctx.openTrainers();}}>Edit airports</button>
          </div>
          <div className="mv-week-trainer-summary">
            <span><CalendarDays size={16}/>{ownVisits.length} visits scheduled</span>
            <span><Plane size={16}/>{ownTrips.length} trips planned</span>
          </div>
          <div className="mv-week-subheading"><strong>Coaching opportunities</strong><span>{unscheduled.length} not yet scheduled</span></div>
          {unscheduled.length?unscheduled.slice(0,showAll?20:4).map(({manager,priority,stateCode})=><div className="mv-week-person" key={manager.id}>
            <div><strong>{manager.name}</strong><small><MapPin size={13}/>{[manager.baseCity,stateCode].filter(Boolean).join(', ')||'Base location incomplete'}
              <span className={'mv-week-priority '+priority.level.toLowerCase()}>{priority.level}</span></small></div>
            <button onClick={()=>plan(manager)}>Plan visit <ArrowRight size={14}/></button>
          </div>):<div className="mv-week-empty">
            {candidates.length?'Every assigned manager already has a visit planned for this week.':'No managers assigned to this trainer yet.'}
            {!candidates.length&&<button onClick={()=>ctx.open('manager')}>Add manager</button>}
          </div>}
          {unscheduled.length>4&&<button className="mv-week-show" onClick={()=>setShowAll(!showAll)}>{showAll?'Show fewer':'Show '+(unscheduled.length-4)+' more managers'}</button>}
          <div className="mv-week-trainer-foot">Priorities are derived from recorded coaching activity and visit cadence, not sales performance assumptions.</div>
        </section>;
      })}
    </div>
    <div className="mv-week-lower">
      <section className="mv-week-clusters">
        <div className="mv-week-section-head"><h2>Suggested regional coaching circuits</h2><p>Group nearby manager visits before searching flights. Actual travel times and airline availability still require confirmation.</p></div>
        {clusters.length?clusters.slice(0,7).map(group=>{
          const sequence=sequenceCircuit(group.people.map(person=>person.manager));
          return <div className="mv-week-cluster" key={group.trainer+group.state}>
            <span><MapPin size={18}/></span>
            <div><strong>{group.name}</strong>
              <small>{group.trainer} · {group.people.length} manager{group.people.length===1?'':'s'} without a visit this week</small>
              <small className="fsa-circuit-note">{sequence.straightLineMiles!==null?
                'Suggested stop sequence · '+sequence.straightLineMiles+' straight-line miles'+(sequence.unmapped?' · '+sequence.unmapped+' unmapped':'')+' · verify drive':
                'Add manager coordinates for suggested stop ordering'}</small>
            </div>
            <button onClick={()=>planCluster(group.state,group.trainer,group.people)}>Plan circuit <ArrowRight size={15}/></button>
          </div>;
        }):<div className="mv-week-empty">Regional groupings will appear after managers are assigned and their locations are entered.</div>}
      </section>
      <section className="mv-week-safety">
        <div className="mv-week-section-head"><h2>Shared schedule review</h2><p>Conflicts are based on your saved travel and coaching records.</p></div>
        {warnings.length?warnings.map((w,i)=><div className="mv-week-warning" key={i}>
          <CircleAlert size={17}/><div><strong>{w.trainer} · {dateLabel(w.date)}</strong><span>{w.details}</span></div>
        </div>):<div className="mv-week-clear"><Clock3 size={22}/><strong>No obvious schedule conflicts</strong><p>That doesn't verify appointment availability, flights, or road travel. Review those before finalizing visits.</p></div>}
        <button className="mv-week-review" onClick={()=>ctx.go('calendar')}>Review team calendar <ArrowRight size={16}/></button>
      </section>
    </div>
  </div>;
}
