import { ArrowRight,CalendarDays,MapPin,Plus,Users } from 'lucide-react';
import { localDay,nextFieldMove } from './fieldExperience';
import { useOp } from './Operations';
import type { Manager } from './opsModels';
import { dateLabel } from './opsModels';

type Props = { onPlan: (person: Manager, stateCode: string) => void };

export default function NextMovePanel({ onPlan }: Props) {
  const ctx = useOp();
  const move = nextFieldMove({
    people: ctx.board.managers || [], visits: ctx.board.visits || [],
    assignments: ctx.board.assignments || [], commitments: ctx.board.coaching || [],
    trainer: ctx.activeTrainer.name, today: localDay(),
  });
  if (ctx.identity === 'loading') {
    return <section className='next-move' aria-label='Your next visit' aria-busy='true'>
      <p className='next-move-label'>Your next visit</p>
      <h2>Opening your field desk</h2>
      <p>Loading your saved managers and plans.</p>
    </section>;
  }
  if (move.kind === 'empty') {
    return <section className='next-move' aria-label='Start your field workspace'>
      <div className='next-move-symbol'><Users size={23}/></div>
      <h2>Put your people on the map.</h2>
      <p>Add a territory manager to connect their coverage, coaching needs and travel options.</p>
      <button type='button' className='atlas-primary' onClick={() => ctx.open('manager')}
        disabled={ctx.identity !== 'member'}><Plus size={17}/> Add your first manager</button>
      <p className='next-move-note'>Just exploring? Select any state on the map.</p>
    </section>;
  }
  if (move.kind === 'unassigned') {
    return <section className='next-move' aria-label='Assign your field team'>
      <p className='next-move-label'>Planning for {ctx.activeTrainer.name}</p>
      <h2>Connect your territory.</h2>
      <p>No active managers are assigned to this trainer. Assign a manager or switch trainers to see the next visit.</p>
      <button type='button' className='atlas-primary' onClick={() => ctx.go('managers')}>
        View managers <ArrowRight size={17}/>
      </button>
    </section>;
  }
  const scheduled = move.kind === 'visit';
  return <section className='next-move' aria-label={scheduled ? 'Your next saved visit' : 'Suggested next coaching visit'}>
    <p className='next-move-label'>{scheduled ? 'Your next saved visit' : 'Suggested next visit'}</p>
    <h2>{move.person.name}</h2>
    <p className='next-move-location'><MapPin size={15}/>
      {[move.person.baseCity, move.stateCode].filter(Boolean).join(', ') || 'Location not set'}
    </p>
    <div className='next-move-reason'>
      <CalendarDays size={18}/>
      <span>{scheduled
        ? dateLabel(move.visit.date, { weekday: 'short', month: 'short', day: 'numeric' })
        : move.reason}</span>
    </div>
    <button type='button' className='atlas-primary' onClick={() => {
      if (move.kind === 'visit') ctx.open('visit', move.visit);
      else if (!move.stateCode) ctx.open('manager', move.person);
      else onPlan(move.person, move.stateCode);
    }}>{move.kind === 'visit' ? 'Review this visit' : !move.stateCode ? 'Complete location' : 'Plan this visit'}<ArrowRight size={17}/></button>
    <button type='button' className='atlas-text-action' onClick={() => ctx.go(scheduled ? 'calendar' : 'week')}>
      {scheduled ? 'View team calendar' : 'Review our week'}<ArrowRight size={15}/>
    </button>
    <p className='next-move-note'>{scheduled
      ? 'From your saved visit records. Travel is not booked.'
      : 'Based on saved coaching records, not a sales performance prediction.'}</p>
  </section>;
}
