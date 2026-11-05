import {
ArrowRight,ArrowUpRight,CalendarDays,Check,CircleAlert,
Compass,MapPin,
PlaneTakeoff,Route,Sparkles,Users
} from 'lucide-react';
import { useMemo,useState } from 'react';
import { CANADA_REGION_BY_CODE } from './CanadaRegions';
import { nextFieldMove } from './fieldExperience';
import { useOp } from './Operations';
import type { Manager,Trip,Visit } from './opsModels';
import {
STATES,
coachingPriority,
dateLabel,today
} from './opsModels';

type Region = { code: string; name: string; country: 'US' | 'CA' };
type Props = { onPlan: (region: Region, manager?: Manager) => void };
type AgendaRow = {
  id: string;
  date: string;
  label: string;
  detail: string;
  trainer: string;
  kind: 'visit' | 'trip';
  visit?: Visit;
  trip?: Trip;
};

function afterDays(start: string, offset: number) {
  const date = new Date(start + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export default function TodayHub({ onPlan }: Props) {
  const ctx = useOp();
  const [teamScope, setTeamScope] = useState<'mine' | 'both'>('mine');
  const now = today();
  const end = afterDays(now, 6);
  const managers = ctx.board.managers || [];
  const visits = ctx.board.visits || [];
  const trips = ctx.board.trips || [];
  const notes = ctx.board.coaching || [];
  const assignments = ctx.board.assignments || [];
  const trainer = ctx.activeTrainer.name;
  const mine = managers.filter(person => person.trainer === trainer);
  const mineIds = new Set(mine.map(person => person.id));
  const plannedVisits = visits.filter(visit =>
    ['Planned', 'Rescheduled'].includes(visit.status) &&
    visit.date >= now && visit.date <= end
  );
  const ownVisits = plannedVisits.filter(visit =>
    (visit.trainer || managers.find(person => person.id === visit.managerId)?.trainer) === trainer
  );
  const upcomingTrips = trips.filter(trip =>
    trip.status === 'Planned' && trip.endDate >= now && trip.startDate <= end
  );
  const ownTrips = upcomingTrips.filter(trip => trip.trainer === trainer);
  const openNotes = notes.filter(note =>
    note.status === 'Open' &&
    (note.trainer === trainer || (!note.trainer && mineIds.has(note.managerId)))
  );
  const overdueNotes = openNotes.filter(note => note.dueDate && note.dueDate < now);
  const peopleDue = mine.filter(person =>
    coachingPriority(person, visits, notes).level === 'High'
  );
  const missingLocations = mine.filter(person =>
    !Number.isFinite(person.lat) || !Number.isFinite(person.lon)
  );
  const coverage = new Set([
    ...mine.map(person => person.baseState || ''),
    ...assignments.filter(a => mineIds.has(a.managerId)).map(a => a.stateCode)
  ].filter(Boolean)).size;
  const move = nextFieldMove({
    people: managers,
    visits,
    assignments,
    commitments: notes,
    trainer,
    today: now
  });

  const agenda = useMemo<AgendaRow[]>(() => {
    const visitRows = plannedVisits.map(visit => {
      const person = managers.find(item => item.id === visit.managerId);
      return {
        id: 'visit-' + visit.id,
        date: visit.date,
        label: person?.name || 'Coaching visit',
        detail: [visit.stateCode, visit.startTime || '', visit.objective || 'Coaching session']
          .filter(Boolean).join(' · '),
        trainer: visit.trainer || person?.trainer || 'Not assigned',
        kind: 'visit' as const,
        visit
      };
    });
    const tripRows = upcomingTrips.map(trip => ({
      id: 'trip-' + trip.id,
      date: trip.startDate < now ? now : trip.startDate,
      label: trip.title || 'Field trip',
      detail: [trip.arrivalAirport ? 'Arrive ' + trip.arrivalAirport : '',
        trip.startDate !== trip.endDate ? 'Through ' + dateLabel(trip.endDate, { month: 'short', day: 'numeric' }) : '',
        'Travel itinerary'].filter(Boolean).join(' · '),
      trainer: trip.trainer || 'Not assigned',
      kind: 'trip' as const,
      trip
    }));
    return [...visitRows, ...tripRows].sort((a, b) =>
      a.date.localeCompare(b.date) || a.label.localeCompare(b.label)
    );
  }, [plannedVisits, upcomingTrips, managers, now]);

  const shownAgenda = agenda.filter(item => teamScope === 'both' || item.trainer === trainer);
  const unassignedCount = managers.filter(person => !person.trainer).length;
  const noArrivalCount = ownTrips.filter(trip => !trip.arrivalAirport).length;
  const overlappingTripIds = new Set(ownTrips.filter(trip => ownTrips.some(other =>
    other.id !== trip.id && other.startDate <= trip.endDate && other.endDate >= trip.startDate
  )).map(trip => trip.id));
  const duplicateManagerDays = new Set(ownVisits.filter(visit => plannedVisits.some(other =>
    other.id !== visit.id && other.managerId === visit.managerId && other.date === visit.date
  )).map(visit => visit.managerId + ':' + visit.date));
  const reviewDays = overlappingTripIds.size + duplicateManagerDays.size;
  const empty = managers.length === 0 && visits.length === 0 && trips.length === 0;

  function travelFor(person: Manager, stateCode: string) {
    const ca = CANADA_REGION_BY_CODE[stateCode];
    const us = STATES.find(state => state.code === stateCode);
    if (!ca && !us) {
      ctx.open('manager', person);
      return;
    }
    onPlan({
      code: stateCode,
      name: ca?.name || us!.name,
      country: ca ? 'CA' : 'US'
    }, person);
  }

  const callToAction = () => {
    if (move.kind === 'visit') {
      ctx.open('visit', move.visit);
      return;
    }
    if (move.kind === 'attention') {
      travelFor(move.person, move.stateCode);
      return;
    }
    if (move.kind === 'unassigned') {
      ctx.go('people');
      return;
    }
    if(move.kind==='empty'){ctx.go('home');return;}
    ctx.open('manager');
  };

  const headline = move.kind === 'visit'
    ? 'Your next visit is ready.'
    : move.kind === 'attention'
      ? 'One person deserves your attention.'
      : move.kind === 'unassigned'
        ? 'Connect your next territory.'
        : 'Discover your next market.';

  const reason = move.kind === 'visit'
    ? move.person.name + ' · ' +
      dateLabel(move.visit.date, { weekday: 'short', month: 'short', day: 'numeric' }) +
      (move.visit.stateCode ? ' · ' + move.visit.stateCode : '')
    : move.kind === 'attention'
      ? move.person.name + ' · ' + move.reason
      : move.kind === 'unassigned'
        ? 'Your selected trainer has no assigned managers. Review the shared roster to connect the right people.'
        : 'Explore public airports and Census geography now. Add managers when you want personalized coaching priorities.';

  const actionLabel = move.kind === 'visit' ? 'Review the visit'
    : move.kind === 'attention' ? move.stateCode ? 'Plan this visit' : 'Complete their location'
    : move.kind === 'unassigned' ? 'Open the team roster' : 'Explore public markets';

  const readiness = [
    ...(reviewDays ? [{
      id: 'calendar',
      title: reviewDays + ' scheduling issue' + (reviewDays > 1 ? 's' : '') + ' to review',
      detail: 'Overlapping trips or repeat manager visits may need coordination.',
      action: () => ctx.go('calendar')
    }] : []),
    ...(overdueNotes.length
      ? [{ id: 'coaching', title: overdueNotes.length + ' overdue coaching commitment' +
          (overdueNotes.length > 1 ? 's' : ''),
          detail: 'Follow through before the next field visit.', action: () => ctx.go('coaching') }]
      : []),
    ...(missingLocations.length
      ? [{ id: 'coordinates', title: missingLocations.length + ' manager location' +
          (missingLocations.length > 1 ? 's' : '') + ' need coordinates',
          detail: 'Travel times are only approximate until a base location is saved.',
          action: () => ctx.go('people') }]
      : []),
    ...(noArrivalCount
      ? [{ id: 'arrival', title: noArrivalCount + ' trip' +
          (noArrivalCount > 1 ? 's' : '') + ' need an arrival airport',
          detail: 'Compare nearby airports before finalizing travel.',
          action: () => ctx.go('air') }]
      : []),
    ...(unassignedCount
      ? [{ id: 'owner', title: unassignedCount + ' unassigned territory manager' +
          (unassignedCount > 1 ? 's' : ''),
          detail: 'Assign an area field trainer to make ownership clear.',
          action: () => ctx.go('people') }]
      : [])
  ];

  const seatCounts = ctx.trainerProfiles.map(profile => ({
    id: profile.id,
    name: profile.name,
    count: managers.filter(person => person.trainer === profile.name).length
  }));
  const totals = Math.max(1, ...seatCounts.map(s => s.count));

  return (
    <main className='studio-command' aria-label='Field Sales Atlas command center'>
      <div className='studio-masthead'>
        <div>
          <div className='studio-eyebrow'>
            <span className='studio-status-pulse' aria-hidden='true'/>
            YOUR FIELD DESK
          </div>
          <h1>Know the territory. <span>Own the week.</span></h1>
          <p>{dateLabel(now, { weekday: 'long', month: 'long', day: 'numeric' })} ·
            <strong> {trainer}</strong> · Based on your saved workspace</p>
          <div className='studio-trainer-seats' role='group' aria-label='Choose trainer'>
            {ctx.trainerProfiles.map((profile,index)=>(
              <button type='button' key={profile.id}
                aria-pressed={ctx.activeTrainerId===profile.id}
                className={'studio-trainer-seat'+(ctx.activeTrainerId===profile.id?' selected':'')}
                onClick={()=>ctx.setActiveTrainerId(profile.id)}>
                <span className={index===1?'second':'first'} aria-hidden='true'/>
                {profile.name}
              </button>
            ))}
          </div>
        </div>
        <div className='studio-masthead-actions'>
          <button type='button' className='studio-button studio-button-secondary'
            onClick={() => ctx.go('home')}>
            <Compass size={18}/> Explore Atlas
          </button>
          <button type='button' className='studio-button studio-button-primary'
            onClick={() => ctx.go('air')}>
            <PlaneTakeoff size={18}/> Plan travel <ArrowRight size={17}/>
          </button>
        </div>
      </div>

      <section className='studio-spotlight' aria-labelledby='studio-next-title'>
        <div className='studio-spotlight-copy'>
          <div className='studio-spotlight-label'><Sparkles size={15}/> THE NEXT MOVE</div>
          <h2 id='studio-next-title'>{headline}</h2>
          <p>{reason}</p>
          <div className='studio-spotlight-actions'>
            <button type='button' className='studio-button studio-button-primary'
              disabled={ctx.identity !== 'member'&&move.kind!=='empty'}
              onClick={callToAction}>
              {move.kind === 'empty' && <Compass size={17}/>}
              {actionLabel} <ArrowRight size={17}/>
            </button>
            <button type='button' className='studio-link-light' onClick={() => ctx.go('calendar')}>
              View team calendar <ArrowUpRight size={17}/>
            </button>
          </div>
          <span className='studio-spotlight-source'>
            {move.kind === 'visit' ? 'A planned visit from your schedule'
              : move.kind === 'attention' ? 'Suggested from saved coaching and visit data'
                : 'Public airport and Census information is available before saving manager records.'}
          </span>
        </div>
        <div className='studio-spotlight-art' aria-hidden='true'>
          <div className='studio-horizon'>
            <div className='studio-horizon-disc'/>
            <div className='studio-horizon-grid'/>
            <span className='studio-horizon-caption'>FIELD INTELLIGENCE / {coverage} MARKETS</span>
          </div>
        </div>
      </section>

      <section className='studio-metrics' aria-label='Your next seven days'>
        <div className='studio-metric'>
          <span className='studio-metric-symbol'><CalendarDays size={19}/></span>
          <strong>{ownVisits.length}</strong>
          <span>Visits in 7 days</span>
        </div>
        <div className='studio-metric'>
          <span className='studio-metric-symbol'><PlaneTakeoff size={19}/></span>
          <strong>{ownTrips.length}</strong>
          <span>Upcoming trips</span>
        </div>
        <div className='studio-metric'>
          <span className='studio-metric-symbol'><Users size={19}/></span>
          <strong>{mine.length}</strong>
          <span>Assigned managers</span>
        </div>
        <div className='studio-metric'>
          <span className='studio-metric-symbol'><CircleAlert size={19}/></span>
          <strong>{peopleDue.length}</strong>
          <span>High priority managers</span>
        </div>
      </section>

      <div className='studio-main-grid'>
        <section className='studio-panel studio-agenda' aria-label='Upcoming field commitments'>
          <header className='studio-panel-header'>
            <div>
              <div className='studio-eyebrow'>THE ROAD AHEAD</div>
              <h2>Next seven days</h2>
              <p>One clear schedule, across field visits and travel.</p>
            </div>
            <div className='studio-scope' role='group' aria-label='Whose field commitments'>
              <button type='button' aria-pressed={teamScope === 'mine'}
                className={teamScope === 'mine' ? 'active' : ''}
                onClick={() => setTeamScope('mine')}>Mine</button>
              <button type='button' aria-pressed={teamScope === 'both'}
                className={teamScope === 'both' ? 'active' : ''}
                onClick={() => setTeamScope('both')}>Both</button>
            </div>
          </header>
          {shownAgenda.length ? (
            <div className='studio-agenda-list'>
              {shownAgenda.slice(0, 6).map(item => (
                <button className='studio-agenda-row' type='button' key={item.id}
                  onClick={() => {
                    if (item.visit) ctx.open('visit', item.visit);
                    else ctx.go('trips');
                  }}>
                  <span className='studio-day'>
                    <strong>{dateLabel(item.date, { day: 'numeric' })}</strong>
                    <small>{dateLabel(item.date, { month: 'short' })}</small>
                  </span>
                  <span className={'studio-event-marker ' + (item.kind === 'trip' ? 'trip' : 'visit')}>
                    {item.kind === 'trip' ? <PlaneTakeoff size={17}/> : <CalendarDays size={17}/>}
                  </span>
                  <span className='studio-event-details'>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                    {teamScope === 'both' && <em>{item.trainer}</em>}
                  </span>
                  <ArrowUpRight size={18} className='studio-agenda-arrow'/>
                </button>
              ))}
              {shownAgenda.length > 6 && (
                <p className='studio-extra-events'>+{shownAgenda.length - 6} more commitments in the shared calendar</p>
              )}
            </div>
          ) : (
            <div className='studio-quiet-empty'>
              <span className='studio-empty-icon'><CalendarDays size={23}/></span>
              <strong>{teamScope === 'mine' ? 'Your week is open.' : 'No team commitments this week.'}</strong>
              <p>Build visits around the managers and territories that matter most.</p>
              <button className='studio-text-button' type='button' onClick={() => ctx.go('plan')}>
                Build your week <ArrowRight size={16}/>
              </button>
            </div>
          )}
          <footer className='studio-panel-foot'>
            <button type='button' onClick={() => ctx.go('calendar')}>
              Open calendar <ArrowRight size={16}/>
            </button>
            <span>{dateLabel(now, { month: 'short', day: 'numeric' })} to {dateLabel(end, { month: 'short', day: 'numeric' })}</span>
          </footer>
        </section>

        <div className='studio-side-stack'>
          <section className='studio-panel studio-readiness' aria-labelledby='studio-readiness-title'>
            <header className='studio-panel-header'>
              <div>
                <div className='studio-eyebrow'>BEFORE YOU GO</div>
                <h2 id='studio-readiness-title'>Field readiness</h2>
                <p>Small details that make a field day smoother.</p>
              </div>
            </header>
            {readiness.length ? (
              <div className='studio-checklist'>
                {readiness.slice(0, 3).map(item => (
                  <button type='button' key={item.id} onClick={item.action}>
                    <span className='studio-check-alert'><CircleAlert size={17}/></span>
                    <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                    <ArrowRight size={16}/>
                  </button>
                ))}
              </div>
            ) : (
              <div className='studio-readiness-clear'>
                {mine.length===0?<Users size={20}/>:<Check size={20}/>}
                <div>
                  <strong>{mine.length===0?'Start with your trainer roster.':'No immediate preparation flags.'}</strong>
                  <p>{mine.length===0?'No managers are assigned to this trainer yet. Add or assign managers to see field readiness.':
                    'Saved records show no outstanding location or coaching alerts for this trainer.'}</p>
                  {mine.length===0&&<button className='studio-text-button' type='button' onClick={()=>ctx.go('people')}>
                    Open the roster <ArrowRight size={15}/>
                  </button>}
                </div>
              </div>
            )}
            <div className='studio-panel-note'>
              Checks use recorded data, not confirmed flight status or meeting locations.
            </div>
          </section>

          <section className='studio-panel studio-coverage' aria-label='Two trainer coverage'>
            <header className='studio-panel-header'>
              <div>
                <div className='studio-eyebrow'>ONE TEAM / TWO TRAINERS</div>
                <h2>Territory ownership</h2>
                <p>{coverage} markets connected to the selected trainer</p>
              </div>
              <button type='button' className='studio-small-arrow' title='Open territory map'
                aria-label='Open territory map' onClick={() => ctx.go('home')}>
                <ArrowUpRight size={17}/>
              </button>
            </header>
            <div className='studio-team-bars'>
              {seatCounts.map((seat, index) => (
                <div key={seat.id} className='studio-team-row'>
                  <span className={'studio-team-dot ' + (index === 1 ? 'second' : 'first')}/>
                  <span className='studio-team-name'>{seat.name}</span>
                  <div className='studio-bar-rail' aria-label={seat.count + ' managers'}>
                    <span className={index === 1 ? 'second' : 'first'}
                      style={{ width: (seat.count === 0 ? 0 : Math.max(6, seat.count / totals * 100)) + '%' }}/>
                  </div>
                  <strong>{seat.count}</strong>
                </div>
              ))}
            </div>
            <button type='button' className='studio-text-button studio-coverage-link'
              onClick={() => ctx.go('people')}>
              Manage territory managers <ArrowRight size={16}/>
            </button>
          </section>
        </div>
      </div>

      {empty && (
        <section className='studio-start-guide' aria-label='How to get started'>
          <div><span className='studio-eyebrow'>START HERE</span><h2>Three actions. One connected workflow.</h2></div>
          <div className='studio-start-actions'>
            <button type='button' onClick={() => ctx.go('home')}>
              <span>01</span><MapPin size={18}/><strong>Explore public markets</strong><ArrowRight size={16}/>
            </button>
            <button type='button' onClick={() => ctx.go('radar')}>
              <span>02</span><PlaneTakeoff size={18}/><strong>Research flight conditions</strong><ArrowRight size={16}/>
            </button>
            <button type='button' onClick={() => ctx.go('air')}>
              <span>03</span><Route size={18}/><strong>Plan field travel</strong><ArrowRight size={16}/>
            </button>
          </div>
        </section>
      )}
      <p className='studio-data-note'>
        All numbers and suggested actions come from the shared workspace.
        Flight schedules, airline availability and driving times require independent confirmation.
      </p>
    </main>
  );
}
