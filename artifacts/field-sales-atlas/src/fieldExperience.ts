/** Small, deterministic rules shared by the field dashboard and trip handoff. */
export type FieldPerson = {
  id: string;
  name: string;
  trainer: string;
  baseState?: string;
  baseCity?: string;
  coachingStatus?: string;
  cadence?: string;
};
export type FieldVisit = {
  id: string;
  managerId: string;
  date: string;
  status: string;
  trainer?: string;
  stateCode: string;
};
export type FieldAssignment = { managerId: string; stateCode: string };
export type FieldCommitment = {
  managerId: string;
  dueDate: string;
  status: string;
};

export function localDay(now: Date = new Date()): string {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')].join('-');
}

export function uniqueManagerIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(id => typeof id === 'string' && id.trim().length > 0))];
}

export function requestedManagerIds(request: {
  managerId?: string;
  managerIds?: string[];
}): string[] {
  return uniqueManagerIds(request.managerIds?.length
    ? request.managerIds : request.managerId ? [request.managerId] : []);
}

/** A pin visibility setting must never change actual territory membership. */
export function territoryPeople<T extends FieldPerson>(
  people: readonly T[], assignments: readonly FieldAssignment[], stateCode: string,
): T[] {
  const assigned = new Set(assignments.filter(a => a.stateCode === stateCode).map(a => a.managerId));
  return people.filter(person => person.baseState === stateCode || assigned.has(person.id));
}

export type NextMove<T extends FieldPerson, V extends FieldVisit> =
  | { kind: 'empty' }
  | { kind: 'unassigned'; count: number }
  | { kind: 'visit'; person: T; visit: V; stateCode: string }
  | { kind: 'attention'; person: T; stateCode: string; reason: string };

/** Saved visits take priority. Suggestions are explained, never fabricated. */
export function nextFieldMove<T extends FieldPerson, V extends FieldVisit>(options: {
  people: readonly T[];
  visits: readonly V[];
  assignments: readonly FieldAssignment[];
  commitments: readonly FieldCommitment[];
  trainer: string;
  today: string;
}): NextMove<T, V> {
  const { people, visits, assignments, commitments, trainer, today } = options;
  if (!people.length) return { kind: 'empty' };
  const byId = new Map(people.map(person => [person.id, person]));
  const scheduled = visits.filter(visit => {
    const person = byId.get(visit.managerId);
    return Boolean(person) && ['Planned', 'Rescheduled'].includes(visit.status)
      && visit.date >= today && (visit.trainer || person?.trainer) === trainer;
  }).slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
const candidates = people.filter(person =>
    person.trainer === trainer && person.coachingStatus !== 'Paused'
  );
  if (!candidates.length) return { kind: 'unassigned', count: people.length };
  const scheduledIds = new Set(scheduled.map(item => item.managerId));
  const cadenceDays: Record<string, number> = {
    Monthly: 30,
    'Every 6 weeks': 42,
    Quarterly: 90
  };
  const dayDelta = (from: string, to: string) => {
    const a = Date.parse(from.slice(0, 10) + 'T12:00:00Z');
    const b = Date.parse(to.slice(0, 10) + 'T12:00:00Z');
    return Number.isFinite(a) && Number.isFinite(b)
      ? Math.max(0, Math.floor((b - a) / 86400000)) : null;
  };
  const ranked = candidates.map(person => {
    const overdue = commitments.filter(item => item.managerId === person.id &&
      item.status === 'Open' && item.dueDate && item.dueDate < today).length;
    const flagged = person.coachingStatus === 'Needs attention';
    const onboarding = person.coachingStatus === 'Onboarding';
    const lastVisit = visits.filter(item =>
      item.managerId === person.id && item.status === 'Completed'
    ).map(item => item.date).sort().at(-1);
    const age = lastVisit ? dayDelta(lastVisit, today) : null;
    const cadence = cadenceDays[person.cadence || ''] || 0;
    const cadenceDue = age !== null && cadence > 0 && age >= cadence;
    const unvisited = !lastVisit;
    const score = Math.min(135, overdue * 55) +
      (flagged ? 45 : 0) + (onboarding ? 30 : 0) +
      (cadenceDue ? 28 + Math.min(22, Math.floor((age - cadence) / 14) * 5) : 0) +
      (unvisited ? 13 : 0) -
      (scheduledIds.has(person.id) ? 55 : 0);
    const reasons = [
      overdue ? overdue + ' overdue coaching follow-up' + (overdue === 1 ? '' : 's') : '',
      flagged ? 'Marked for support' : '',
      onboarding ? 'Onboarding support' : '',
      cadenceDue ? 'Coaching cadence due' : '',
      unvisited ? 'No completed visit recorded' : ''
    ].filter(Boolean);
    return { person, score, reason: reasons.slice(0, 2).join(' · ') || 'No upcoming visit scheduled' };
  }).sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name));
  const first = ranked[0];
  // Immediate visits are the primary action; genuinely urgent overdue
  // commitments can outrank visits scheduled for much later in the week.
  const nextVisit = scheduled[0];
  const immediate = nextVisit && (dayDelta(today, nextVisit.date) ?? 99) <= 2;
  if (nextVisit && (immediate || first.score < 55)) {
    const person = byId.get(nextVisit.managerId)!;
    return {
      kind: 'visit', person, visit: nextVisit,
      stateCode: nextVisit.stateCode || person.baseState ||
        assignments.find(a => a.managerId === person.id)?.stateCode || ''
    };
  }
  return {
    kind: 'attention', person: first.person, reason: first.reason,
    stateCode: first.person.baseState ||
      assignments.find(a => a.managerId === first.person.id)?.stateCode || ''
  };
}

export type AirportHealth = { code: string; level: 'critical' | 'caution' | 'none' | 'unknown' };
/** Missing airport observations are unknown, not evidence of normal operations. */
export function backupRiskRank(signal?: AirportHealth): number {
  if (!signal) return 2;
  return signal.level === 'none' ? 0 : signal.level === 'caution' ? 1 : signal.level === 'unknown' ? 2 : 3;
}

/** A conservative suggested order for saved, geocoded manager locations.
    Never call this a driving route or an airline travel-time estimate. */
export function sequenceCircuit<T extends {id:string;lat?:number;lon?:number}>(people:readonly T[]):{
  people:T[];straightLineMiles:number|null;unmapped:number;
}{
  const mapped=people.filter(person=>typeof person.lat==='number'&&Number.isFinite(person.lat)&&
    typeof person.lon==='number'&&Number.isFinite(person.lon));
  const unmapped=people.filter(person=>!mapped.includes(person));
  if(mapped.length<2)return {people:[...people],straightLineMiles:null,unmapped:unmapped.length};
  const length=(a:T,b:T)=>{
    const p=Math.PI/180;
    const dLat=(b.lat!-a.lat!)*p,dLon=(b.lon!-a.lon!)*p;
    const v=Math.sin(dLat/2)**2+Math.cos(a.lat!*p)*Math.cos(b.lat!*p)*Math.sin(dLon/2)**2;
    return 3958.8*2*Math.asin(Math.min(1,Math.sqrt(v)));
  };
  let best:T[]=[];
  let bestMiles=Number.POSITIVE_INFINITY;
  for(const first of mapped){
    const remaining=mapped.filter(person=>person.id!==first.id);
    const order=[first];
    let miles=0;
    while(remaining.length){
      const prev=order[order.length-1];
      remaining.sort((a,b)=>length(prev,a)-length(prev,b));
      const next=remaining.shift()!;
      miles+=length(prev,next);
      order.push(next);
    }
    if(miles<bestMiles){bestMiles=miles;best=order;}
  }
  return {people:[...best,...unmapped],straightLineMiles:+bestMiles.toFixed(1),unmapped:unmapped.length};
}
