import { createHash } from 'node:crypto';
import type { FlightInput, Evidence } from '../../shared/travel/types';
import { connectionConstraints, createReadinessReport, type ReadinessConstraint, type ReadinessReport } from '../../shared/travel/readiness';
import { addMinutes, elapsedMinutes, zonedInstant } from '../../shared/travel/time';
import { lookupAirports } from '../providers/airports';
import { roadMatrix } from '../providers/routing';
import { normalizeFlights, type ScenarioBoard, type ScenarioInput } from './scenarios';
import { zoneAt } from './zones';

export function itineraryVersion(flights: FlightInput[]) {
  return createHash('sha256').update(JSON.stringify(flights)).digest('hex');
}
function flightEvidence(flights: FlightInput[]): Evidence[] {
  return flights.map(flight => ({
    id: 'itinerary-' + itineraryVersion([flight]), provider: 'Supplied traveler itinerary',
    subject: flight.carrier + flight.flightNumber + ' ' + flight.origin + '–' + flight.destination,
    sourceUrl: '', kind: 'traveler', state: 'reference', retrievedAt: flight.providedAt || '', version: 'readiness-1',
    scope: 'Supplied flight dates/times and traveler-reported checks; airport time zones resolved from reference or explicitly supplied.',
    limitation: 'No reservation lookup, ticket issuance verification, current gate, available seats or subsequent airline changes are independently confirmed.',
  }));
}
type Visit = { managerId: string; trainerId?: string; trainer?: string; date: string; startTime?: string; endTime?: string; timeZone?: string; startInstant?: string; endInstant?: string };
export type ReadinessResult = { readiness: ReadinessReport; evidence: Evidence[]; flights: FlightInput[] };
export async function analyzeFlightReadiness(flights: FlightInput[], profiles: ScenarioBoard['trainerProfiles']): Promise<ReadinessResult> {
  const timed = normalizeFlights(flights, await lookupAirports(flights.flatMap(leg => [leg.origin, leg.destination])));
  const ids = [...new Set(flights.map(leg => leg.trainerId))];
  const trainers = ids.map(id => ({ id, name: profiles.find(profile => profile.id === id)?.name || id }));
  const constraints = trainers.flatMap(trainer => connectionConstraints(timed.filter(leg => leg.trainerId === trainer.id)));
  const readiness = createReadinessReport(timed, trainers, constraints);
  return { readiness, evidence: flightEvidence(timed), flights: timed };
}
export async function journeyReadiness(
  input: ScenarioInput, board: ScenarioBoard, visits: Visit[], deadline?: { date: string; time: string },
): Promise<ReadinessResult> {
  const airportCodes = [input.arrivalAirport, ...input.flights.flatMap(leg => [leg.origin, leg.destination])];
  const airports = await lookupAirports(airportCodes);
  const flights = normalizeFlights(input.flights, airports);
  const trainers = board.trainerProfiles.filter(profile => input.trainerIds.includes(profile.id));
  const hub = airports.find(airport => airport.iata === input.arrivalAirport);
  const people = [...new Set(visits.map(visit => visit.managerId))].map(id => board.managers?.find(person => person.id === id)).filter(person => !!person && Number.isFinite(person.lat) && Number.isFinite(person.lon));
  const points = hub && Number.isFinite(hub.lat) && Number.isFinite(hub.lon) ? [
    { id: hub.iata, name: hub.name, lat: hub.lat!, lon: hub.lon! },
    ...people.map(person => ({ id: person!.id, name: person!.name, lat: person!.lat!, lon: person!.lon! })),
  ] : [];
  const matrix = points.length > 1 ? await roadMatrix(points) : null;
  const evidence = [...flightEvidence(flights), ...(matrix ? [matrix.evidence] : [])];
  const constraints: ReadinessConstraint[] = [];
  const routeMissing = matrix && (!matrix.roadBased || matrix.evidence.state !== 'current') ? [matrix.evidence.limitation] : [];
  function visitInstant(visit: Visit, end = false) {
    const existing = end ? visit.endInstant : visit.startInstant;
    if (existing && Number.isFinite(Date.parse(existing))) return existing;
    const person = board.managers?.find(person => person.id === visit.managerId);
    const zone = visit.timeZone || zoneAt(person?.lat, person?.lon);
    const time = end ? visit.endTime : visit.startTime;
    if (!time || !zone) return undefined;
    try { return zonedInstant(visit.date, time, zone); } catch { return undefined; }
  }
  function drive(id: string, returning = false) {
    if(!matrix?.roadBased || matrix.evidence.state!=='current')return null;
    const i = points.findIndex(point => point.id === id);
    return i > 0 && matrix ? (returning ? matrix.durations[i][0] : matrix.durations[0][i]) : null;
  }
  for (const trainer of trainers) {
    const own = flights.filter(leg => leg.trainerId === trainer.id);
    const ownVisits = visits.filter(visit => visit.trainerId === trainer.id || (!visit.trainerId && visit.trainer === trainer.name)).slice().sort((a,b) => (visitInstant(a) || a.date).localeCompare(visitInstant(b) || b.date));
    constraints.push(...connectionConstraints(own, input.arrivalAirport));
    const inbound = own.find(leg => leg.destination === input.arrivalAirport);
    const outbound = own.find(leg => leg.origin === input.arrivalAirport);
    if (ownVisits.length) {
      const first = ownVisits[0], last = ownVisits.at(-1)!, firstAt = visitInstant(first), endAt = visitInstant(last, true);
      const toVisit = drive(first.managerId), toAirport = drive(last.managerId, true);
      const arrivalKnown = inbound && firstAt && toVisit !== null;
      constraints.push({ id: 'visit-' + trainer.id, trainerId: trainer.id, kind: 'visit', label: 'First visit arrival',
        marginMinutes: arrivalKnown ? Math.floor(elapsedMinutes(addMinutes(inbound.arrival, input.arrivalMinutes + toVisit), firstAt)) : null,
        at: firstAt, timeZone: inbound?.arrivalZone, latestActionLabel: 'Latest field-airport gate arrival', latestActionAt: firstAt && toVisit !== null ? addMinutes(firstAt, -toVisit - input.arrivalMinutes) : undefined,
        basis: 'Supplied flight gate arrival + ' + input.arrivalMinutes + ' min processing + ' + (toVisit ?? '?') + ' min airport-to-visit route estimate.',
        missing: arrivalKnown ? routeMissing : ['Arrival leg, timed first visit and a usable airport transfer are required.', ...routeMissing],
        evidenceIds: evidence.map(item => item.id) });
      const departureKnown = outbound && endAt && toAirport !== null;
      constraints.push({ id: 'departure-' + trainer.id, trainerId: trainer.id, kind: 'departure', label: 'Last visit to return flight',
        marginMinutes: departureKnown ? Math.floor(elapsedMinutes(addMinutes(endAt, toAirport + input.returnMinutes + input.checkinMinutes), outbound.departure)) : null,
        at: outbound?.departure, timeZone: last.timeZone || outbound?.departureZone, latestActionLabel: 'Latest finish of the last visit', latestActionAt: outbound && toAirport !== null ? addMinutes(outbound.departure, -toAirport - input.returnMinutes - input.checkinMinutes) : undefined,
        basis: 'Last visit end + ' + (toAirport ?? '?') + ' min transfer + ' + input.returnMinutes + ' min rental return + ' + input.checkinMinutes + ' min departure processing allowance.',
        missing: departureKnown ? routeMissing : ['Return leg, timed last visit and usable return transfer are required.', ...routeMissing],
        evidenceIds: evidence.map(item => item.id) });
    }
    const resource = input.requirements?.trainers.find(row => row.trainerId === trainer.id);
    if (resource?.pickup) {
      const pickup = resource.pickup, closes = zonedInstant(pickup.date, pickup.time, pickup.timeZone);
      constraints.push({ id: 'pickup-' + trainer.id, trainerId: trainer.id, kind: 'pickup', label: 'Rental pickup deadline',
        marginMinutes: inbound ? Math.floor(elapsedMinutes(addMinutes(inbound.arrival, pickup.processingMinutes), closes)) : null,
        at: closes, timeZone: pickup.timeZone, latestActionLabel: 'Latest gate arrival for pickup', latestActionAt: addMinutes(closes, -pickup.processingMinutes),
        basis: 'Traveler-supplied latest pickup time and ' + pickup.processingMinutes + ' min gate-to-counter allowance; provider opening hours not independently checked.',
        missing: inbound ? [] : ['Arrival leg required to evaluate rental pickup.'], evidenceIds: [] });
    }
    if (deadline) {
      const home = own.filter(leg => trainer.homeAirports.includes(leg.destination)).at(-1);
      const access = home ? trainer.homeDriveMinutes[home.destination] : undefined;
      const complete = home && typeof access === 'number' && Number.isFinite(access) && access >= 0;
      const homeBy = home ? zonedInstant(deadline.date, deadline.time, home.arrivalZone) : undefined;
      constraints.push({ id: 'home-' + trainer.id, trainerId: trainer.id, kind: 'home', label: 'Return-home deadline',
        marginMinutes: complete && homeBy ? Math.floor(elapsedMinutes(addMinutes(home.arrival, input.arrivalMinutes + access), homeBy)) : null,
        at: homeBy, timeZone: home?.arrivalZone, latestActionLabel: 'Latest home-airport gate arrival', latestActionAt: complete && homeBy ? addMinutes(homeBy, -input.arrivalMinutes - access) : undefined,
        basis: 'Supplied home-airport arrival + arrival allowance + saved home drive; deadline in the home-airport time zone.',
        missing: complete ? [] : ['Return flight to a saved home airport and airport-to-home duration are required.'], evidenceIds: [] });
    }
  }
  const readiness = createReadinessReport(flights, trainers, constraints, input.requirements);
  if (matrix && !matrix.roadBased) readiness.assumptions.push('Ground transfers use a geographic estimate because a drivable road-network route is not validated. Margin calculations remain provisional.');
  return { readiness, evidence, flights };
}
