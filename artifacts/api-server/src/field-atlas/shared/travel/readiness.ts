import { addMinutes, elapsedMinutes, zonedInstant } from './time';

export type FlightReview = { fieldsReviewedAt?: string; ticketingConfirmedAt?: string; airlineCheckedAt?: string };
export type ConnectionRequirements = { transferMinutes?: number; boardingCutoffMinutes?: number; ticketRelation?: 'unknown' | 'same-ticket-reported' | 'separate-tickets' };
export type TrainerRequirements = {
  trainerId: 'trainer_a' | 'trainer_b';
  transport: 'unknown' | 'independent' | 'shared-arranged' | 'shared-needs-review';
  equipment: 'unknown' | 'ready' | 'shared-arranged' | 'shared-needs-review';
  pickup?: { date: string; time: string; timeZone: string; processingMinutes: number };
};
export type JourneyRequirements = { trainers: TrainerRequirements[] };
export type ReadinessFlight = {
  trainerId?: string; carrier: string; flightNumber: string; origin: string; destination: string;
  departDate: string; departTime: string; arriveDate: string; arriveTime: string;
  departureZone?: string; arrivalZone?: string; review?: FlightReview; connection?: ConnectionRequirements;
};
export type ReadinessConstraint = {
  id: string; trainerId: string; label: string; kind: 'connection' | 'visit' | 'departure' | 'home' | 'pickup';
  marginMinutes: number | null; at?: string; latestActionAt?: string; latestActionLabel?: string; timeZone?: string;
  basis: string; missing: string[]; evidenceIds: string[];
};
export type ReadinessCheck = { id: string; trainerId: string; label: string; state: 'reported' | 'unknown' | 'attention'; detail: string; checkedAt?: string };
export type DelayTest = { delayMinutes: number; state: 'exceeds-margin' | 'within-known-margins' | 'needs-information'; affected: string[]; unknownCount: number };
export type ReadinessReport = {
  createdAt: string; verdict: 'attention' | 'needs-information' | 'provisional';
  constraints: ReadinessConstraint[]; checks: ReadinessCheck[]; assumptions: string[];
  trainers: Array<{ trainerId: string; name: string; minimumMarginMinutes: number | null; limitingStep?: string; unknownCount: number; tests: DelayTest[] }>;
};
export function flightInstants(flight: ReadinessFlight) {
  if (!flight.departureZone || !flight.arrivalZone || !flight.departDate || !flight.departTime || !flight.arriveDate || !flight.arriveTime) return null;
  const departure = zonedInstant(flight.departDate, flight.departTime, flight.departureZone);
  const arrival = zonedInstant(flight.arriveDate, flight.arriveTime, flight.arrivalZone);
  const duration = elapsedMinutes(departure, arrival);
  if (duration <= 0 || duration > 36 * 60) throw new Error('Flight arrival must follow departure in real elapsed time (at most 36 hours).');
  return { departure, arrival };
}
export function connectionConstraints(flights: ReadinessFlight[], fieldAirport?: string): ReadinessConstraint[] {
  const result: ReadinessConstraint[] = [];
  for (let i = 1; i < flights.length; i++) {
    const previous = flights[i - 1], next = flights[i], trainerId = next.trainerId || 'trainer_a';
    if ((previous.trainerId || 'trainer_a') !== trainerId) continue;
    if (fieldAirport && previous.destination === fieldAirport && next.origin === fieldAirport) continue;
    let before, after;
    try { before = flightInstants(previous); after = flightInstants(next); } catch { /* Ambiguous or invalid clocks remain unresolved. */ }
    const available = before && after ? elapsedMinutes(before.arrival, after.departure) : null;
    if (available !== null && available > 24 * 60) continue;
    const requirements = next.connection, missing: string[] = [];
    if (available === null) missing.push('Complete dates, times and unambiguous IANA time zones for both legs.');
    if (previous.destination !== next.origin) missing.push('A reviewed transfer between the two different airports.');
    if (requirements?.transferMinutes === undefined) missing.push('Arrival gate to ready-at-departure-gate allowance, including applicable baggage, security and border procedures.');
    if (requirements?.boardingCutoffMinutes === undefined) missing.push('Departure-gate boarding cutoff checked with the operating airline.');
    const known = available !== null && previous.destination === next.origin && requirements?.transferMinutes !== undefined && requirements.boardingCutoffMinutes !== undefined;
    result.push({
      id: 'connection-' + trainerId + '-' + i, trainerId, kind: 'connection',
      label: previous.destination === next.origin ? 'Connection at ' + next.origin : previous.destination + ' to ' + next.origin + ' airport transfer',
      marginMinutes: available !== null && available < 0 ? available : known ? Math.floor(available! - requirements!.transferMinutes! - requirements!.boardingCutoffMinutes!) : null,
      at: after?.departure, timeZone: next.departureZone, latestActionLabel: 'Latest inbound gate arrival',
      latestActionAt: known ? addMinutes(after!.departure, -requirements!.boardingCutoffMinutes! - requirements!.transferMinutes!) : undefined,
      basis: available === null ? 'Elapsed connection time unresolved.' : Math.round(available) + ' scheduled minutes; supplied transfer and boarding allowances, not an authoritative airline minimum connection time.',
      missing, evidenceIds: [],
    });
  }
  return result;
}
export function createReadinessReport(flights: ReadinessFlight[], trainers: Array<{ id: string; name: string }>, constraints: ReadinessConstraint[], requirements?: JourneyRequirements, now = new Date().toISOString()): ReadinessReport {
  const checks: ReadinessCheck[] = [];
  for (const trainer of trainers) {
    const own = flights.filter(f => (f.trainerId || 'trainer_a') === trainer.id);
    if (!own.length) checks.push({ id: 'itinerary-' + trainer.id, trainerId: trainer.id, label: 'Supplied itinerary', state: 'unknown', detail: 'No usable flight legs supplied for this trainer.' });
    for (const [index, leg] of own.entries()) {
      const title = leg.carrier + leg.flightNumber + ' ' + leg.origin + '–' + leg.destination;
      for (const [key, label] of [['fieldsReviewedAt', 'Itinerary fields reviewed'], ['ticketingConfirmedAt', 'Ticket issuance checked'], ['airlineCheckedAt', 'Airline details checked']] as const) {
        const at = leg.review?.[key], ms = at ? Date.parse(at) : NaN;
        const supplied = Number.isFinite(ms) && ms <= Date.parse(now) + 300000;
        checks.push({ id: trainer.id + '-' + index + '-' + key, trainerId: trainer.id, label,
          state: supplied ? 'reported' : 'unknown', checkedAt: supplied ? at : undefined,
          detail: title + (supplied ? ': traveler reports this check; not independently confirmed. Later changes remain possible.' : ': no dated traveler check is supplied.') });
      }
      if (index > 0 && (!leg.connection?.ticketRelation || leg.connection.ticketRelation === 'unknown'))
        checks.push({ id: trainer.id + '-' + index + '-ticket-relation', trainerId: trainer.id, label: 'Ticket relationship', state: 'unknown', detail: title + ': same-ticket versus separate-ticket arrangements have not been reviewed.' });
      if (leg.connection?.ticketRelation === 'separate-tickets') checks.push({ id: trainer.id + '-' + index + '-separate', trainerId: trainer.id, label: 'Separate tickets', state: 'attention', detail: title + ': confirm baggage collection/recheck, cutoffs and rebooking arrangements with the airlines; protection is not assumed.' });
    }
    const resource = requirements?.trainers.find(item => item.trainerId === trainer.id);
    for (const key of ['transport', 'equipment'] as const) {
      const value = resource?.[key] || 'unknown';
      checks.push({ id: trainer.id + '-' + key, trainerId: trainer.id, label: key === 'transport' ? 'Ground transport access' : 'Training equipment access',
        state: value === 'unknown' ? 'unknown' : value === 'shared-needs-review' ? 'attention' : 'reported',
        detail: value === 'unknown' ? 'Not reviewed. Calendar availability alone does not establish access.'
          : value === 'shared-needs-review' ? 'Shared access is unresolved; a trainer handoff needs an arrangement.'
          : value === 'shared-arranged' ? 'Traveler reports shared access arranged for this plan; reassess after changed assignments.' : 'Traveler reports access arranged for this plan.' });
    }
  }
  const rows = trainers.map(trainer => {
    const own = constraints.filter(item => item.trainerId === trainer.id);
    const known = own.filter((item): item is ReadinessConstraint & { marginMinutes: number } => item.marginMinutes !== null);
    const limiting = known.slice().sort((a,b) => a.marginMinutes - b.marginMinutes)[0];
    const unknownCount = own.filter(item => item.marginMinutes === null || item.missing.length > 0).length + checks.filter(item => item.trainerId === trainer.id && item.state === 'unknown').length;
    const tests = [30, 60, 120].map(delayMinutes => {
      const affected = known.filter(item => item.marginMinutes < delayMinutes).map(item => item.label);
      return { delayMinutes, state: affected.length ? 'exceeds-margin' : unknownCount || !known.length ? 'needs-information' : 'within-known-margins', affected, unknownCount } as DelayTest;
    });
    return { trainerId: trainer.id, name: trainer.name, minimumMarginMinutes: limiting?.marginMinutes ?? null, limitingStep: limiting?.label, unknownCount, tests };
  });
  return { createdAt: now, verdict: constraints.some(item => item.marginMinutes !== null && item.marginMinutes < 0) || checks.some(item => item.state === 'attention') ? 'attention'
    : rows.some(row => row.unknownCount > 0 || row.minimumMarginMinutes === null) ? 'needs-information' : 'provisional',
    constraints, checks, trainers: rows, assumptions: [
      'Delay tests compare an extra delay at each measured checkpoint with its margin while holding other supplied times fixed. They are not a flight forecast or a simulation of airline recovery.',
      'All margins depend on supplied schedules, processing allowances and route estimates. Gate changes, actual queues, seats and airline minimum connection times are not verified.',
      'A dated traveler check is a report of a check, not a live airline connection. Shared transport/equipment must be reassessed after a handoff.',
    ] };
}
