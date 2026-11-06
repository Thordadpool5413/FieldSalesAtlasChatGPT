import type { LucideIcon } from 'lucide-react';
import {
ArrowRight,CalendarCheck2,ClipboardCheck,Compass,MapPinned,
PlaneTakeoff,Route,Sparkles,UsersRound
} from 'lucide-react';
import { useMemo } from 'react';
import './FieldCompass.css';
import type { Page } from './Operations';
import { useOp } from './Operations';
import { coachingPriority,dateLabel,today } from './opsModels';

type Props = { variant: 'rail' | 'mobile' };
type Shortcut = { page: Page; label: string; icon: LucideIcon };

const toolRoutes: Record<string,Shortcut[]> = {
  travel: [
    { page:'radar',label:'Flight DNA',icon:PlaneTakeoff },
    { page:'coordinate',label:'Coordinate',icon:Route },
    { page:'calendar',label:'Calendar',icon:CalendarCheck2 }
  ],
  people: [
    { page:'coaching',label:'Coaching desk',icon:ClipboardCheck },
    { page:'map',label:'Territories',icon:MapPinned },
    { page:'calendar',label:'Calendar',icon:CalendarCheck2 }
  ],
  calendar: [
    { page:'people',label:'People',icon:UsersRound },
    { page:'coordinate',label:'Coordinate',icon:Route },
    { page:'plan',label:'Travel',icon:PlaneTakeoff }
  ],
  other: [
    { page:'home',label:'Atlas',icon:Compass },
    { page:'coordinate',label:'Coordinate',icon:Route },
    { page:'overview',label:'Reports',icon:MapPinned }
  ]
};

export default function FieldCompass({ variant }: Props) {
  const ctx=useOp();
  const { board,activeTrainer,view,identity }=ctx;
  const managers=board.managers||[];
  const visits=board.visits||[];
  const notes=board.coaching||[];
  const trips=board.trips||[];
  const now=today();

  const signal=useMemo(()=>{
    const mine=managers.filter(p=>p.trainer===activeTrainer.name && p.coachingStatus!=='Paused');
    const ids=new Set(mine.map(p=>p.id));
    const focus=mine.map(p=>({p,r:coachingPriority(p,visits,notes)}))
      .filter(v=>v.r.level!=='Routine').sort((a,b)=>b.r.score-a.r.score);
    const next=visits.filter(v=>
      (v.status==='Planned'||v.status==='Rescheduled')&&v.date>=now &&
      (v.trainer===activeTrainer.name||(!v.trainer&&ids.has(v.managerId)))
    ).sort((a,b)=>a.date.localeCompare(b.date))[0];
    const overdue=notes.filter(n=>n.status==='Open'&&n.dueDate&&n.dueDate<now&&
      (n.trainer===activeTrainer.name||(!n.trainer&&ids.has(n.managerId)))).length;
    return {focus:focus[0]?.p,focusCount:focus.length,next,overdue};
  },[managers,visits,notes,activeTrainer.name,now]);

  const hasTrip=trips.some(t=>t.trainer===activeTrainer.name&&
    t.status==='Planned'&&t.endDate>=now);
  const nextManager=signal.next?managers.find(m=>m.id===signal.next.managerId):undefined;
  const isTravel=['plan','air','radar','booked','trips','week','coordinate'].includes(view);
  const isPeople=['people','managers','coaching'].includes(view);

  let heading='One team. One connected field.';
  let explanation='Your next decision starts with the people and places in your workspace.';
  let action='Explore Atlas';
  let perform=()=>ctx.go('home');

  if(isTravel){
    heading=hasTrip?'Make the next trip count.':'Plan the mission, not just the flight.';
    explanation='Connect coaching needs, arrival airports and both trainers’ schedules.';
    action='Coordinate travel';perform=()=>ctx.go('coordinate');
  }else if(isPeople){
    if(signal.focus){
      heading=signal.focus.name+' needs your attention.';
      explanation=signal.focusCount+' saved coaching priorit'+(signal.focusCount===1?'y':'ies')+' for '+activeTrainer.name+'.';
      action='Review manager';
      perform=()=>{ctx.setSelectedManager(signal.focus!.id);ctx.go('managers');};
    }else if(!managers.length){
      heading='Start with one great manager.';
      explanation='Add a person to connect territory ownership, coaching and travel.';
      action=identity==='member'?'Add manager':'Open People';
      perform=()=>identity==='member'?ctx.open('manager'):ctx.go('people');
    }else{
      heading='Turn observations into progress.';
      explanation='Your manager profiles are ready for coaching follow-through.';
      action='Coaching desk';perform=()=>ctx.go('coaching');
    }
  }else if(view==='calendar'){
    if(signal.next){
      heading=nextManager?.name||'Your next coaching visit';
      explanation='Scheduled '+dateLabel(signal.next.date,{month:'short',day:'numeric'})+
        ' in saved records. Confirm travel before you go.';
      action=identity==='member'?'Review visit':'View calendar';
      perform=()=>identity==='member'?ctx.open('visit',signal.next):ctx.go('calendar');
    }else{
      heading='Make room for your next field visit.';
      explanation='No future visit is saved for this trainer.';
      action=identity==='member'?(managers.length?'Plan a visit':'Add manager'):'Open People';
      perform=()=>identity==='member'?ctx.open(managers.length?'visit':'manager'):ctx.go('people');
    }
  }else if(view==='mission'){
    heading=signal.overdue
      ?signal.overdue+' overdue follow-up'+(signal.overdue===1?'':'s')+' need review.'
      :'See the entire field. Act on what matters.';
    explanation='A shared view of coaching, territory coverage and travel commitments.';
    action=signal.overdue?'Coaching desk':'Explore Atlas';
    perform=()=>ctx.go(signal.overdue?'coaching':'home');
  }else if(view==='overview'){
    heading='Turn coverage into decisions.';
    explanation='Understand where managers, visits and coaching priorities overlap.';
    action='Open Atlas';perform=()=>ctx.go('home');
  }else if(view==='map'){
    heading='Your territories. Your next move.';
    explanation='Go from a selected region to the full geographic command map.';
    action='Explore Atlas';perform=()=>ctx.go('home');
  }else if(view==='data'||view==='team'){
    heading='Know where your field data comes from.';
    explanation='Use saved records, exports and recovery before making decisions.';
    action='Open reports';perform=()=>ctx.go('overview');
  }

  const routes=isTravel?toolRoutes.travel:isPeople?toolRoutes.people:
    view==='calendar'?toolRoutes.calendar:toolRoutes.other;
  return <section className={'fsa-field-compass fsa-field-compass--'+variant}
    aria-label='Contextual field actions'>
    <div className='fsa-field-compass-orbit' aria-hidden='true'><Compass size={22}/></div>
    <div className='fsa-field-compass-copy'>
      <span className='fsa-field-compass-kicker'><i/> YOUR NEXT MOVE</span>
      <strong>{heading}</strong>
      <p>{explanation}</p>
      {variant==='rail'&&<small>{board.truncated?'Partial workspace data':'Based on saved field records'}</small>}
    </div>
    <button type='button' className='fsa-field-compass-action' onClick={perform}>
      <span>{action}</span><ArrowRight size={17}/>
    </button>
    <nav className='fsa-field-compass-shortcuts' aria-label='Related tools'>
      {routes.map(item=>{
        const Icon=item.icon;
        return <button type='button' key={item.page} onClick={()=>ctx.go(item.page)}>
          <Icon size={16}/><span>{item.label}</span>
        </button>;
      })}
    </nav>
    {variant==='mobile'&&<small className='fsa-field-compass-note'>
      <Sparkles size={12}/>
      {board.truncated?'Partial workspace data':'Based on saved records · External calendars not verified'}
    </small>}
  </section>;
}
