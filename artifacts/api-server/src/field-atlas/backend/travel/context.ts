import { db } from '../runtime/sdk';
import type { Scenario, ScenarioReport, Evidence } from '../../shared/travel/types';
import type { FlightChange } from '../../shared/travel/intelligence';
import type { ScenarioBoard, ScenarioInput } from './scenarios';

export type Approval = { scenarioId: string; tripIds: string[]; scheduledVisits: number };
export type SavedReport = { id: string; report: ScenarioReport; input: ScenarioInput; approval?: Approval;
  currentPlan?: { input: ScenarioInput; report: ScenarioReport; scenario: Scenario; tripIds: string[]; recoveryId: string; unresolvedTrainerIds?: string[] } };
export const reportTable = (workspaceId: string) => 'atlas_scenarios_' + workspaceId;
export const changeTable = (workspaceId: string) => 'atlas_flight_changes_' + workspaceId;
export const recoveryTable = (workspaceId: string) => 'atlas_recovery_' + workspaceId;
export async function allRecords<T>(table: string): Promise<T[]> {
  const items: T[] = []; let nextToken: string | undefined;
  for (let page = 0; page < 40; page++) {
    const rows = await db.list<T>(table, { limit: 200, nextToken }); items.push(...rows.items); nextToken = rows.nextToken;
    if (!nextToken) return items;
  }
  throw new Error('Complete records are required for safe travel analysis.');
}
export async function planContext(workspaceId: string, id: string, board: ScenarioBoard) {
  const [saved] = await db.get<SavedReport>(reportTable(workspaceId), [id]);
  if (!saved?.approval) throw new Error('Choose a saved, approved plan in this workspace.');
  const input = structuredClone(saved.currentPlan?.input || saved.input);
  const report = saved.currentPlan?.report || saved.report;
  input.flights = input.flights.map(flight => ({ ...flight, providedAt: flight.providedAt || report.createdAt }));
  const scenario = saved.currentPlan?.scenario || saved.report.scenarios.find(item => item.id === saved.approval!.scenarioId)!;
  const tripIds = saved.currentPlan?.tripIds || saved.approval.tripIds;
  const pending = (board.visits || []).filter(visit => tripIds.includes(visit.tripId || '') && ['Planned', 'Rescheduled'].includes(visit.status));
  if (!(board.trips || []).some(trip => tripIds.includes(trip.id) && trip.status === 'Planned')) throw new Error('This saved plan no longer has an active field trip.');
  if (pending.some(visit => visit.date < input.startDate || visit.date > input.endDate)) throw new Error('Saved visit dates moved outside the analyzed field period. Create a new reviewed travel plan for those dates.');
  if (new Set(pending.map(visit => visit.managerId)).size !== pending.length) throw new Error('This plan has repeated pending visits to one manager. Split the itinerary before recovery analysis.');
  const effective = { ...input, managerIds: pending.map(visit => visit.managerId) };
  // Exclude only this plan's pending commitments. Completed history and all other plans stay reserved.
  const analysisBoard: ScenarioBoard = { ...board, trips: board.trips?.filter(trip => !tripIds.includes(trip.id)),
    visits: board.visits?.filter(visit => !pending.some(item => item.id === visit.id)) };
  analysisBoard.availability = [...(analysisBoard.availability || []), ...(saved.currentPlan?.unresolvedTrainerIds || []).map(id => ({ id: 'unresolved-flight-' + id,
    trainerId: id as 'trainer_a' | 'trainer_b', startDate: input.startDate, endDate: input.endDate, reason: 'Unavailable' as const, notes: 'Flight access remains unresolved after recovery.', createdAt: report.createdAt }))];
  const changes = await allRecords<FlightChange>(changeTable(workspaceId));
  const pendingChange = changes.find(change => change.reportId === id && change.state === 'pending');
  return { saved, input: effective, report, scenario, tripIds, pending, analysisBoard, pendingChange };
}
export type PlanContext = Awaited<ReturnType<typeof planContext>>;
export function workspaceEvidence(board: ScenarioBoard, revision: number): Evidence {
  const dates = [...(board.visits || []), ...(board.trips || []), ...board.trainerProfiles].map(row => row.updatedAt || '').filter(Boolean).sort();
  return { id: 'workspace-' + revision, provider: 'Saved workspace', subject: 'Appointments, trainer profiles and availability', sourceUrl: '', kind: 'reference', state: 'reference',
    retrievedAt: new Date().toISOString(), observedAt: dates.at(-1), version: String(revision), scope: 'Current shared records at this calendar revision.', limitation: 'Meeting acceptance, external calendars, airline availability and later edits are not independently verified.' };
}
export function policyEvidence(input: ScenarioInput): Evidence {
  return { id: 'planning-buffers', provider: 'Your planning allowances', subject: 'Workday and journey buffers', sourceUrl: '', kind: 'estimate', state: 'partial',
    retrievedAt: new Date().toISOString(), version: '1', scope: `${input.dayStart}–${input.dayEnd} local workday; ${input.sessionMinutes}-minute visits; ${input.checkinMinutes}-minute check-in, ${input.arrivalMinutes}-minute arrival and ${input.returnMinutes}-minute rental-return allowances.`, limitation: 'Planning allowances are not measured queues, traffic, airline minimum connection times or confirmed appointments.' };
}
