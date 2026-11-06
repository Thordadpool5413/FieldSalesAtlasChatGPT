import { ArrowLeft,CalendarDays,ClipboardCheck,PlaneTakeoff,Radar,Route,TicketCheck,Users,Waypoints } from 'lucide-react';
import { lazy,Suspense } from 'react';
import { TripsPage } from './OperationsTrip';
import { CoachingPage,ManagersPage } from './OperationsViews';
import type { Manager } from './opsModels';
import TravelStart from './TravelStart';
const TripPlanningExperience = lazy(() => import('./TripPlanningExperience'));
const TwoTrainerWeek = lazy(() => import('./TwoTrainerWeek'));
const TrainerCoordination = lazy(() => import('./TrainerCoordination'));
const FlightRadar = lazy(() => import('./FlightRadar'));
const FlightGuardian = lazy(() => import('./FlightGuardian'));

type Region = { code:string; name:string; country:'US'|'CA' };
type Tab = 'start'|'week'|'coordinate'|'travel'|'radar'|'booked'|'trips';
type Props = {
  section:Tab;
  onSectionChange:(section:Tab)=>void;
  onDestination:(region:Region,manager?:Manager)=>void;
  onCircuit:(region:Region,people:Manager[],departDate:string,returnDate:string)=>void;
};

export default function PlanHub({section,onSectionChange,onDestination,onCircuit}:Props){
  const sections=[
    {id:'start' as const,label:'Home',icon:Route,detail:'Simple travel overview'},
    {id:'radar' as const,label:'Flight DNA',icon:Radar,detail:'Free flight intelligence'},
    {id:'booked' as const,label:'Booked Flights',icon:TicketCheck,detail:'Import and protect your itinerary'},
    {id:'travel' as const,label:'Plan Travel',icon:PlaneTakeoff,detail:'Compare airport options'},
    {id:'trips' as const,label:'Itineraries',icon:Route,detail:'Review saved trips'},
    {id:'week' as const,label:'Our Week',icon:CalendarDays,detail:'Weekly overview'},
    {id:'coordinate' as const,label:'Coordinate',icon:Waypoints,detail:'Resolve and divide work'},
  ];
  return <section className={'fsa-hub fsa-plan-hub'+(section==='radar'?' fs-flight-focused':'')+(section==='start'?' fsa-plan-home':'')} aria-label='Field planning'>
    {section!=='start'&&<header className='fsa-hub-head fsa-hub-head-compact atlas-hub-banner'>
      <div className='atlas-hub-lead'><span className='atlas-hub-icon'><Route size={18}/></span>
        <div><p className='fsa-kicker'>{section==='radar'?'FIELD SALES ATLAS / TRAVEL INTELLIGENCE':'FIELD SALES ATLAS / TRAVEL'}</p>
        <p className='fsa-hub-guide'>{section==='radar'?'Free FAA, NOAA and historical flight research. No manager or booking required.':'Review your trip plans, itineraries and shared trainer schedules'}</p></div>
      </div><span className='atlas-hub-online'>{section==='radar'?'PUBLIC SOURCES · NO BOOKING':'SHARED TRAVEL PLANNING'}</span>
    </header>}
    {section!=='start'&&<div className='atlas-mobile-tool-switch'>
      <button type='button' className='atlas-tool-back' onClick={()=>onSectionChange('start')}>
        <ArrowLeft size={16}/> Travel
      </button>
      <label>
        <span className='sr-only'>Travel tool</span>
        <select value={section} aria-label='Choose travel tool'
          onChange={event=>onSectionChange(event.target.value as Tab)}>
          {sections.filter(item=>item.id!=='start').map(item=>
            <option value={item.id} key={item.id}>{item.label}</option>)}
        </select>
      </label>
    </div>}
    {section!=='start'&&<div className='fsa-hub-tabs' role='tablist' aria-label='Planning tools'>
      {sections.map(item=>{
        const Icon=item.icon;
        return <button type='button' role='tab' aria-selected={section===item.id} key={item.id}
          className={section===item.id?'is-active':''}
          onClick={()=>{
            onSectionChange(item.id);
          }} onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();const i=sections.findIndex(s=>s.id===section);const next=(i+(event.key==='ArrowRight'?1:-1)+sections.length)%sections.length;onSectionChange(sections[next].id);event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')[next]?.focus();}}}>
          <Icon size={20}/><span><strong>{item.label}</strong><small>{item.detail}</small></span>
        </button>;
      })}
    </div>}
    <div className='fsa-hub-body' role='tabpanel'>
      {section==='start'&&<TravelStart onSectionChange={onSectionChange} onDestination={onDestination} onCircuit={onCircuit}/>}
      <Suspense fallback={<div className='atlas-screen-loading' role='status'>Opening travel tools…</div>}>
      {section==='week'&&<>
        <div className='coord-entry'><span><Waypoints size={19}/> Detect conflicts, uncovered coaching and better trainer assignments</span>
          <button type='button' onClick={()=>onSectionChange('coordinate')}>Open coordination engine <Route size={16}/></button></div>
        <TwoTrainerWeek onDestination={onDestination} onCircuit={onCircuit}/>
      </>}
      {section==='coordinate'&&<TrainerCoordination onDestination={onDestination} onCircuit={onCircuit}/>}
      {section==='travel'&&<TripPlanningExperience/>}
      {section==='radar'&&<FlightRadar onToolChange={onSectionChange}/>}
      {section==='booked'&&<Suspense fallback={<div className='op-alert'>Opening your flight importer…</div>}>
        <FlightGuardian onResearch={()=>onSectionChange('radar')}
          onCoordinate={()=>onSectionChange('coordinate')}/>
      </Suspense>}
      {section==='trips'&&<TripsPage/>}
      </Suspense>
    </div>
    {section!=='start'&&<p className='fsa-provenance'>Travel intelligence uses free public sources and saved planning records. It does not sell, reserve, or book flights. Always verify flight-specific details directly with your airline.</p>}
  </section>;
}

export function PeopleHub({section,onSectionChange}:{section:'managers'|'coaching';onSectionChange:(next:'managers'|'coaching')=>void}){
  return <section className='fsa-hub fsa-people-hub' aria-label='People and coaching'>
    <header className='fsa-hub-head fsa-hub-head-compact atlas-hub-banner'>
      <div className='atlas-hub-lead'><span className='atlas-hub-icon atlas-hub-icon-pink'><Users size={18}/></span>
        <div><p className='fsa-kicker'>FIELD SALES ATLAS / PEOPLE</p>
        <p className='fsa-hub-guide'>Your managers, coaching priorities and follow-through</p></div>
      </div><span className='atlas-hub-online'>SHARED TEAM</span>
    </header>
    <div className='fsa-hub-tabs' role='tablist' aria-label='People sections'>
      <button type='button' role='tab' aria-selected={section==='managers'} className={section==='managers'?'is-active':''}
        onClick={()=>onSectionChange('managers')} onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();onSectionChange('coaching');event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')[1]?.focus();}}}><Users size={20}/><span><strong>Territory Managers</strong><small>People, assignments and profiles</small></span></button>
      <button type='button' role='tab' aria-selected={section==='coaching'} className={section==='coaching'?'is-active':''}
        onClick={()=>onSectionChange('coaching')} onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();onSectionChange('managers');event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')[0]?.focus();}}}><ClipboardCheck size={20}/><span><strong>Coaching</strong><small>Observations and commitments</small></span></button>
    </div>
    <div className='fsa-hub-body' role='tabpanel'>
      {section==='managers'&&<ManagersPage/>}
      {section==='coaching'&&<CoachingPage/>}
    </div>
  </section>;
}
