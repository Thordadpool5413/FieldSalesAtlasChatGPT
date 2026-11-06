import type { AvailabilityBlock,Board,Manager,Priority,TrainerProfile,Trip,Visit } from './opsModels';
import { coachingPriority,distanceMiles,today } from './opsModels';

export function weekBeginning(value: string): string {
  const date = new Date(value + 'T12:00:00Z');
  if (Number.isNaN(date.getTime())) return today();
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
export function shiftDate(value: string, amount: number): string {
  const date = new Date(value + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
type Grade = 'critical' | 'review';
export type CoordinationIssue = {
  id: string; grade: Grade; title: string; detail: string; date: string;
  trainer: string; visit?: Visit; trip?: Trip;
};
export type TrainerDay = {
  date: string; visits: Visit[]; trips: Trip[]; blocks:AvailabilityBlock[];
  status: 'open' | 'field' | 'travel' | 'unavailable';
};
export type TrainerLoad = {
  profile: TrainerProfile; visits: Visit[]; trips: Trip[];
  days: TrainerDay[]; openDays: number; fieldDays: number;
};
export type CoverageNeed = {
  manager: Manager; stateCode: string; owner: TrainerProfile | null;
  priority: Priority; reason: string; kind: 'ownership' | 'coaching' | 'location';
  alreadyScheduledLater: boolean;
};
export type ProposedAction = {
  manager: Manager; stateCode: string; priority: Priority;
  owner: TrainerProfile | null; trainer: TrainerProfile;
  date: string; score: number; handoff: boolean;
  reasons: string[]; confidence: 'regional' | 'calendar';
  alreadyScheduledLater: boolean;
};
export type RegionalCircuit = {
  stateCode: string; people: ProposedAction[];
  groups: Array<{trainer: TrainerProfile; people: ProposedAction[]}>;
  split: boolean;
};
export type CoordinationSnapshot = {
  start: string; end: string; days: string[];
  loads: TrainerLoad[]; issues: CoordinationIssue[];
  needs: CoverageNeed[]; proposals: ProposedAction[];
  circuits: RegionalCircuit[]; mappedRegions: number; canPlan: boolean;
};
const planned = (status: string) => status === 'Planned' || status === 'Rescheduled';
const validCoords = (m: Manager): boolean =>
  Number.isFinite(m.lat) && Number.isFinite(m.lon) && Math.abs(m.lat!) <= 90 && Math.abs(m.lon!) <= 180;
const minutes = (v: string | undefined): number | null => {
  if (!v || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return null;
  const [h, m] = v.split(':').map(Number);
  return 60 * h + m;
};
const timeClash = (a: Visit, b: Visit): boolean => {
  const a0 = minutes(a.startTime), a1 = minutes(a.endTime);
  const b0 = minutes(b.startTime), b1 = minutes(b.endTime);
  return a0 !== null && a1 !== null && b0 !== null && b1 !== null &&
    a1 > a0 && b1 > b0 && a0 < b1 && b0 < a1;
};
const overlaps = (a: Trip, b: Trip): boolean =>
  a.startDate <= b.endDate && b.startDate <= a.endDate;
const tripCovers = (trip: Trip, date: string, region: string): boolean =>
  trip.startDate <= date && trip.endDate >= date &&
  (trip.stops || []).some(stop =>
    stop.stateCode === region && (!stop.date || stop.date === date));
const dateDistance = (a: string, b: string) =>
  Math.abs((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000);

export function buildCoordination(board: Board, profiles: TrainerProfile[], inputWeek: string): CoordinationSnapshot {
  const start = weekBeginning(inputWeek);
  const end = shiftDate(start, 6);
  const days = Array.from({ length: 5 }, (_, i) => shiftDate(start, i));
  const eligible = days.filter(day => day >= today());
  const managers = board.managers || [];
  const assignments = board.assignments || [];
  const visits = (board.visits || []).filter(visit => planned(visit.status));
  const trips = (board.trips || []).filter(trip => trip.status === 'Planned');
  const coaching = board.coaching || [];
  const blocked=board.availability||[];
  const byId = new Map(managers.map(manager => [manager.id, manager]));
  const trainerOfVisit = (visit: Visit) =>
    visit.trainer || byId.get(visit.managerId)?.trainer || '';
  const visibleVisits = visits.filter(visit => visit.date >= start && visit.date <= end);
  const visibleTrips = trips.filter(trip => trip.startDate <= end && trip.endDate >= start);
  const ownerFor = (manager: Manager) => profiles.find(profile => profile.name === manager.trainer) || null;
  const stateFor = (manager: Manager) =>
    manager.baseState || assignments.find(a => a.managerId === manager.id)?.stateCode || '';
  const loads: TrainerLoad[] = profiles.map(profile => {
    const ownVisits = visibleVisits.filter(visit => trainerOfVisit(visit) === profile.name);
    const ownTrips = visibleTrips.filter(trip => trip.trainer === profile.name);
    const schedule = days.map(date => {
      const dailyVisits = ownVisits.filter(visit => visit.date === date);
      const dailyTrips = ownTrips.filter(trip => trip.startDate <= date && trip.endDate >= date);
      const dailyBlocks=blocked.filter(entry=>entry.trainerId===profile.id&&
        entry.startDate<=date&&entry.endDate>=date);
      return {
        date, visits: dailyVisits, trips: dailyTrips,blocks:dailyBlocks,
        status:(dailyBlocks.length?'unavailable':
          dailyTrips.length?'travel':dailyVisits.length?'field':'open') as TrainerDay['status']
      };
    });
    return {
      profile, visits: ownVisits, trips: ownTrips, days: schedule,
      openDays: schedule.filter(day => day.date >= today() && day.status === 'open').length,
      fieldDays: schedule.filter(day => day.date >= today() && day.status !== 'open').length
    };
  });
  const issues: CoordinationIssue[] = [];
  for (const load of loads) {
    const ownTrips = load.trips;
    for (let i = 0; i < ownTrips.length; i++) {
      for (let j = i + 1; j < ownTrips.length; j++) {
        if (!overlaps(ownTrips[i], ownTrips[j])) continue;
        issues.push({
          id: 'trip-overlap-' + ownTrips[i].id + '-' + ownTrips[j].id,
          grade: 'critical', title: 'Overlapping trip plans',
          detail: ownTrips[i].title + ' and ' + ownTrips[j].title +
            ' occupy some of the same dates. Review before confirming travel.',
          date: ownTrips[i].startDate > ownTrips[j].startDate ? ownTrips[i].startDate : ownTrips[j].startDate,
          trainer: load.profile.name, trip: ownTrips[j]
        });
      }
    }
    for (const day of load.days) {
      if(day.blocks.length&&(day.visits.length||day.trips.length)){
        issues.push({
          id:'unavailable-conflict-'+load.profile.id+'-'+day.date,
          grade:'critical',title:'Scheduled work overlaps unavailable time',
          detail:load.profile.name+' is marked unavailable on '+day.date+
            ' but saved trips or coaching visits still occupy the day. Review before approving.',
          date:day.date,trainer:load.profile.name,visit:day.visits[0],trip:day.trips[0]
        });
      }
      for (let i = 0; i < day.visits.length; i++) {
        for (let j = i + 1; j < day.visits.length; j++) {
          const a = day.visits[i], b = day.visits[j];
          if (timeClash(a, b)) {
            issues.push({
              id: 'timed-' + a.id + '-' + b.id, grade: 'critical',
              title: 'Overlapping coaching times',
              detail: 'Two recorded visit time windows overlap. Adjust one visit or assign another trainer.',
              date: day.date, trainer: load.profile.name, visit: b
            });
          } else if (a.stateCode && b.stateCode && a.stateCode === b.stateCode &&
             minutes(a.startTime)!==null&&minutes(a.endTime)!==null&&
             minutes(b.startTime)!==null&&minutes(b.endTime)!==null) {
            const first=minutes(a.startTime)!<=minutes(b.startTime)!?a:b;
            const second=first===a?b:a;
            const gap=minutes(second.startTime)!-minutes(first.endTime)!;
            const firstPerson=byId.get(first.managerId),secondPerson=byId.get(second.managerId);
            if(firstPerson&&secondPerson&&validCoords(firstPerson)&&validCoords(secondPerson)){
              const airMiles=distanceMiles(firstPerson.lat!,firstPerson.lon!,secondPerson.lat!,secondPerson.lon!);
              const driveEstimate=Math.ceil(airMiles*1.3/47*60)+15;
              if(gap>=0&&gap<driveEstimate)issues.push({
                id:'travel-feasibility-'+a.id+'-'+b.id,grade:'review',
                title:'Insufficient estimated travel margin',
                detail:'Only '+gap+' minutes separate these visits. An approximate travel allowance is '+
                  driveEstimate+' minutes. Actual roads, traffic and meeting addresses remain unverified.',
                date:day.date,trainer:load.profile.name,visit:second
              });
            }
          } else if (a.stateCode && b.stateCode && a.stateCode !== b.stateCode) {
            issues.push({
              id: 'regions-' + a.id + '-' + b.id, grade: 'review',
              title: 'Same-day cross-region travel',
              detail: a.stateCode + ' and ' + b.stateCode +
                ' are on the same trainer day. Check flight and ground travel feasibility.',
              date: day.date, trainer: load.profile.name, visit: b
            });
          }
        }
      }
      for (const visit of day.visits) {
        for (const trip of day.trips) {
          const stops = (trip.stops || []).filter(stop => !stop.date || stop.date === day.date);
          if (stops.length && visit.stateCode &&
            !stops.some(stop => stop.stateCode === visit.stateCode)) {
            issues.push({
              id: 'trip-visit-' + trip.id + '-' + visit.id, grade: 'review',
              title: 'Visit outside planned trip region',
              detail: 'The scheduled visit is in ' + visit.stateCode +
                ', while the saved trip stops do not list that region on this day.',
              date: day.date, trainer: load.profile.name, visit
            });
          }
        }
      }
    }
  }
  // Overlapping travel to the same market across two trainers may be a collaboration
  // opportunity, not necessarily a violation. Surface it for human review.
  for(let i=0;i<visibleTrips.length;i++){
    for(let j=i+1;j<visibleTrips.length;j++){
      const first=visibleTrips[i],second=visibleTrips[j];
      if(first.trainer===second.trainer||!overlaps(first,second))continue;
      const regions=new Set((first.stops||[]).map(s=>s.stateCode).filter(Boolean));
      const shared=[...new Set((second.stops||[]).map(s=>s.stateCode).filter(code=>regions.has(code)))];
      if(shared.length)issues.push({
        id:'two-trainer-market-'+first.id+'-'+second.id,
        grade:'review',title:'Two trainers scheduled in the same market',
        detail:'Both trainers have overlapping travel covering '+shared.join(', ')+
          '. Consider dividing visits or combining work; the overlap may be intentional.',
        date:first.startDate>second.startDate?first.startDate:second.startDate,
        trainer:first.trainer+' / '+second.trainer,trip:second
      });
    }
  }
  for (let i = 0; i < visibleVisits.length; i++) {
    for (let j = i + 1; j < visibleVisits.length; j++) {
      const a = visibleVisits[i], b = visibleVisits[j];
      if (a.managerId !== b.managerId || dateDistance(a.date, b.date) > 2) continue;
      const name = byId.get(a.managerId)?.name || 'A manager';
      issues.push({
        id: 'duplicate-' + a.id + '-' + b.id,
        grade: a.date === b.date ? 'critical' : 'review',
        title: 'Possible redundant coaching',
        detail: name + ' has two visits within ' +
          (a.date === b.date ? 'the same day' : 'two days') +
          '. Confirm whether both sessions are intentional.',
        date: a.date > b.date ? a.date : b.date,
        trainer: [trainerOfVisit(a), trainerOfVisit(b)].filter(Boolean).join(' / '),
        visit: b
      });
    }
  }
  const deduped = [...new Map(issues.map(issue => [issue.id, issue])).values()]
    .sort((a, b) => (a.grade === b.grade ? 0 : a.grade === 'critical' ? -1 : 1) ||
      a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const needs: CoverageNeed[] = [];
  for (const manager of managers) {
    if (manager.coachingStatus === 'Paused') continue;
    const priority = coachingPriority(manager, board.visits || [], coaching);
    const owner = ownerFor(manager);
    const stateCode = stateFor(manager);
    const covered = visibleVisits.some(v => v.managerId === manager.id) ||
      visibleTrips.some(trip => (trip.stops || []).some(stop =>
        stop.managerId === manager.id && (!stop.date || (stop.date >= start && stop.date <= end))));
    const missingOwner = !owner;
    if (!missingOwner && (priority.score < 25 || covered)) continue;
    const kind: CoverageNeed['kind'] = !stateCode ? 'location' : missingOwner ? 'ownership' : 'coaching';
    const later = visits.some(v => v.managerId === manager.id && v.date > end);
    const reason = missingOwner ? 'No matching trainer owner is recorded' :
      !stateCode ? 'Manager location is incomplete' :
        priority.reasons[0] || 'Coaching review suggested';
    needs.push({
      manager, stateCode, owner, priority, kind, reason, alreadyScheduledLater: later
    });
  }
  needs.sort((a, b) =>
    (a.kind === 'ownership' ? -1 : b.kind === 'ownership' ? 1 : 0) ||
    b.priority.score - a.priority.score || a.manager.name.localeCompare(b.manager.name));
  function trainerOption(need: CoverageNeed, load: TrainerLoad) {
    const state = need.stateCode;
    const owner = need.owner;
    const relatedVisits = load.visits.filter(visit => visit.stateCode === state);
    const relatedTrips = load.trips.filter(trip =>
      (trip.stops || []).some(stop => stop.stateCode === state));
    const near = validCoords(need.manager) && load.visits.some(visit => {
      const person = byId.get(visit.managerId);
      return person && validCoords(person) &&
        distanceMiles(need.manager.lat!, need.manager.lon!, person.lat!, person.lon!) <= 125;
    });
    const daysRanked = eligible.map(date => {
      const day = load.days.find(entry => entry.date === date)!;
      const marketTrip = day.trips.some(trip => tripCovers(trip, date, state));
      const foreignTrip = day.trips.some(trip => !tripCovers(trip, date, state));
      const foreignVisit = day.visits.some(visit => visit.stateCode !== state);
      const sameVisits = day.visits.filter(visit => visit.stateCode === state).length;
      const viable = !day.blocks.length && !foreignTrip && !foreignVisit && sameVisits < 2;
      const value = !viable ? -999 :
        (marketTrip ? 75 : 0) + (sameVisits ? 23 : 0) +
        (day.status === 'open' ? 28 : 0) - sameVisits * 12;
      return { date, value, marketTrip };
    }).filter(row => row.value > -999).sort((a, b) =>
      b.value - a.value || a.date.localeCompare(b.date));
    const chosen = daysRanked[0];
    let score = (owner?.id === load.profile.id ? 36 : 0) +
      (relatedTrips.length ? 48 : 0) + (relatedVisits.length ? 25 : 0) +
      (near ? 15 : 0) + (chosen ? 11 : -80) -
      Math.min(20, load.visits.length * 4);
    const reasons: string[] = [];
    if (owner?.id === load.profile.id) reasons.push('Existing manager ownership');
    if (chosen?.marketTrip) reasons.push('Saved trip already visits this region');
    else if (relatedTrips.length) reasons.push('Regional trip is on the calendar, but date needs review');
    if (relatedVisits.length) reasons.push('Other coaching scheduled in this region');
    if (near) reasons.push('Within 125 straight-line miles of a scheduled manager');
    if (chosen?.date && !chosen.marketTrip && !relatedVisits.length) {
      reasons.push('Open day in saved field schedule');
    }
    if (!chosen) reasons.push('No available day in recorded trips, visits and unavailable blocks');
    if (reasons.length === 0) reasons.push('Possible coverage using the saved calendar');
    return {
      trainer: load.profile, date: chosen?.date || '',
      score, reasons, confidence: (relatedTrips.length || relatedVisits.length || near) ? 'regional' as const : 'calendar' as const
    };
  }
  const proposals: ProposedAction[] = needs
    .filter(need => Boolean(need.stateCode))
    .map(need => {
      const options = loads.map(load => trainerOption(need, load))
        .sort((a, b) => b.score - a.score || a.trainer.id.localeCompare(b.trainer.id));
      const best = options[0];
      if (!best) return null;
      return {
        manager: need.manager, stateCode: need.stateCode, priority: need.priority,
        owner: need.owner, trainer: best.trainer, date: best.date,
        score: need.priority.score * 2 + best.score,
        reasons: best.reasons, confidence: best.confidence,
        handoff: !!need.owner && need.owner.id !== best.trainer.id,
        alreadyScheduledLater: need.alreadyScheduledLater
      };
    }).filter((value): value is ProposedAction => value !== null)
    .sort((a, b) => b.score - a.score || a.manager.name.localeCompare(b.manager.name));
  const circuits = [...new Set(proposals.map(row => row.stateCode))]
    .map(stateCode => {
      const people = proposals.filter(row => row.stateCode === stateCode && !!row.date);
      const groups = profiles.map(trainer => ({
        trainer, people: people.filter(row => row.trainer.id === trainer.id)
      })).filter(group => group.people.length > 0);
      return { stateCode, people, groups, split: groups.length > 1 };
    })
    .filter(group => group.people.length > 1)
    .sort((a, b) => Number(b.split) - Number(a.split) ||
      b.people.reduce((sum, row) => sum + row.priority.score, 0) -
      a.people.reduce((sum, row) => sum + row.priority.score, 0)).slice(0, 6);
  const mappedRegions = new Set([
    ...managers.map(manager => manager.baseState),
    ...assignments.map(assignment => assignment.stateCode)
  ].filter(Boolean)).size;
  return {
    start, end, days, loads, issues: deduped, needs, proposals, circuits,
    mappedRegions, canPlan: eligible.length > 0
  };
}
