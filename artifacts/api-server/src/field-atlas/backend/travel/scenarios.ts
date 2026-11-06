import { connectionConstraints } from '../../shared/travel/readiness';
import { flightReviewSchema, connectionSchema, journeyRequirementsSchema } from './readinessSchema';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Board, Manager, TrainerProfile } from '../../src/opsModels';
import { coachingPriority } from '../../src/opsModels';
import type { Evidence, FlightInput, JourneyLeg, Scenario, ScenarioReport, ScenarioVisit } from '../../shared/travel/types';
import { addMinutes, dateRange, elapsedMinutes, inZone, zonedInstant } from '../../shared/travel/time';
import { zoneAt } from './zones';
import { roadMatrix } from '../providers/routing';
import { lookupAirports, airportReferenceStatus } from '../providers/airports';
import { publicAirportEvidence } from '../providers/publicTravel';
import { optimize, type OptimizerInput } from './optimizer';
import { itineraryHistory } from '../providers/bts';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const iata = z.string().regex(/^[A-Z]{3}$/);
const trainerId = z.enum(['trainer_a', 'trainer_b']);
export const flightInput = z.object({ trainerId, carrier: z.string().max(3).default(''), flightNumber: z.string().max(5).default(''), origin: iata, destination: iata,
  departDate: date, departTime: clock, arriveDate: date, arriveTime: clock, departureZone: z.string().max(80).optional(), arrivalZone: z.string().max(80).optional(), fare: z.number().min(0).max(50000).nullable().optional(), providedAt: z.iso.datetime().optional(), review: flightReviewSchema.optional(), connection: connectionSchema.optional() });
export const scenarioInput = z.object({
  managerIds: z.array(z.string().min(1).max(90)).min(1).max(12), trainerIds: z.array(trainerId).min(1).max(2),
  startDate: date, endDate: date, arrivalAirport: iata,
  dayStart: clock.default('09:00'), dayEnd: clock.default('17:00'), sessionMinutes: z.number().int().min(30).max(480).default(150),
  breakMinutes: z.number().int().min(0).max(120).default(30), includeWeekends: z.boolean().default(false), allowHandoffs: z.boolean().default(false),
  checkinMinutes: z.number().int().min(30).max(240).default(105), arrivalMinutes: z.number().int().min(15).max(240).default(60), returnMinutes: z.number().int().min(0).max(180).default(45),
  hotelPerNight: z.number().min(0).max(1500).default(160), mealsPerDay: z.number().min(0).max(500).default(65), rentalPerDay: z.number().min(0).max(1000).default(68),
  checkPublicSources: z.boolean().default(false), requirements: journeyRequirementsSchema.optional(),
  flights: z.array(flightInput).max(32).default([]),
});
export type ScenarioInput = z.infer<typeof scenarioInput>;
export type ScenarioBoard = Board & { trainerProfiles: TrainerProfile[] };
type TimedFlight = FlightInput & { departure: string; arrival: string; departureZone: string; arrivalZone: string };

export function normalizeFlights(flights: FlightInput[], airports: Awaited<ReturnType<typeof lookupAirports>>): TimedFlight[] {
  return flights.map(flight => {
    const origin = airports.find(airport => airport.iata === flight.origin), destination = airports.find(airport => airport.iata === flight.destination);
    const departureZone = zoneAt(origin?.lat, origin?.lon, flight.departureZone), arrivalZone = zoneAt(destination?.lat, destination?.lon, flight.arrivalZone);
    if (!departureZone || !arrivalZone) throw new Error('A time zone could not be resolved for an imported flight. Supply explicit IANA departure/arrival zones.');
    const departure = zonedInstant(flight.departDate, flight.departTime, departureZone), arrival = zonedInstant(flight.arriveDate, flight.arriveTime, arrivalZone);
    const duration = elapsedMinutes(departure, arrival);
    if (duration <= 0 || duration > 36 * 60) throw new Error('An imported flight has invalid elapsed time after time-zone conversion.');
    return { ...flight, departure, arrival, departureZone, arrivalZone };
  }).sort((a, b) => a.departure.localeCompare(b.departure));
}

export async function buildScenarios(input: ScenarioInput, board: ScenarioBoard, revision: number): Promise<ScenarioReport> {
  if (new Set(input.managerIds).size !== input.managerIds.length || new Set(input.trainerIds).size !== input.trainerIds.length) throw new Error('Choose unique managers and trainers.');
  if (input.dayEnd <= input.dayStart) throw new Error('The workday end must follow its start.');
  const days = dateRange(input.startDate, input.endDate, input.includeWeekends);
  if (!days.length) throw new Error('No working days are available in the selected range.');
  const managers = input.managerIds.map(id => board.managers?.find(manager => manager.id === id));
  if (managers.some(manager => !manager || !Number.isFinite(manager.lat) || !Number.isFinite(manager.lon))) throw new Error('Every selected manager needs a saved, mapped base location.');
  const people = managers as Manager[];
  const profiles = input.trainerIds.map(id => board.trainerProfiles.find(profile => profile.id === id));
  if (profiles.some(profile => !profile || !profile.homeAirports.length)) throw new Error('Configure home airports for every selected trainer.');
  const trainers = profiles as TrainerProfile[];
  const airports = await lookupAirports([input.arrivalAirport, ...trainers.flatMap(profile => profile.homeAirports), ...input.flights.flatMap(flight => [flight.origin, flight.destination])]);
  const airport = airports.find(airport => airport.iata === input.arrivalAirport);
  if (!airport || !Number.isFinite(airport.lat) || !Number.isFinite(airport.lon)) throw new Error('The arrival airport is not in a validated coordinate reference.');
  const hubZone = zoneAt(airport.lat, airport.lon);
  if (!hubZone) throw new Error('Arrival-airport time zone is unresolved.');
  const zones = people.map(person => zoneAt(person.lat, person.lon, (person as Manager & { timeZone?: string }).timeZone));
  if (zones.some(zone => !zone)) throw new Error('A manager time zone is unresolved.');
  if (input.flights.some(flight => !input.trainerIds.includes(flight.trainerId as typeof input.trainerIds[number]))) throw new Error('Imported flight legs must belong to the selected trainers.');
  const flights = normalizeFlights(input.flights, airports);
  for (const profile of trainers) {
    const own = flights.filter(flight => flight.trainerId === profile.id);
    const arrivals = own.filter(flight => flight.destination === airport.iata), departures = own.filter(flight => flight.origin === airport.iata);
    if (arrivals.length > 1 || departures.length > 1) throw new Error('Use one outbound/return field-airport circuit per trainer in each preview.');
    if (arrivals[0] && departures[0] && departures[0].departure <= arrivals[0].arrival) throw new Error('The field-airport return departure must follow the arrival.');
    if (arrivals[0] && own.some(flight => flight.departure > arrivals[0].arrival && (!departures[0] || flight.departure < departures[0].departure))) throw new Error('An intervening flight interrupts the field circuit. Split it into separate previews.');
  }
  for (const profile of trainers) {
    for (const step of connectionConstraints(flights.filter(flight => flight.trainerId === profile.id), input.arrivalAirport)) {
      if (step.marginMinutes !== null && step.marginMinutes < 0) throw new Error(profile.name + ': ' + step.label + ' does not fit the supplied transfer and boarding allowances.');
    }
  }
  const base = Date.parse(input.startDate + 'T00:00:00Z') - 86400000;
  const minutesAt = (instant: string) => Math.round((Date.parse(instant) - base) / 60000);
  const instantAt = (minutes: number) => new Date(base + minutes * 60000).toISOString();
  const matrix = await roadMatrix([{ id: airport.iata, name: airport.name, lat: airport.lat!, lon: airport.lon! }, ...people.map(person => ({ id: person.id, name: person.name, lat: person.lat!, lon: person.lon! }))]);
  const gaps: string[] = [];
  const notes = ['Working days with existing trainer visits or trips are reserved, rather than assuming there is spare time around them.', 'Each field day returns to the selected airport area. A specific hotel location has not been supplied.', 'Flight availability, fares, traffic and authoritative airline minimum connection times are not supplied by the optimizer.'];
  if (!matrix.roadBased || matrix.evidence.state !== 'current') gaps.push(matrix.evidence.limitation);
  const vehicles: OptimizerInput['vehicles'] = [];
  for (const profile of trainers) {
    const ownFlights = flights.filter(flight => flight.trainerId === profile.id);
    const arrivals = ownFlights.filter(flight => flight.destination === airport.iata);
    const departures = ownFlights.filter(flight => flight.origin === airport.iata);
    const arrival = arrivals.at(0), departure = departures.at(-1);
    if (!arrival) gaps.push(`${profile.name}: no imported arrival flight to ${airport.iata}; presence at the field airport is assumed.`);
    if (!departure) gaps.push(`${profile.name}: no imported return departure from ${airport.iata}; return-flight feasibility is unverified.`);
    for (const day of days) {
      if (board.availability?.some(block => block.trainerId === profile.id && block.startDate <= day && block.endDate >= day)) continue;
      if (board.trips?.some(trip => trip.status !== 'Canceled' && ((trip as typeof trip & { trainerId?: string }).trainerId === profile.id || trip.trainer === profile.name) && trip.startDate <= day && trip.endDate >= day)) continue;
      if (board.visits?.some(visit => visit.status !== 'Canceled' && (visit.trainer === profile.name || (visit as typeof visit & { trainerId?: string }).trainerId === profile.id) && visit.date === day)) continue;
      let start = minutesAt(zonedInstant(day, input.dayStart, hubZone)), end = minutesAt(zonedInstant(day, input.dayEnd, hubZone));
      if (arrival) start = Math.max(start, minutesAt(addMinutes(arrival.arrival, input.arrivalMinutes)));
      if (departure) end = Math.min(end, minutesAt(addMinutes(departure.departure, -input.checkinMinutes - input.returnMinutes)));
      if (end - start >= input.sessionMinutes) vehicles.push({ trainerId: profile.id, date: day, start, end });
    }
  }
  const jobs: OptimizerInput['jobs'] = people.map((person, index) => {
    const owner = board.trainerProfiles.find(profile => profile.name === person.trainer);
    const windows = days.filter(day => !board.visits?.some(visit => visit.managerId === person.id && visit.date === day && visit.status !== 'Canceled')).map(day => [minutesAt(zonedInstant(day, input.dayStart, zones[index]!)), minutesAt(zonedInstant(day, input.dayEnd, zones[index]!)) - input.sessionMinutes]);
    return { id: person.id, service: input.sessionMinutes, windows: windows.filter(([a, b]) => b >= a), priority: coachingPriority(person, board.visits || [], board.coaching || []).score,
      allowed: vehicles.flatMap((vehicle, v) => input.allowHandoffs || !owner || owner.id === vehicle.trainerId ? [v] : []) };
  });
  const model: OptimizerInput = { jobs, vehicles, durations: matrix.durations, breakMinutes: input.breakMinutes, horizon: 35 * 1440 };
  const optimized = await optimize(model);
  const evidence: Evidence[] = [matrix.evidence];
  const reference = await airportReferenceStatus();
  evidence.push({ id: reference?.checksum || 'bundled-airports-2026', provider: 'OurAirports', subject: 'Airport coordinates', sourceUrl: reference?.sourceUrl || 'https://ourairports.com/data/', kind: 'reference', state: 'reference', retrievedAt: reference?.retrievedAt || '', version: reference?.checksum || 'bundled-102', scope: 'Airport reference coordinates and identifiers.', limitation: 'Reference data is not an airline schedule or an availability check.' });
  const flightLegs: JourneyLeg[] = [];
  for (const profile of trainers) {
    const own = flights.filter(flight => flight.trainerId === profile.id);
    for (const flight of own) {
      const id = 'traveler-flight-' + profile.id + '-' + flight.origin + '-' + flight.departure;
      evidence.push({ id, provider: 'Traveler-provided itinerary', subject: `${flight.origin}–${flight.destination}`, sourceUrl: '', kind: 'traveler', state: 'reference', retrievedAt: flight.providedAt || '', version: 'imported-2', scope: 'User-supplied booking fields. The supplied/retrieval time describes the import, not an airline status check.', limitation: 'Subsequent airline changes, gates and operating-carrier identity have not been independently checked. An absent import timestamp means evidence age is unknown.' });
      flightLegs.push({ kind: 'flight', label: `${profile.name}: ${flight.origin} → ${flight.destination}`, minutes: elapsedMinutes(flight.departure, flight.arrival), start: flight.departure, end: flight.arrival, timeZone: flight.arrivalZone, basis: 'Imported local times converted with explicit IANA zones.', evidenceIds: [id] });
    }
    for (const step of connectionConstraints(own, input.arrivalAirport)) {
      if (step.missing.length) gaps.push(profile.name + ': ' + step.label + ': ' + step.missing.join(' '));
    }
    if (input.allowHandoffs) {
      const resource = input.requirements?.trainers.find(item => item.trainerId === profile.id);
      if (!resource || ['unknown','shared-needs-review'].includes(resource.transport) || ['unknown','shared-needs-review'].includes(resource.equipment))
        gaps.push(profile.name + ': transport and training-equipment access need review before a handoff.');
    }
    const first = own.at(0);
    const fieldArrival = own.find(flight => flight.destination === airport.iata);
    if (fieldArrival) flightLegs.push({ kind: 'arrival-processing', label: `${profile.name}: arrival / baggage / rental buffer`, minutes: input.arrivalMinutes, start: fieldArrival.arrival, end: addMinutes(fieldArrival.arrival, input.arrivalMinutes), timeZone: hubZone, basis: 'Editable allowance; baggage, customs and rental times are not measured.', evidenceIds: [] });
    const fieldDeparture = own.find(flight => flight.origin === airport.iata);
    if (fieldDeparture) flightLegs.push({ kind: 'airport-processing', label: `${profile.name}: rental return and departure processing`, minutes: input.checkinMinutes + input.returnMinutes, start: addMinutes(fieldDeparture.departure, -input.checkinMinutes - input.returnMinutes), end: fieldDeparture.departure, timeZone: hubZone, basis: 'Your rental-return and check-in allowances; no checkpoint wait estimate.', evidenceIds: [] });
    if (first) {
      const access = profile.homeDriveMinutes[first.origin];
      if (access === undefined) gaps.push(`${profile.name}: home-to-airport access duration is unknown.`);
      flightLegs.push({ kind: 'home-access', label: `${profile.name}: home → ${first.origin}`, minutes: access ?? null, start: access === undefined ? undefined : addMinutes(first.departure, -input.checkinMinutes - access), end: addMinutes(first.departure, -input.checkinMinutes), timeZone: first.departureZone, basis: 'Your saved home-access estimate; no traffic included.', evidenceIds: [] });
      flightLegs.push({ kind: 'airport-processing', label: `${profile.name}: check-in / security buffer`, minutes: input.checkinMinutes, start: addMinutes(first.departure, -input.checkinMinutes), end: first.departure, timeZone: first.departureZone, basis: 'Editable planning allowance, not a measured checkpoint wait.', evidenceIds: [] });
      const last = own.at(-1)!;
      const returnAccess = profile.homeDriveMinutes[last.destination];
      if (returnAccess === undefined) gaps.push(`${profile.name}: final-airport to home access duration is unknown.`);
      flightLegs.push({ kind: 'home-access', label: `${profile.name}: ${last.destination} → home`, minutes: returnAccess ?? null, start: addMinutes(last.arrival, input.arrivalMinutes), end: returnAccess === undefined ? undefined : addMinutes(last.arrival, input.arrivalMinutes + returnAccess), timeZone: last.arrivalZone, basis: 'Saved home-access estimate after your arrival allowance; no traffic included.', evidenceIds: [] });
      for (let index = 1; index < own.length; index++) {
        const previous = own[index - 1], current = own[index];
        const connection = elapsedMinutes(previous.arrival, current.departure);
        if (connection < 0) throw new Error('Imported legs overlap in real elapsed time.');
        if (connection < 12 * 60 && previous.destination !== current.origin) gaps.push(`${profile.name}: transfer between ${previous.destination} and ${current.origin} has not been routed.`);
      }
    }
  }
  const signals: NonNullable<ScenarioReport['signals']> = [];
  if (input.checkPublicSources) {
    const sources = await publicAirportEvidence(airport);
    evidence.push(...sources.map(result => result.evidence));
    signals.push(...sources.flatMap(result => (result.data || []).map(signal => ({ ...signal, sourceId: result.evidence.id }))));
    if (sources.some(result => !['current', 'reference'].includes(result.evidence.state))) gaps.push('Some official operational or weather evidence is incomplete or stale.');
    const start = zonedInstant(input.startDate, '00:00', hubZone), end = zonedInstant(input.endDate, '23:59', hubZone);
    if (!sources.some(result => result.evidence.kind === 'forecast' && result.evidence.validFrom && result.evidence.validTo && result.evidence.validFrom <= start && result.evidence.validTo >= end)) gaps.push('A validated airport forecast does not cover the full field-trip period.');
  } else gaps.push('Current official weather and airport notices have not been requested for this preview.');
  const scenarios: Scenario[] = optimized.solutions.map(solution => {
    const visits: ScenarioVisit[] = [], legs: JourneyLeg[] = [...flightLegs];
    let travelMinutes = 0;
    for (const route of solution.routes) {
      const vehicle = vehicles[route.vehicle], profile = trainers.find(profile => profile.id === vehicle.trainerId)!;
      let previous = 0, previousEnd = instantAt(vehicle.start);
      for (const visit of route.visits) {
        const person = people[visit.node - 1], timeZone = zones[visit.node - 1]!;
        const startInstant = instantAt(visit.at), endInstant = addMinutes(startInstant, input.sessionMinutes), local = inZone(startInstant, timeZone), localEnd = inZone(endInstant, timeZone);
        const transfer = matrix.durations[previous][visit.node]!;
        travelMinutes += transfer;
        legs.push({ kind: 'road', label: `${profile.name}: ${previous ? people[previous - 1].name : airport.iata} → ${person.name}`, minutes: transfer, start: previousEnd, end: addMinutes(previousEnd, transfer), timeZone, basis: matrix.evidence.scope, evidenceIds: [matrix.evidence.id] });
        visits.push({ managerId: person.id, trainerId: profile.id, date: local.date, startTime: local.time, endTime: localEnd.time, timeZone, startInstant, endInstant, location: person.baseCity || '', stateCode: person.baseState || board.assignments?.find(area => area.managerId === person.id)?.stateCode || '', lat: person.lat!, lon: person.lon!, transferMinutes: transfer });
        legs.push({ kind: 'visit', label: person.name, minutes: input.sessionMinutes, start: startInstant, end: endInstant, timeZone, basis: 'Proposed appointment; acceptance has not been confirmed.', evidenceIds: [] });
        previous = visit.node; previousEnd = route.visits.at(-1) === visit ? endInstant : addMinutes(endInstant, input.breakMinutes);
      }
      const back = matrix.durations[previous][0]!;
      travelMinutes += back;
      legs.push({ kind: 'return-road', label: `${profile.name}: return to ${airport.iata} area`, minutes: back, start: previousEnd, end: addMinutes(previousEnd, back), timeZone: hubZone, basis: matrix.evidence.scope, evidenceIds: [matrix.evidence.id] });
    }
    const active = trainers.filter(profile => visits.some(visit => visit.trainerId === profile.id));
    const nights = active.reduce((total, profile) => {
      const dates = visits.filter(visit => visit.trainerId === profile.id).map(visit => visit.date).sort();
      return total + Math.max(0, (Date.parse(dates.at(-1)!) - Date.parse(dates[0])) / 86400000);
    }, 0);
    const fieldDays = nights + active.length;
    const airfareKnown = input.flights.length > 0 && input.flights.every(flight => typeof flight.fare === 'number');
    const items = [
      { label: 'Entered flight-leg costs', amount: airfareKnown ? input.flights.reduce((sum, flight) => sum + flight.fare!, 0) : null, basis: 'Traveler-entered amounts; no live fare check.' },
      { label: 'Lodging allowance', amount: nights * input.hotelPerNight, basis: `${nights} planned room-nights × your allowance; not hotel quotes.` },
      { label: 'Meals allowance', amount: fieldDays * input.mealsPerDay, basis: `${fieldDays} trainer-days × your allowance.` },
      { label: 'Rental allowance', amount: fieldDays * input.rentalPerDay, basis: 'One vehicle per active trainer; allowance only.' },
      { label: 'Baggage, parking, fuel, tolls and other fees', amount: null, basis: 'Not supplied; excluded from known subtotal.' },
    ];
    return { id: randomUUID(), title: solution.objective === 'balanced' ? 'Balanced field plan' : solution.objective === 'home' ? 'Fewer field days' : 'Compact field circuit', objective: solution.objective,
      feasible: solution.unplaced.length === 0 && visits.length === people.length, provisional: gaps.length > 0,
      reasons: [`${visits.length} of ${people.length} requested visits placed.`, `${active.length} trainers used.`, `Visit order and assignment solved jointly with ${optimized.engine}.`, 'Only known scheduling constraints were validated; evidence gaps remain separate.'],
      gaps: [...new Set(gaps)], visits, unplaced: solution.unplaced, travelMinutes, trainerIds: active.map(profile => profile.id), legs,
      budget: { currency: 'USD', knownAmount: items.reduce((sum, item) => sum + (item.amount ?? 0), 0), items, complete: items.every(item => item.amount !== null) },
    };
  });
  const history = itineraryHistory(input.flights);
  evidence.push(...history.evidence); notes.push(...history.notes);
  return { id: randomUUID(), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 15 * 60000).toISOString(), workspaceRevision: revision, startDate: input.startDate, endDate: input.endDate, arrivalAirport: airport.iata,
    scenarios, evidence, signals, notes, optimizer: optimized.engine, sourceStatus: input.checkPublicSources ? 'Requested official checks are individually labeled below.' : 'Public-source checks were not requested.' };
}
