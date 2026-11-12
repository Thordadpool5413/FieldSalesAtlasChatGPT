import { journeyReadiness } from './readiness';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../runtime/sdk';
import { buildScenarios, normalizeFlights, type ScenarioBoard } from './scenarios';
import { planContext, policyEvidence, workspaceEvidence } from './context';
import { changedContext } from './recovery';
import { interpretDeadline } from '../../shared/travel/questions';
import { addMinutes, inZone, zonedInstant } from '../../shared/travel/time';
import { lookupAirports } from '../providers/airports';
import { zoneAt } from './zones';
import type { AssistantAnswer } from '../../shared/travel/intelligence';

export const assistantInput = z.object({ reportId: z.string().min(1).max(100), question: z.string().trim().min(3).max(600),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), deadlineTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  allowHandoffs: z.boolean().default(false) });
export async function answerTravelQuestion(workspaceId: string, request: z.infer<typeof assistantInput>, board: ScenarioBoard): Promise<AssistantAnswer> {
  const revision = board.revision ?? await db.workspaceRevision(workspaceId);
  if (await db.workspaceRevision(workspaceId) !== revision) throw new Error('The calendar changed. Refresh before asking again.');
  const context = await planContext(workspaceId, request.reportId, board);
  const workEvidence = workspaceEvidence(board, revision), policy = policyEvidence(context.input);
  const answer: AssistantAnswer = { id: randomUUID(), question: request.question, createdAt: new Date().toISOString(), workspaceRevision: revision,
    verdict: 'unknown', title: 'More evidence is needed to answer this trip question.', claims: [], missing: [], assumptions: [], evidence: [workEvidence, policy], trainers: [], followups: [] };
  const deadline = interpretDeadline(request.question, context.input.startDate, context.input.endDate, request.deadlineDate, request.deadlineTime);
  if (deadline.clarification || !deadline.date || !deadline.time) return { ...answer, verdict: 'clarification', title: deadline.clarification || 'Choose an exact deadline.', followups: ['Set the deadline date and, optionally, a local time below.'] };
  if (deadline.date < context.input.startDate) return { ...answer, verdict: 'clarification', title: 'The return-home deadline precedes the selected field period.', followups: ['Choose a deadline in or after this plan’s field period.'] };
  answer.deadlineDate = deadline.date; answer.assumptions = deadline.assumptions || [];
  if (deadline.assumedEndOfDay) answer.assumptions.push('With no requested clock time, “home Thursday” means home by 23:59 that day.');
  answer.assumptions.push('The assistant evaluates the supplied itinerary and saved constraints. It does not search live seats or book flights.');
  const changed = context.pendingChange ? await changedContext(context, context.pendingChange) : { input: context.input, board: context.analysisBoard, unavailable: false };
  if (context.pendingChange) {
    answer.pendingChangeId = context.pendingChange.id; answer.evidence.push(context.pendingChange.evidence);
    answer.claims.push({ text: 'A pending traveler-reported flight change is included in this calculation; the saved calendar has not yet been revised.', evidenceIds: [context.pendingChange.evidence.id, workEvidence.id], limitation: context.pendingChange.evidence.limitation });
  }
  const input = { ...changed.input, endDate: deadline.date < changed.input.endDate ? deadline.date : changed.input.endDate,
    allowHandoffs: request.allowHandoffs, checkPublicSources: true };
  let scheduleFits = true, routingUnknown=false;
  if (input.managerIds.length) {
    const report = await buildScenarios(input, changed.board, revision);
    routingUnknown=report.routingVerified===false;
    const scenario = report.scenarios.find(item => item.feasible) || report.scenarios[0];
    answer.scenario = scenario; scheduleFits = scenario.feasible;
    answer.evidence.push(...report.evidence);
    answer.claims.push({ text: `${scenario.visits.length} of ${input.managerIds.length} remaining visits fit the supplied field windows through ${input.endDate}.`, evidenceIds: [workEvidence.id, policy.id, ...report.evidence.filter(item => ['estimate', 'traveler'].includes(item.kind)).map(item => item.id)], limitation: scenario.feasible ? 'This is a proposed schedule with the disclosed routing and itinerary assumptions.' : 'This does not establish that no alternative flight or itinerary could work.' });
    answer.missing.push(...scenario.gaps);
  } else answer.claims.push({ text: 'This saved plan has no remaining planned or rescheduled visits.', evidenceIds: [workEvidence.id] });
  const airports = await lookupAirports(input.flights.flatMap(flight => [flight.origin, flight.destination]));
  const flights = normalizeFlights(input.flights, airports);
  for (const flight of flights) answer.evidence.push({ id: 'traveler-flight-' + flight.trainerId + '-' + flight.origin + '-' + flight.departure,
    provider: 'Saved traveler itinerary', subject: `${flight.origin}–${flight.destination}`, sourceUrl: '', kind: 'traveler', state: 'reference',
    retrievedAt: flight.providedAt || context.report.createdAt, version: '1', scope: 'Supplied local dates and times, converted using airport time zones.', limitation: 'The import time is not an airline status verification. Actual operation and seat availability remain unverified.' });
  const people = board.trainerProfiles.filter(profile => context.input.trainerIds.includes(profile.id));
  for (const profile of people) {
    const visits = answer.scenario?.visits.filter(visit => visit.trainerId === profile.id) || [];
    const homeFlight = flights.filter(flight => flight.trainerId === profile.id && profile.homeAirports.includes(flight.destination)).at(-1);
    const row: AssistantAnswer['trainers'][number] = { id: profile.id, name: profile.name, visitCount: visits.length, meetsDeadline: null };
    if (!homeFlight) answer.missing.push(`${profile.name}: no usable return flight to a saved home airport is supplied. Home-by-${deadline.date} cannot be confirmed.`);
    else {
      const homeZone = homeFlight.arrivalZone || zoneAt(airports.find(airport => airport.iata === homeFlight.destination)?.lat, airports.find(airport => airport.iata === homeFlight.destination)?.lon);
      const access = profile.homeDriveMinutes[homeFlight.destination];
      if (homeZone && Number.isFinite(access) && access >= 0) {
        row.timeZone = homeZone; row.deadline = zonedInstant(deadline.date, deadline.time, homeZone);
        row.homeArrival = addMinutes(homeFlight.arrival, input.arrivalMinutes + access);
        const local = inZone(row.homeArrival, homeZone); row.homeLocal = `${local.date} ${local.time}`;
        row.meetsDeadline = Date.parse(row.homeArrival) <= Date.parse(row.deadline);
        const flightEvidenceId = 'traveler-flight-' + homeFlight.trainerId + '-' + homeFlight.origin + '-' + homeFlight.departure;
        answer.claims.push({ text: `${profile.name}: estimated home arrival is ${row.homeLocal} (${homeZone}), using the supplied flight arrival plus ${input.arrivalMinutes} minutes of arrival processing and ${access} minutes of saved airport-to-home travel.`, evidenceIds: [workEvidence.id, policy.id, flightEvidenceId], limitation: 'Flight operation, baggage/arrival processing, home access and traffic still require verification.' });
      } else answer.missing.push(`${profile.name}: home-airport time zone or airport-to-home duration is unresolved.`);
    }
    answer.trainers.push(row);
  }
  const knownLate = answer.trainers.some(row => row.meetsDeadline === false);
  const unknownHome = answer.trainers.some(row => row.meetsDeadline === null);
  answer.verdict = knownLate || (!scheduleFits&&!routingUnknown) ? 'not-with-current-itinerary' : unknownHome || routingUnknown ? 'unknown' : 'provisional';
  answer.title = answer.verdict === 'not-with-current-itinerary' ? 'The supplied itinerary does not meet this goal.' : answer.verdict === 'unknown' ? 'The return-home goal still needs evidence.' : 'Your supplied timings fit the deadline.';
  const readiness = await journeyReadiness(input, changed.board, answer.scenario?.visits || context.pending, { date: deadline.date, time: deadline.time });
  answer.readiness = readiness.readiness;
  const missedRequirements = readiness.readiness.constraints.filter(item => item.marginMinutes !== null && item.marginMinutes < 0 && item.kind !== 'home');
  if (missedRequirements.length) {
    answer.verdict = 'not-with-current-itinerary';
    answer.title = 'A supplied journey requirement does not fit this itinerary.';
    answer.missing.push(...missedRequirements.map(item => item.label + ': resolve the timing or supplied requirement before relying on this plan.'));
  }
  answer.evidence.push(...readiness.evidence);
  answer.missing = [...new Set(answer.missing)];
  answer.evidence = answer.evidence.filter((item, index, all) => all.findIndex(other => other.id === item.id) === index);
  answer.followups = [unknownHome || knownLate ? 'Supply a return itinerary that reaches each trainer’s home airport by the requested deadline.' : 'Verify flight operation and confirm the proposed appointments.',
    request.allowHandoffs ? 'Review the proposed trainer assignments before changing the calendar.' : 'Allow trainer handoffs to compare whether sharing the remaining visits helps.',
    context.pendingChange ? 'Open disruption recovery to review and explicitly apply any calendar changes.' : 'Use a reviewed travel preview to apply changes; this answer has not edited the calendar.'];
  if (await db.workspaceRevision(workspaceId) !== revision) throw new Error('The calendar changed during calculation. Ask again using the latest records.');
  return answer;
}
