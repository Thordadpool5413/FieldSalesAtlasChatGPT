import { createHash, randomUUID } from 'node:crypto';
import { db, AppDatabaseError } from '../runtime/sdk';
import { scenarioInput, normalizeFlights, type ScenarioBoard } from './scenarios';
import { allRecords, planContext, reportTable, workspaceEvidence, type SavedReport } from './context';
import { zoneAt } from './zones';
import type { FlightInput, Scenario, ScenarioReport } from '../../shared/travel/types';
import { lookupAirports } from '../providers/airports';

export async function adoptSavedTrips(workspaceId: string, tripIds: string[], board: ScenarioBoard) {
  const revision = board.revision ?? db.workspaceRevision(workspaceId);
  const trips = (board.trips || []).filter(trip => tripIds.includes(trip.id) && trip.status === 'Planned');
  if (trips.length !== new Set(tripIds).size || !trips.length || trips.length > 2) throw new Error('Choose one or two planned trips in this workspace.');
  const existing = (await allRecords<SavedReport>(reportTable(workspaceId))).find(saved => saved.approval && tripIds.every(id => (saved.currentPlan?.tripIds || saved.approval!.tripIds).includes(id)));
  if (existing) return { reportId: existing.id, reused: true };
  if (new Set(trips.map(trip => trip.arrivalAirport)).size !== 1) throw new Error('Joint analysis currently requires a shared field airport. Connect these trips separately.');
  const visits = (board.visits || []).filter(visit => trips.some(trip => trip.id === visit.tripId) && ['Planned', 'Rescheduled'].includes(visit.status));
  if (!visits.length) throw new Error('These trips have no linked pending visits. Add proposed visits through the itinerary first.');
  if (new Set(visits.map(visit => visit.managerId)).size !== visits.length) throw new Error('Repeated visits to one manager need separate analysis windows.');
  const trainerIds = trips.map(trip => board.trainerProfiles.find(profile => profile.id === trip.trainerId || profile.name === trip.trainer)?.id);
  if (trainerIds.some(id => !id)) throw new Error('Every trip needs a current trainer profile.');
  const dates = trips.flatMap(trip => [trip.startDate, trip.endDate]).sort();
  const input = scenarioInput.parse({ managerIds: visits.map(visit => visit.managerId), trainerIds: [...new Set(trainerIds)], startDate: dates[0], endDate: dates.at(-1), arrivalAirport: trips[0].arrivalAirport });
  const now = new Date().toISOString();
  const scenario: Scenario = { id: randomUUID(), title: trips.map(trip => trip.title).join(' + '), objective: 'balanced', feasible: false, provisional: true,
    reasons: ['Analysis is connected to existing saved trips. Calendar records are unchanged.'], gaps: ['Existing appointments and booking details have not been independently confirmed.'],
    visits: visits.map(visit => {
      const person = board.managers?.find(person => person.id === visit.managerId);
      if (!person || !Number.isFinite(person.lat) || !Number.isFinite(person.lon)) throw new Error('Map every manager base before connecting this trip.');
      return { managerId: visit.managerId, trainerId: visit.trainerId || board.trainerProfiles.find(profile => profile.name === visit.trainer)!.id,
        date: visit.date, startTime: visit.startTime || '', endTime: visit.endTime || '', timeZone: visit.timeZone || zoneAt(person.lat, person.lon) || '',
        startInstant: visit.startInstant || '', endInstant: visit.endInstant || '', location: visit.location || '', stateCode: visit.stateCode, lat: person.lat!, lon: person.lon!, transferMinutes: 0 };
    }), unplaced: [], travelMinutes: 0, trainerIds: input.trainerIds, legs: [], budget: { knownAmount: 0, currency: 'USD', complete: false, items: [{ label: 'Existing-trip costs', amount: null, basis: 'Not supplied in this analysis snapshot.' }] } };
  const report: ScenarioReport = { id: 'adopted_' + createHash('sha256').update(tripIds.slice().sort().join('|')).digest('hex').slice(0, 40),
    createdAt: now, expiresAt: now, workspaceRevision: revision, startDate: input.startDate, endDate: input.endDate, arrivalAirport: input.arrivalAirport,
    scenarios: [scenario], evidence: [workspaceEvidence(board, revision)], notes: ['Saved calendar context only; a new calculation is required for recommendations.'], optimizer: 'Saved calendar snapshot', sourceStatus: 'No live checks performed during connection.' };
  const saved: SavedReport = { id: report.id, report, input, approval: { scenarioId: scenario.id, tripIds, scheduledVisits: visits.length } };
  const [created] = await db.tx.add(reportTable(workspaceId), [saved]);
  return { reportId: report.id, reused: !created };
}
export async function attachItinerary(workspaceId: string, reportId: string, flights: FlightInput[], board: ScenarioBoard) {
  const revision = board.revision ?? db.workspaceRevision(workspaceId), context = await planContext(workspaceId, reportId, board);
  if (context.pendingChange) throw new Error('Resolve or retract the pending flight change before replacing booking fields.');
  if (flights.some(flight => !context.input.trainerIds.includes(flight.trainerId))) throw new Error('Booking legs must belong to this plan’s trainers.');
  normalizeFlights(flights, await lookupAirports(flights.flatMap(flight => [flight.origin, flight.destination])));
  const input = { ...context.input, flights: flights.map(flight => ({ ...flight, providedAt: flight.providedAt || new Date().toISOString() })) };
  const update = context.saved.currentPlan ? { currentPlan: { ...context.saved.currentPlan, input } } : { input };
  await db.transact([db.tx.update(reportTable(workspaceId), [{ id: reportId, record: update }], { patch: true }),
    db.tx.add('atlas_itinerary_updates_' + workspaceId, [{ id: randomUUID(), reportId, at: new Date().toISOString(), legCount: flights.length }])], () => {
      if (db.workspaceRevision(workspaceId) !== revision) throw new AppDatabaseError('AppDatabaseConflict', 'Plan changed while attaching the itinerary.');
    });
  return { attached: flights.length };
}
