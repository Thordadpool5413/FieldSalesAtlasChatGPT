import {
Activity,ArrowRight,CalendarDays,CalendarRange,Check,ChevronLeft,ChevronRight,
CircleAlert,ClipboardCheck,Compass,MapPin,Plane,RefreshCw,Route,
ShieldAlert,Sparkles,
UserRoundCog,
Users
} from 'lucide-react';
import { useMemo,useState } from 'react';
import { CANADA_REGION_BY_CODE } from './CanadaRegions';
import type { ProposedAction } from './CoordinationLogic';
import {
buildCoordination,shiftDate,weekBeginning
} from './CoordinationLogic';
import { useOp } from './Operations';
import type { Manager } from './opsModels';
import { STATES,dateLabel,today } from './opsModels';
import './TrainerCoordination.css';
import { api } from './workspaceApi';

type Region = { code: string; name: string; country: 'US' | 'CA' };
type Props = {
  onDestination: (region: Region, manager?: Manager) => void;
  onCircuit: (region: Region, people: Manager[], departDate: string, returnDate: string) => void;
};
function regionFor(code: string): Region | null {
  const ca = CANADA_REGION_BY_CODE[code];
  const us = STATES.find(item => item.code === code);
  return ca ? { code: ca.code, name: ca.name, country: 'CA' } :
    us ? { code: us.code, name: us.name, country: 'US' } : null;
}
function labelDay(value: string) {
  return dateLabel(value, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function TrainerCoordination({ onDestination, onCircuit }: Props) {
  const ctx = useOp();
  const [week, setWeek] = useState(() => weekBeginning(today()));
  const [showAll, setShowAll] = useState(false);
  const [issuesExpanded, setIssuesExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [availabilityBusy,setAvailabilityBusy]=useState(false);
  const [availabilityMessage,setAvailabilityMessage]=useState('');
  const [availabilityDraft,setAvailabilityDraft]=useState({
    trainerId:ctx.activeTrainerId as 'trainer_a'|'trainer_b',
    startDate:today(),endDate:today(),
    reason:'Unavailable' as 'Unavailable'|'Personal time'|'Travel hold'
  });
  const snapshot = useMemo(() =>
    buildCoordination(ctx.board, ctx.trainerProfiles, week),
    [ctx.board, ctx.trainerProfiles, week]
  );
  const isReady = ctx.identity === 'member';
  const { loads, issues, needs, proposals, circuits, start, end, canPlan } = snapshot;
  const handoffs = proposals.filter(row => row.handoff);
  const displayProposals = showAll ? proposals : proposals.slice(0, 5);
  const visibleIssues = issuesExpanded ? issues : issues.slice(0, 4);

  function prepareVisit(action: ProposedAction) {
    if (!isReady || !action.date) return;
    ctx.setActiveTrainerId(action.trainer.id);
    ctx.setState(action.stateCode);
    const detail = new URLSearchParams({
      managerId: action.manager.id,
      trainer: action.trainer.name,
      stateCode: action.stateCode,
      date: action.date
    }).toString();
    ctx.open('visit', undefined, detail);
  }
  function planRoute(action: ProposedAction) {
    const region = regionFor(action.stateCode);
    if (!region) {
      ctx.open('manager', action.manager);
      return;
    }
    ctx.setActiveTrainerId(action.trainer.id);
    onDestination(region, action.manager);
  }
  function circuit(regionCode: string, group: typeof circuits[number]['groups'][number]) {
    const region = regionFor(regionCode);
    if (!region || !group.people.length || !canPlan) return;
    ctx.setActiveTrainerId(group.trainer.id);
    onCircuit(region, group.people.map(row => row.manager), start, shiftDate(start, 4));
  }
  async function saveUnavailable(){
    if(availabilityBusy||!isReady)return;
    setAvailabilityMessage('');
    if(!availabilityDraft.startDate||!availabilityDraft.endDate||
      availabilityDraft.startDate>availabilityDraft.endDate){
      setAvailabilityMessage('Choose a valid start and end date.');return;
    }
    setAvailabilityBusy(true);
    try{
      await api.post('/api/trainer-availability',{
        id:crypto.randomUUID(),...availabilityDraft,notes:''
      });
      await ctx.reload();
      setAvailabilityMessage('Trainer availability saved and shared.');
    }catch(err){setAvailabilityMessage(err instanceof Error?err.message:'Could not save availability.');}
    finally{setAvailabilityBusy(false);}
  }
  async function removeUnavailable(id:string){
    if(availabilityBusy||!isReady)return;
    setAvailabilityBusy(true);setAvailabilityMessage('');
    try{
      await api.delete('/api/trainer-availability/'+encodeURIComponent(id));
      await ctx.reload();
      setAvailabilityMessage('Availability entry removed.');
    }catch(err){setAvailabilityMessage(err instanceof Error?err.message:'Could not remove availability.');}
    finally{setAvailabilityBusy(false);}
  }
  async function refresh() {
    if (!isReady || busy) return;
    setBusy(true);
    try {
      await ctx.reload();
      ctx.setNotice('Shared coordination records refreshed.');
    } catch (error) {
      ctx.setError(error instanceof Error ? error.message : 'Shared records could not be refreshed.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="coord-page" aria-label="Two-trainer coordination intelligence">
    <header className="coord-hero">
      <div className="coord-hero-copy">
        <span className="coord-kicker"><Sparkles size={16}/> FIELD COORDINATION INTELLIGENCE</span>
        <h1>Two trainers. <span>One better plan.</span></h1>
        <p>Spot competing travel, unattended coaching needs and the smartest division
          of field coverage, using your team's saved plans.</p>
        <div className="coord-hero-tags">
          <span><Check size={15}/> Based on saved records</span>
          <span><Users size={15}/> Both trainer seats</span>
        </div>
      </div>
      <div className="coord-week-control">
        <label htmlFor="coord-week">Planning week</label>
        <div className="coord-week-switch">
          <button type="button" aria-label="Previous week"
            onClick={() => setWeek(shiftDate(week, -7))}><ChevronLeft size={18}/></button>
          <input id="coord-week" type="date" value={week}
            onChange={event => event.target.value && setWeek(weekBeginning(event.target.value))}/>
          <button type="button" aria-label="Next week"
            onClick={() => setWeek(shiftDate(week, 7))}><ChevronRight size={18}/></button>
        </div>
        <span>{dateLabel(start, {month:'short',day:'numeric'})} to {dateLabel(end, {month:'short',day:'numeric',year:'numeric'})}</span>
        <button type="button" className="coord-refresh" onClick={refresh} disabled={!isReady || busy}>
          <RefreshCw size={15}/>{busy ? 'Refreshing…' : 'Refresh shared records'}
        </button>
      </div>
    </header>

    {ctx.board.truncated && <div className="coord-warning" role="alert">
      <ShieldAlert size={19}/> Some shared records were omitted from the current data page.
      Recommendations and conflict counts may be incomplete.
    </div>}
    {!canPlan && <div className="coord-warning">
      <CalendarDays size={18}/> This week is in the past. Review past records or move to a future week to plan visits.
    </div>}

    <div className="coord-metrics">
      <div><span className="coord-stat-icon alert"><CircleAlert size={18}/></span>
        <strong>{issues.length}</strong><span>Schedule items to review</span></div>
      <div><span className="coord-stat-icon focus"><ClipboardCheck size={18}/></span>
        <strong>{needs.length}</strong><span>Coaching or ownership gaps</span></div>
      <div><span className="coord-stat-icon handoff"><Users size={18}/></span>
        <strong>{handoffs.length}</strong><span>Potential trainer handoffs</span></div>
      <div><span className="coord-stat-icon open"><CalendarRange size={18}/></span>
        <strong>{loads.reduce((sum, load) => sum + load.openDays, 0)}</strong>
        <span>Open trainer-days in saved plans</span></div>
    </div>

    <div className="coord-panel coord-availability">
      <div className="coord-section-head">
        <div><span className="coord-overline">CAPACITY SIGNAL</span>
          <h2>See where each trainer has room</h2>
          <p>Free-looking days mean no saved trip, visit or unavailable block.
            External meetings and travel times still need confirmation.</p></div>
        <button type="button" className="coord-text-button" onClick={() => ctx.go('calendar')}>
          Team calendar <ArrowRight size={16}/>
        </button>
      </div>
      <div className="coord-lanes">
        {loads.map((load, index) => <div className="coord-lane" key={load.profile.id}>
          <div className="coord-lane-header">
            <span className={'coord-trainer-dot coord-dot-' + index}/>
            <div><strong>{load.profile.name}</strong>
              <small>{load.visits.length} visit{load.visits.length === 1 ? '' : 's'} · {load.trips.length} trip{load.trips.length === 1 ? '' : 's'}</small></div>
            <span className="coord-open-chip">{load.openDays} open</span>
          </div>
          <div className="coord-days">
            {load.days.map(day => <button type="button" key={day.date} onClick={() => ctx.go('calendar')}
              className={'coord-day coord-day-' + day.status} title={labelDay(day.date) + ': ' +
                day.visits.length + ' visits, ' + day.trips.length + ' trips, ' +
                day.blocks.length + ' unavailable blocks'}
              aria-label={labelDay(day.date) + ', ' + day.visits.length + ' visits and ' + day.trips.length + ' trips'}>
              <span>{dateLabel(day.date, {weekday:'short'})}</span>
              <strong>{day.blocks.length?'Unavailable':
                day.visits.length ? day.visits.length + ' visit' + (day.visits.length === 1 ? '' : 's') :
                day.trips.length ? 'Travel' : day.date < today() ? 'Past' : 'Open'}</strong>
              {day.trips.length > 0 && day.visits.length > 0 &&
                <small>+ {day.trips.length} trip{day.trips.length === 1 ? '' : 's'}</small>}
            </button>)}
          </div>
        </div>)}
      </div>
      <div className="coord-unavailable-editor">
        <div>
          <span className="coord-overline">SHARED AVAILABILITY</span>
          <h3>Block unavailable days</h3>
          <p>Keep both trainers' recommendations realistic. Blocked days won't be suggested for visits.</p>
        </div>
        <div className="coord-unavailable-controls">
          <label>Trainer
            <select value={availabilityDraft.trainerId}
              onChange={e=>setAvailabilityDraft(d=>({...d,trainerId:e.target.value as 'trainer_a'|'trainer_b'}))}>
              {ctx.trainerProfiles.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label>From
            <input type="date" value={availabilityDraft.startDate}
              onChange={e=>setAvailabilityDraft(d=>({...d,startDate:e.target.value,
                endDate:d.endDate<e.target.value?e.target.value:d.endDate}))}/>
          </label>
          <label>To
            <input type="date" min={availabilityDraft.startDate} value={availabilityDraft.endDate}
              onChange={e=>setAvailabilityDraft(d=>({...d,endDate:e.target.value}))}/>
          </label>
          <label>Reason
            <select value={availabilityDraft.reason} onChange={e=>setAvailabilityDraft(d=>({
              ...d,reason:e.target.value as typeof d.reason
            }))}>
              <option>Unavailable</option><option>Personal time</option><option>Travel hold</option>
            </select>
          </label>
          <button type="button" disabled={!isReady||availabilityBusy} onClick={()=>void saveUnavailable()}>
            {availabilityBusy?'Saving…':'Block these days'}
          </button>
        </div>
        {availabilityMessage&&<p role="status" className="coord-data-note">{availabilityMessage}</p>}
        {(ctx.board.availability||[]).length>0&&<div className="coord-unavailable-saved">
          {(ctx.board.availability||[]).slice().sort((a,b)=>a.startDate.localeCompare(b.startDate))
            .slice(0,30).map(block=><div key={block.id}>
              <span><strong>{ctx.trainerProfiles.find(p=>p.id===block.trainerId)?.name||'Trainer'}</strong>
                {' · '+block.reason+' · '+dateLabel(block.startDate)+' to '+dateLabel(block.endDate)}</span>
              <button type="button" disabled={availabilityBusy} onClick={()=>void removeUnavailable(block.id)}
                aria-label={'Remove availability '+block.startDate}>Remove</button>
            </div>)}
        </div>}
      </div>
    </div>
    <section className="coord-panel coord-territory-inventory">
      <div className="coord-section-head">
        <div><span className="coord-overline">TERRITORY COVERAGE INVENTORY</span>
          <h2>What isn't mapped yet?</h2>
          <p>Unmapped regions are data gaps in this workspace, not proof that a territory is uncovered.</p>
        </div>
        <span className="coord-count">
          {[...new Set((ctx.board.assignments||[]).map(a=>a.stateCode).concat(
            (ctx.board.managers||[]).map(m=>m.baseState||'')).filter(Boolean))].length}
          {' '}mapped regions
        </span>
      </div>
      <div className="coord-unmapped">
        {STATES.filter(s=>!(ctx.board.assignments||[]).some(a=>a.stateCode===s.code)&&
          !(ctx.board.managers||[]).some(m=>m.baseState===s.code)).slice(0,16).map(s=>
          <span key={s.code}>{s.code} · {s.name}</span>)}
      </div>
      <p className="coord-data-note">First 16 U.S. states without a saved owner or manager record.
        Open People to map ownership. Missing records do not prove market absence.</p>
      <button type="button" className="coord-text-button" onClick={()=>ctx.go('people')}>
        Update territory ownership <ArrowRight size={16}/>
      </button>
    </section>

    <div className="coord-main-grid">
      <section className="coord-panel coord-recommendations">
        <div className="coord-section-head">
          <div><span className="coord-overline">RECOMMENDED NEXT MOVES</span>
            <h2>Who should cover what?</h2>
            <p>Suggestions weigh recorded coaching needs, manager ownership, existing trips and planning availability.</p>
          </div>
          <span className="coord-count">{proposals.length} proposals</span>
        </div>
        {!proposals.length && <div className="coord-empty">
          <Compass size={27}/>
          <strong>{needs.length ? 'Complete manager locations to generate options' : 'No unplanned priority coaching needs detected'}</strong>
          <p>{needs.length ? 'Assign a base state and trainer to improve the recommendation.' :
            'Add manager coaching goals and visit records to make this decision engine useful.'}</p>
          <button type="button" onClick={() => ctx.go('people')}>Review managers <ArrowRight size={16}/></button>
        </div>}
        <div className="coord-recommendation-list">
          {displayProposals.map(action => <article className="coord-recommendation" key={action.manager.id}>
            <div className="coord-rec-header">
              <div><span className="coord-priority">{action.priority.level} coaching priority</span>
                <h3>{action.manager.name}</h3>
                <small><MapPin size={14}/> {[action.manager.baseCity,action.stateCode].filter(Boolean).join(', ')}</small>
              </div>
              {action.handoff && <span className="coord-handoff-flag"><Users size={14}/> Consider handoff</span>}
            </div>
            <div className="coord-proposal">
              <span>Recommended trainer</span>
              <strong>{action.trainer.name}</strong>
              <small>{action.date ? labelDay(action.date) : 'No clear opening in saved plans'}</small>
            </div>
            <div className="coord-reason"><Activity size={16}/>
              <span>{action.reasons.slice(0, 2).join(' · ')}.
                {action.priority.reasons.length ? ' Coaching: ' + action.priority.reasons.slice(0, 1).join('; ') + '.' : ''}
              </span></div>
            {action.handoff && <p className="coord-owner">Current owner: {action.owner?.name}.
              This recommendation does not change ownership.</p>}
            {action.alreadyScheduledLater && <p className="coord-owner">
              Another visit is saved after this planning week. Check before scheduling an earlier one.
            </p>}
            <div className="coord-rec-actions">
              <button type="button" className="coord-primary" disabled={!isReady || !action.date}
                onClick={() => prepareVisit(action)}>Prepare visit <ArrowRight size={16}/></button>
              <button type="button" className="coord-secondary" onClick={() => planRoute(action)}>
                <Plane size={16}/> Travel options</button>
              {action.handoff && <button type="button" className="coord-secondary"
                onClick={() => ctx.open('manager', action.manager)}>
                Review ownership</button>}
            </div>
          </article>)}
        </div>
        {proposals.length > 5 && <button type="button" className="coord-show-more"
          onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show top five' : 'Show all ' + proposals.length + ' recommendations'}
          <ArrowRight size={16}/>
        </button>}
      </section>

      <section className="coord-panel coord-review">
        <div className="coord-section-head">
          <div><span className="coord-overline">RISK & DUPLICATION</span>
            <h2>Resolve the overlaps</h2>
            <p>Only real saved trips and visits contribute to these alerts.</p></div>
          <span className="coord-count">{issues.length}</span>
        </div>
        {!issues.length && <div className="coord-empty coord-empty-small">
          <Check size={25}/><strong>No overlapping items detected</strong>
          <p>That does not confirm airline availability, travel time or external appointments.</p>
        </div>}
        {visibleIssues.map(issue => <article className={'coord-issue coord-issue-' + issue.grade} key={issue.id}>
          <div><span className="coord-issue-grade">{issue.grade === 'critical' ? 'CONFLICT' : 'REVIEW'}</span>
            <span className="coord-issue-date">{labelDay(issue.date)}</span></div>
          <h3>{issue.title}</h3><p>{issue.detail}</p>
          <small>{issue.trainer || 'Trainer not assigned'}</small>
          <button type="button" onClick={() =>
            issue.visit ? ctx.open('visit', issue.visit) :
              issue.trip ? ctx.go('trips') : ctx.go('calendar')}>
            {issue.visit ? 'Edit affected visit' : issue.trip ? 'Review trips' : 'Open calendar'}
            <ArrowRight size={15}/></button>
        </article>)}
        {issues.length > 4 && <button type="button" className="coord-show-more"
          onClick={() => setIssuesExpanded(!issuesExpanded)}>
          {issuesExpanded ? 'Show fewer' : 'Review all ' + issues.length + ' items'} <ArrowRight size={16}/>
        </button>}
        <div className="coord-data-note"><ShieldAlert size={16}/>
          Travel and calendar availability are only as complete as the records saved in this workspace.
          A same-day review item is not proof of an impossible schedule.
        </div>
      </section>
    </div>

    <div className="coord-main-grid coord-bottom-grid">
      <section className="coord-panel">
        <div className="coord-section-head">
          <div><span className="coord-overline">COVERAGE INTELLIGENCE</span>
            <h2>Uncovered coaching needs</h2>
            <p>Needs relate to managers and territories already recorded, not assumptions about every unassigned state.</p></div>
          <span className="coord-count">{needs.length} to review</span>
        </div>
        {needs.length === 0 && <div className="coord-empty coord-empty-small">
          <Check size={24}/><strong>No outstanding needs detected</strong>
          <p>Based on saved coaching status, cadence and selected-week plans.</p>
        </div>}
        {needs.slice(0, 10).map(item => <div className="coord-gap" key={item.manager.id}>
          <span className={'coord-gap-marker coord-gap-' + item.kind}>
            {item.kind === 'ownership' ? <UserRoundCog size={19}/> :
              item.kind === 'location' ? <MapPin size={19}/> : <ClipboardCheck size={19}/>}
          </span>
          <div><strong>{item.manager.name}</strong>
            <small>{item.stateCode || 'Region missing'} · {item.reason}
              {item.alreadyScheduledLater ? ' · Later visit already saved' : ''}</small></div>
          <button type="button" onClick={() => ctx.open('manager', item.manager)}
            aria-label={'Edit manager ' + item.manager.name}><ArrowRight size={17}/></button>
        </div>)}
        {needs.length > 10 && <p className="coord-foot">Showing the first 10 needs by coaching priority.</p>}
      </section>
      <section className="coord-panel">
        <div className="coord-section-head">
          <div><span className="coord-overline">REGIONAL COLLABORATION</span>
            <h2>Divide or combine the work</h2>
            <p>Group managers in the same region and build trainer-specific travel plans for approval.</p></div>
          <span className="coord-count">{circuits.length} regions</span>
        </div>
        {!circuits.length && <div className="coord-empty coord-empty-small">
          <Route size={24}/><strong>No multi-manager circuits yet</strong>
          <p>Regions appear when at least two uncovered manager coaching needs can be planned.</p>
        </div>}
        {circuits.map(circuit => <article className="coord-region" key={circuit.stateCode}>
          <div><strong>{regionFor(circuit.stateCode)?.name || circuit.stateCode}</strong>
            <span>{circuit.people.length} managers · {circuit.split ?
              'Proposed two-trainer division' : 'Suggested regional circuit'}</span></div>
          {circuit.groups.map(group => <div className="coord-region-group" key={group.trainer.id}>
            <span><strong>{group.trainer.name}</strong>
              <small>{group.people.map(item => item.manager.name).join(' · ')}</small></span>
            <button type="button" disabled={!canPlan || !isReady}
              onClick={() => circuitPlan(circuit.stateCode, group)}>
              {group.people.length > 1 ? 'Plan circuit' : 'Plan travel'} <ArrowRight size={15}/></button>
          </div>)}
        </article>)}
        <div className="coord-data-note"><MapPin size={16}/>
          Geographic matching is at the state level or uses approximate straight-line proximity.
          Verify road routes and actual appointments before traveling.
        </div>
      </section>
    </div>
    <p className="coord-footer">
      {snapshot.mappedRegions} saved regions · Recommendations are suggestions, not automatic scheduling or trainer reassignments.
      No external calendar or confirmed flight inventory is inferred.
    </p>
  </section>;

  function circuitPlan(code: string, group: typeof circuits[number]['groups'][number]) {
    circuit(code, group);
  }
}
