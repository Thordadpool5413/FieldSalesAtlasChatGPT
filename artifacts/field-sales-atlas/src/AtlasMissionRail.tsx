import { ArrowRight,CalendarCheck2,ClipboardCheck,Compass,Route,Sparkles } from 'lucide-react';
import './AtlasMissionRail.css';
import { useOp } from './Operations';
import { coachingPriority,dateLabel,today } from './opsModels';

type Region = { code: string; name: string; country: 'US' | 'CA' };
type Props = { region: Region | null; onAddManager: (code?: string) => void };

export default function AtlasMissionRail({ region, onAddManager }: Props) {
  const ctx = useOp();
  const managers = ctx.board.managers || [];
  const assignments = ctx.board.assignments || [];
  const visits = ctx.board.visits || [];
  const coaching = ctx.board.coaching || [];
  const trips = ctx.board.trips || [];
  const now = today();
  const scopedManagers = region ? managers.filter(manager =>
    manager.baseState === region.code ||
    assignments.some(a => a.managerId === manager.id && a.stateCode === region.code)
  ) : managers;
  const attention = scopedManagers.map(manager => ({
    manager, priority: coachingPriority(manager, visits, coaching)
  })).filter(item => item.priority.level !== 'Routine')
    .sort((a, b) => b.priority.score - a.priority.score);
  const nextVisit = visits.filter(v =>
    (v.status === 'Planned' || v.status === 'Rescheduled') &&
    v.date >= now && (!region || v.stateCode === region.code)
  ).sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextManager = nextVisit ? managers.find(m => m.id === nextVisit.managerId) : undefined;
  const plannedTrips = trips.filter(trip =>
    trip.status === 'Planned' && trip.endDate >= now &&
    (!region || trip.stops.some(stop => stop.stateCode === region.code))
  );
  const focus = attention[0];
  const noManagers = managers.length === 0;
  const emptyRegion = Boolean(region) && scopedManagers.length === 0;

  function goToCoaching() {
    if (noManagers || emptyRegion) onAddManager(region?.code);
    else if (focus) {
      ctx.setSelectedManager(focus.manager.id);
      ctx.go('managers');
    } else ctx.go('coaching');
  }

  return (
    <div className='fsa-mission-rail' aria-label='Actions based on saved field records'>
      <div className='fsa-mission-rail-intro'>
        <span className='fsa-mission-eyebrow'><Sparkles size={14}/> FIELD INTELLIGENCE</span>
        <strong>{region?.name || 'Your entire field'}</strong>
        <small>See the next move. Protect the week.</small>
      </div>
      <div className='fsa-mission-rail-cards'>
        <button type='button' className='fsa-mission-card'
          disabled={ctx.identity !== 'member' && (noManagers || emptyRegion)}
          onClick={goToCoaching}>
          <span className='fsa-mission-card-label'><ClipboardCheck size={17}/> 01 / COACHING <ArrowRight size={16}/></span>
          <strong>{noManagers ? 'Add your first manager'
            : emptyRegion ? 'Connect a manager in ' + region?.name
            : focus ? focus.manager.name : 'No immediate coaching flags'}</strong>
          <small>{noManagers || emptyRegion ? 'Build the people behind the map.'
            : focus ? attention.length + ' flagged · ' + (focus.priority.reasons[0] || 'Review needs')
            : 'Based on the coaching records currently saved.'}</small>
        </button>
        <button type='button' className='fsa-mission-card'
          onClick={() => nextVisit && ctx.identity === 'member' ? ctx.open('visit', nextVisit) : ctx.go('calendar')}>
          <span className='fsa-mission-card-label'><CalendarCheck2 size={17}/> 02 / FIELD WEEK <ArrowRight size={16}/></span>
          <strong>{nextVisit
            ? (nextManager?.name || 'Coaching visit') + ' · ' + dateLabel(nextVisit.date, { month: 'short', day: 'numeric' })
            : 'Your next visit starts here'}</strong>
          <small>{nextVisit ? [nextVisit.stateCode, nextVisit.trainer || nextManager?.trainer].filter(Boolean).join(' · ')
            : 'No upcoming saved visits in this scope.'}</small>
        </button>
        <button type='button' className='fsa-mission-card' onClick={() => ctx.go('coordinate')}>
          <span className='fsa-mission-card-label'><Route size={17}/> 03 / COORDINATE <ArrowRight size={16}/></span>
          <strong>Two trainers. One clear plan.</strong>
          <small>{plannedTrips.length
            ? plannedTrips.length + ' upcoming trip' + (plannedTrips.length === 1 ? '' : 's') + ' · Review coverage'
            : 'Check shared coverage, availability and schedule issues.'}</small>
        </button>
      </div>
      <div className='fsa-mission-rail-command'>
        <button type='button' onClick={() => ctx.go('mission')}>
          <Compass size={18}/><span>Open <strong>Mission Control</strong></span><ArrowRight size={16}/>
        </button>
        <small>{ctx.board.truncated
          ? 'Partial data: workspace exceeds current page'
          : 'Saved records only · External schedules unverified'}</small>
      </div>
    </div>
  );
}
