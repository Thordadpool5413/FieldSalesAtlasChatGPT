import type { Board } from './opsModels';
import type { TravelPlan } from './TravelLogic';
import type { CoachingSchedule } from './TripIntelligence';

export function tripConflicts(plan: TravelPlan, schedule: CoachingSchedule, board: Board, trainerId: string): string[] {
  const conflicts: string[] = [];
  if (schedule.unplaced.length) conflicts.push(`${schedule.unplaced.length} manager visits do not fit. Extend the dates or shorten sessions.`);
  if (!schedule.visits.length) conflicts.push('No coaching sessions fit these dates and working hours.');
  if ((board.trips || []).some(trip => trip.status !== 'Canceled' && trip.trainer === plan.trainer && trip.startDate <= plan.returnDate && trip.endDate >= plan.departDate)) {
    conflicts.push('This trainer already has a trip during these dates. Review the shared calendar.');
  }
  if (schedule.visits.some(item => (board.visits || []).some(visit => visit.managerId === item.manager.id && visit.date === item.date && visit.status !== 'Canceled'))) {
    conflicts.push('A manager already has a visit on a proposed date. Review the shared calendar.');
  }
  const blocks = (board.availability || []).filter(block => block.trainerId === trainerId && block.startDate <= plan.returnDate && block.endDate >= plan.departDate);
  for (const block of blocks) conflicts.push(`${plan.trainer} is marked ${block.reason.toLowerCase()} from ${block.startDate} to ${block.endDate}.`);
  return conflicts;
}
