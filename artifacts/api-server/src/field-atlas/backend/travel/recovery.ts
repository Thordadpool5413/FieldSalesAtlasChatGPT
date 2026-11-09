import { journeyReadiness } from './readiness';
import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { db, workspaceGuard } from '../runtime/sdk';
import { flightInput, normalizeFlights, buildScenarios, type ScenarioBoard, type ScenarioInput } from './scenarios';
import { allRecords, changeTable, planContext, recoveryTable, reportTable, workspaceEvidence, policyEvidence, type PlanContext } from './context';
import { lookupAirports } from '../providers/airports';
import { roadMatrix } from '../providers/routing';
import { evidenceState } from '../providers/evidence';
import { zoneAt } from './zones';
import { addMinutes, elapsedMinutes, zonedInstant } from '../../shared/travel/time';
import type { FlightInput } from '../../shared/travel/types';
import type { FlightChange, RecoveryPreview, RecoveryOption, VisitImpact } from '../../shared/travel/intelligence';
import { queueWatch, watchReplacementOperations } from './watch';

export const changeInput = z.object({ id: z.uuid(), reportId: z.string().min(1).max(100), originalLeg: flightInput,
  replacementLeg: flightInput.optional(), status: z.enum(['delayed', 'changed', 'canceled']), checkedAt: z.iso.datetime(), notes: z.string().max(700).default('') });
type ChangeInput = z.infer<typeof changeInput>;
export const flightKey = (flight: FlightInput) => [flight.trainerId, flight.origin, flight.destination, flight.departDate, flight.carrier, flight.flightNumber.replace(/^0+/, '')].join('|');
type StoredChange = FlightChange & { requestHash: string; appliedRecoveryId?: string };
type StoredRecovery = RecoveryPreview & { inputs: Record<string, ScenarioInput>; unresolvedTrainerIds?: string[]; receipt?: { optionId: string; tripIds: string[]; updatedVisits: number } };

export async function reportFlightChange(workspaceId: string, body: ChangeInput, board: ScenarioBoard) {
  const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const [previous] = await db.get<StoredChange>(changeTable(workspaceId), [body.id]);
  if (previous) { if (previous.requestHash !== requestHash) throw new Error('This report ID already belongs to a different flight change.'); return previous; }
  const revision = board.revision ?? await db.workspaceRevision(workspaceId), context = await planContext(workspaceId, body.reportId, board);
  if (context.pendingChange) throw new Error('This plan already has a pending flight change. Review or retract that report first.');
  if (!context.pending.length) throw new Error('This plan has no pending visits to recover.');
  if (!context.input.trainerIds.includes(body.originalLeg.trainerId as 'trainer_a' | 'trainer_b')) throw new Error('Choose a trainer from this approved plan.');
  if (Date.parse(body.checkedAt) > Date.now() + 300000) throw new Error('The reported check time cannot be in the future.');
  if (body.status === 'canceled' && body.replacementLeg) throw new Error('Use Changed when supplying a replacement flight.');
  if (body.status !== 'canceled' && !body.replacementLeg) throw new Error('Supply the changed flight times, including both local dates.');
  if (body.replacementLeg && (body.replacementLeg.trainerId !== body.originalLeg.trainerId || body.replacementLeg.origin !== body.originalLeg.origin || body.replacementLeg.destination !== body.originalLeg.destination)) throw new Error('For a different airport pair, create a new itinerary with routed airport transfers. This recovery keeps the field-airport circuit.');
  const own = context.input.flights.filter(flight => flight.trainerId === body.originalLeg.trainerId);
  if (own.length && !own.some(flight => flightKey(flight) === flightKey(body.originalLeg))) throw new Error('The original leg does not match the saved itinerary. Refresh the selected flight.');
  if (!own.length && body.originalLeg.origin !== context.input.arrivalAirport && body.originalLeg.destination !== context.input.arrivalAirport) throw new Error('Without a saved booking, report a direct field-airport arrival or departure leg.');
  const airports = await lookupAirports([body.originalLeg.origin, body.originalLeg.destination]);
  normalizeFlights([body.originalLeg, ...(body.replacementLeg ? [body.replacementLeg] : [])], airports);
  const now = new Date().toISOString();
  const change: StoredChange = { ...body, createdAt: now, state: 'pending', requestHash, evidence: {
    id: 'flight-change-' + body.id, provider: 'Traveler-reported flight change', subject: `${body.originalLeg.origin}–${body.originalLeg.destination} · ${body.status}`,
    sourceUrl: '', kind: 'traveler', state: 'reference', observedAt: body.checkedAt, retrievedAt: now, version: body.id,
    scope: 'The traveler supplied these flight fields and the check time.', limitation: 'Not independently confirmed by an airline or flight-status provider. Alternative seats, fares and rebooking eligibility remain unverified.' } };
  await db.transact([db.tx.add(changeTable(workspaceId), [change])], workspaceGuard(workspaceId, revision, 'The shared plan changed. Refresh before reporting.'));
  return change;
}

export async function changedContext(context: PlanContext, change: FlightChange) {
  let flights = [...context.input.flights];
  const matched = flights.findIndex(flight => flightKey(flight) === flightKey(change.originalLeg));
  if (matched >= 0) flights.splice(matched, 1);
  if (change.replacementLeg) flights.push({ ...change.replacementLeg, review: undefined, providedAt: change.checkedAt });
  const airports = await lookupAirports([...flights.flatMap(flight => [flight.origin, flight.destination]), change.originalLeg.origin, change.originalLeg.destination]);
  const original = normalizeFlights([change.originalLeg], airports)[0];
  const baseline = normalizeFlights(context.input.flights, airports).filter(flight => flight.trainerId === change.originalLeg.trainerId);
  const fieldArrival = baseline.find(flight => flight.destination === context.input.arrivalAirport);
  let unavailable = change.status === 'canceled' && (change.originalLeg.destination === context.input.arrivalAirport || (!!fieldArrival && original.departure < fieldArrival.arrival));
  const timed = normalizeFlights(flights, airports);
  const own = timed.filter(flight => flight.trainerId === change.originalLeg.trainerId);
  for (let i = 1; i < own.length; i++) if (elapsedMinutes(own[i - 1].arrival, own[i].departure) < 0) unavailable = true;
  const board: ScenarioBoard = structuredClone(context.analysisBoard);
  board.availability = board.availability?.filter(block => block.id !== 'unresolved-flight-' + change.originalLeg.trainerId);
  if (unavailable) {
    // A cancellation/missed connection cannot turn into an assumption that the trainer is already there.
    flights = flights.filter(flight => flight.trainerId !== change.originalLeg.trainerId);
    board.availability = [...(board.availability || []), { id: 'flight-unavailable-' + change.id, trainerId: change.originalLeg.trainerId as 'trainer_a' | 'trainer_b',
      startDate: context.input.startDate, endDate: context.input.endDate, reason: 'Unavailable', notes: 'Flight access unresolved after a reported disruption.', createdAt: change.createdAt }];
  }
  const unresolvedTrainerIds = [...new Set([...(context.saved.currentPlan?.unresolvedTrainerIds || []).filter(id => id !== change.originalLeg.trainerId), ...(unavailable ? [change.originalLeg.trainerId] : [])])];
  return { input: { ...context.input, flights }, board, unavailable, unresolvedTrainerIds };
}

async function assessImpacts(context: PlanContext, change: FlightChange, board: ScenarioBoard, accessUnresolved: boolean) {
  const [airport] = await lookupAirports([context.input.arrivalAirport]);
  if (!airport) throw new Error('The field airport needs a validated coordinate reference.');
  const people = context.pending.map(visit => board.managers!.find(person => person.id === visit.managerId)!);
  if (people.some(person => !person || !Number.isFinite(person.lat) || !Number.isFinite(person.lon))) throw new Error('Every pending visit needs a saved base location.');
  const matrix = await roadMatrix([{ id: airport.iata, name: airport.name, lat: airport.lat!, lon: airport.lon! }, ...people.map(person => ({ id: person.id, name: person.name, lat: person.lat!, lon: person.lon! }))]);
  const flights = change.replacementLeg ? normalizeFlights([change.replacementLeg], await lookupAirports([change.replacementLeg.origin, change.replacementLeg.destination])) : [];
  const replacement = flights[0];
  const impacts: VisitImpact[] = context.pending.map((visit, index) => {
    const profile = board.trainerProfiles.find(profile => profile.id === visit.trainerId || profile.name === visit.trainer)!;
    const person = people[index], timeZone = visit.timeZone || zoneAt(person.lat, person.lon) || 'UTC';
    let level: VisitImpact['level'] = 'unchanged', reason = 'This trainer’s recorded flight was not changed. A handoff alternative may still move this visit.';
    if (profile.id === change.originalLeg.trainerId) {
      level = 'review'; reason = 'The assigned trainer has a reported flight change. This appointment needs review.';
      if (change.status === 'canceled') { level = accessUnresolved ? 'affected' : 'review'; reason = accessUnresolved ? 'A flight cancellation leaves this trainer’s field access unresolved; no replacement is assumed.' : 'A return-flight cancellation leaves the home journey unresolved. Field access is retained, but the return needs review.'; }
      else if (replacement && visit.startInstant && visit.endInstant) {
        if (replacement.destination === airport.iata) {
          const drive = matrix.durations[0][index + 1];
          if (drive === null || Date.parse(addMinutes(replacement.arrival, context.input.arrivalMinutes + (drive || 0))) > Date.parse(visit.startInstant)) {
            level = 'affected'; reason = 'The proposed appointment precedes the reported arrival plus arrival processing and the estimated direct transfer, or no road route exists.';
          }
        } else if (replacement.origin === airport.iata) {
          const drive = matrix.durations[index + 1][0];
          if (drive === null || Date.parse(addMinutes(visit.endInstant, (drive || 0) + context.input.checkinMinutes + context.input.returnMinutes)) > Date.parse(replacement.departure)) {
            level = 'affected'; reason = 'The appointment plus estimated return drive and departure allowances exceeds the changed departure window, or no road route exists.';
          }
        }
      }
    }
    return { managerId: visit.managerId, managerName: person.name, trainerId: profile.id, trainerName: profile.name, date: visit.date,
      localTime: `${visit.startTime || '?'}–${visit.endTime || '?'}`, timeZone, level, reason, evidenceIds: [change.evidence.id, matrix.evidence.id, 'planning-buffers'] };
  });
  return { impacts, matrix };
}

export async function buildRecovery(workspaceId: string, changeId: string, board: ScenarioBoard, includeHandoffs: boolean) {
  const revision = board.revision ?? await db.workspaceRevision(workspaceId);
  const [change] = await db.get<FlightChange>(changeTable(workspaceId), [changeId]);
  if (!change || change.state !== 'pending') throw new Error('Choose a pending flight change in this workspace.');
  const context = await planContext(workspaceId, change.reportId, board);
  if (!context.pending.length) throw new Error('There are no pending appointments to recover.');
  const changed = await changedContext(context, change);
  const { impacts, matrix } = await assessImpacts(context, change, board, changed.unavailable);
  const inputVariants = [{ label: 'Keep current trainer ownership', input: { ...changed.input, allowHandoffs: false } }];
  if (includeHandoffs) inputVariants.push({ label: 'Share the remaining visits', input: { ...changed.input, allowHandoffs: true,
    trainerIds: board.trainerProfiles.filter(profile => profile.homeAirports.length).map(profile => profile.id) } });
  const options: RecoveryOption[] = [], inputs: Record<string, ScenarioInput> = {};
  const workEvidence = workspaceEvidence(board, revision), policy = policyEvidence(context.input);
  for (const variant of inputVariants) {
    const report = await buildScenarios(variant.input, changed.board, revision);
    const scenario = report.scenarios.find(item => item.feasible) || report.scenarios[0];
    const differences = scenario.visits.map(visit => {
      const before = context.pending.find(item => item.managerId === visit.managerId)!;
      const trainer = board.trainerProfiles.find(profile => profile.id === visit.trainerId)!;
      return { managerId: visit.managerId, managerName: board.managers!.find(person => person.id === visit.managerId)!.name,
        from: { trainer: before.trainer || '', date: before.date, time: `${before.startTime || '?'}–${before.endTime || '?'}` },
        to: { trainer: trainer.name, date: visit.date, time: `${visit.startTime}–${visit.endTime}` },
        changed: before.trainer !== trainer.name || before.date !== visit.date || before.startTime !== visit.startTime || before.endTime !== visit.endTime };
    });
    const evidence = [...report.evidence, change.evidence, workEvidence, policy, matrix.evidence].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index);
    const optionInput = differences.some(item => item.changed) && variant.input.requirements ? {
      ...variant.input, requirements: { trainers: variant.input.requirements.trainers.map(item => ({
        ...item, transport: item.transport === 'shared-arranged' ? 'shared-needs-review' as const : item.transport,
        equipment: item.equipment === 'shared-arranged' ? 'shared-needs-review' as const : item.equipment,
      })) },
    } : variant.input;
    const readiness = await journeyReadiness(optionInput, changed.board, scenario.visits);
    for (const item of readiness.evidence) if (!evidence.some(existing => existing.id === item.id)) evidence.push(item);
    const option: RecoveryOption = { id: randomUUID(), label: variant.label, scenario, readiness: readiness.readiness, report: { ...report, evidence }, evidence, differences,
      consequences: board.trainerProfiles.map(profile => `${profile.name}: ${context.pending.filter(visit => visit.trainer === profile.name || visit.trainerId === profile.id).length} pending visits before; ${scenario.visits.filter(visit => visit.trainerId === profile.id).length} in this option.`) };
    option.consequences.push(`${differences.filter(item => item.changed).length} appointments change trainer, date or local time. Completed visits remain unchanged. Manager ownership is preserved.`);
    if (changed.unavailable) option.consequences.push('The disrupted trainer is reserved as unavailable until flight access is resolved. No replacement flight has been invented.');
    if (!scenario.feasible) option.consequences.push(`${scenario.unplaced.length} visits could not be placed. This option cannot update the calendar.`);
    inputs[option.id] = optionInput; options.push(option);
  }
  const now = new Date().toISOString();
  const preview: StoredRecovery = { id: randomUUID(), changeId, reportId: change.reportId, workspaceRevision: revision, createdAt: now,
    expiresAt: new Date(Date.now() + 15 * 60000).toISOString(), change, impacts, options, inputs, unresolvedTrainerIds: changed.unresolvedTrainerIds,
    limitations: ['Flight status is traveler-reported. Seats, fares, airline connection requirements and rebooking eligibility require verification.', 'Recovery changes only this plan’s remaining visits. Other shared commitments and completed history stay reserved.', 'Alternate airport pairs require a new itinerary with routed transfers. No meetings or bookings have changed yet.'] };
  if (await db.workspaceRevision(workspaceId) !== revision) throw new Error('The calendar changed during analysis. Refresh and build recovery options again.');
  await db.tx.add(recoveryTable(workspaceId), [preview]);
  return publicRecovery(preview);
}
export function publicRecovery(preview: StoredRecovery): RecoveryPreview { const { inputs: _inputs, receipt: _receipt, ...result } = preview; return result; }

export async function approveRecovery(workspaceId: string, previewId: string, optionId: string, acknowledge: boolean, monitor: boolean, board: ScenarioBoard) {
  const [preview] = await db.get<StoredRecovery>(recoveryTable(workspaceId), [previewId]);
  if (!preview) throw new Error('Recovery preview not found in this workspace.');
  if (preview.receipt) { if (preview.receipt.optionId !== optionId) throw new Error('Another option from this preview is already applied.'); return { ...preview.receipt, replayed: true }; }
  const option = preview.options.find(item => item.id === optionId);
  if (!option?.scenario.feasible || !acknowledge) throw new Error('Review the consequences and select a complete recovery option before approving.');
  if (option.readiness?.constraints.some(step => step.marginMinutes !== null && step.marginMinutes < 0)) throw new Error('A supplied journey requirement is missed. Resolve the timing or pickup requirement and rebuild recovery.');
  if (Date.parse(preview.expiresAt) <= Date.now() || option.evidence.some(item => item.state === 'current' && evidenceState(item) !== 'current')) throw new Error('Recovery evidence or preview expired. Build fresh options.');
  const context = await planContext(workspaceId, preview.reportId, board);
  if (context.pendingChange?.id !== preview.changeId) throw new Error('The reported flight change was resolved or replaced. Refresh before approving.');
  const now = new Date().toISOString(), sourceTrips = board.trips!.filter(trip => context.tripIds.includes(trip.id));
  const remaining = option.scenario.visits;
  const trips = [...sourceTrips];
  for (const trainerId of option.scenario.trainerIds) if (!trips.some(trip => trip.trainerId === trainerId || trip.trainer === board.trainerProfiles.find(profile => profile.id === trainerId)!.name)) {
    const profile = board.trainerProfiles.find(profile => profile.id === trainerId)!;
    trips.push({ id: 'recovery_trip_' + randomUUID(), title: 'Recovered field plan · ' + profile.name, trainerId: profile.id, trainer: profile.name,
      startDate: preview.options[0].report.startDate, endDate: preview.options[0].report.endDate, arrivalAirport: context.input.arrivalAirport, status: 'Planned', stops: [], notes: '', createdAt: now, updatedAt: now });
  }
  const visitUpdates = remaining.map(visit => {
    const before = context.pending.find(item => item.managerId === visit.managerId)!;
    if (!before) throw new Error('A proposed visit is no longer pending in the saved plan.');
    const profile = board.trainerProfiles.find(profile => profile.id === visit.trainerId)!;
    const trip = trips.find(trip => trip.trainerId === profile.id || trip.trainer === profile.name)!;
    return { id: before.id, if: { updatedAt: before.updatedAt, status: before.status }, record: { ...before, ...visit, trainer: profile.name,
      tripId: trip.id, status: 'Rescheduled', recoveryId: preview.id, updatedAt: now } };
  });
  const activeTripIds: string[] = [];
  const tripChanges = trips.map(trip => {
    const finalVisits = [...(board.visits || []).filter(visit => visit.tripId === trip.id && visit.status === 'Completed'), ...visitUpdates.filter(update => update.record.tripId === trip.id).map(update => update.record)];
    const dates = finalVisits.map(visit => visit.date).sort();
    const hasPending = visitUpdates.some(update => update.record.tripId === trip.id);
    if (hasPending || finalVisits.length) activeTripIds.push(trip.id);
    return { id: trip.id, record: { ...trip, scenarioReportId: preview.reportId, recoveryId: preview.id,
      startDate: dates[0] || trip.startDate, endDate: dates.at(-1) || trip.endDate, status: hasPending ? 'Planned' : finalVisits.length ? trip.status : 'Canceled',
      stops: finalVisits.map(visit => ({ managerId: visit.managerId, stateCode: visit.stateCode, date: visit.date, location: visit.location || '' })),
      evidence: option.evidence, notes: trip.notes + '\nRecovery reviewed: ' + option.consequences.join(' '), updatedAt: now } };
  });
  const receipt = { optionId, tripIds: activeTripIds, updatedVisits: visitUpdates.length };
  const operations = [db.tx.update('atlas_visits_' + workspaceId, visitUpdates, { patch: true }), db.tx.update('atlas_trips_' + workspaceId, tripChanges),
    db.tx.update(reportTable(workspaceId), [{ id: preview.reportId, record: { currentPlan: { input: preview.inputs[optionId], report: option.report, scenario: option.scenario, tripIds: activeTripIds, recoveryId: preview.id, unresolvedTrainerIds: preview.unresolvedTrainerIds || [] } } }], { patch: true }),
    db.tx.update(recoveryTable(workspaceId), [{ id: preview.id, record: { receipt }, if: { receipt: undefined } }], { patch: true }),
    db.tx.update(changeTable(workspaceId), [{ id: preview.changeId, record: { state: 'applied', appliedRecoveryId: preview.id }, if: { state: 'pending' } }], { patch: true }),
    ...(await watchReplacementOperations(workspaceId, context.tripIds))];
  if (monitor) operations.push(queueWatch(workspaceId, option.report, activeTripIds));
  try {
    await db.transact(operations, workspaceGuard(workspaceId, preview.workspaceRevision, 'Calendar changed after review.'));
  } catch (failure) {
    const [fresh] = await db.get<StoredRecovery>(recoveryTable(workspaceId), [preview.id]);
    if (fresh?.receipt?.optionId === optionId) return { ...fresh.receipt, replayed: true };
    throw failure;
  }
  return { ...receipt, replayed: false };
}
