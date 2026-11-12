
import type { Airport,Coaching,Manager,Visit } from './opsModels';
import { coachingPriority,distanceMiles } from './opsModels';
import type { FlightQuote,Gateway,TravelPlan,TravelPrefs,TripPlanning } from './TravelLogic';
import { roadCircuit,roadTransfer,minutesLabel,money } from './TravelLogic';

const isoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
const timeNumber = (value: string) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};
const timeString = (minutes: number) =>
  String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');

const isoDays = (start: string, end: string, includeWeekends: boolean): string[] => {
  if (!isoDate(start) || !isoDate(end) || start > end) return [];
  const cursor = new Date(start + 'T12:00:00Z');
  const stop = new Date(end + 'T12:00:00Z');
  const result: string[] = [];
  for (let count = 0; cursor <= stop && count < 45; count++) {
    const weekday = cursor.getUTCDay();
    if (includeWeekends || (weekday !== 0 && weekday !== 6)) {
      result.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
};
export type ScheduledVisit = {
  manager: Manager; date: string; start: string; end: string;
  travelBeforeMinutes: number | null; fromLocation: string;
};
export type CoachingSchedule = {
  status: 'needs-managers' | 'no-days' | 'overbooked' | 'conditional';
  visits: ScheduledVisit[];
  unplaced: Manager[];
  days: string[];
  drivingMinutes: number;
  unknownLegs: number;
  coachedMinutes: number;
  warnings: string[];
  first?: ScheduledVisit; last?: ScheduledVisit;
};
export function getPlanning(plan: TravelPlan): Required<TripPlanning> {
  const raw = plan.planning || {};
  const begin = plan.departDate || '';
  const finish = plan.returnDate || '';
  const first = raw.firstCoachingDate && raw.firstCoachingDate >= begin && raw.firstCoachingDate <= finish
    ? raw.firstCoachingDate : begin;
  const last = raw.lastCoachingDate && raw.lastCoachingDate >= begin && raw.lastCoachingDate <= finish
    ? raw.lastCoachingDate : finish;
  return {
    firstCoachingDate: first,
    lastCoachingDate: last < first ? first : last,
    dayStart: timeNumber(raw.dayStart || '') !== null ? raw.dayStart! : '09:00',
    dayEnd: timeNumber(raw.dayEnd || '') !== null ? raw.dayEnd! : '17:00',
    sessionMinutes: Math.min(480, Math.max(30, Number(raw.sessionMinutes) || 150)),
    breakMinutes: Math.min(180, Math.max(0, Number.isFinite(Number(raw.breakMinutes)) ? Number(raw.breakMinutes) : 30)),
    includeWeekends: !!raw.includeWeekends,
    arrivalToCoachingBufferMinutes: Math.min(240, Math.max(0, Number.isFinite(Number(raw.arrivalToCoachingBufferMinutes)) ? Number(raw.arrivalToCoachingBufferMinutes) : 30)),
  };
}
export function buildCoachingSchedule(
  plan: TravelPlan, airport: Airport | undefined,
  managers: Manager[], prefs: TravelPrefs
): CoachingSchedule {
  const p = getPlanning(plan);
  const warnings: string[] = [];
  const selected = managers.filter(m => plan.managerIds.includes(m.id));
  const days = isoDays(p.firstCoachingDate, p.lastCoachingDate, p.includeWeekends);
  const empty = (status: CoachingSchedule['status']): CoachingSchedule =>
    ({ status, visits: [], unplaced: selected, days, drivingMinutes: 0,
      coachedMinutes: 0, unknownLegs: 0, warnings });
  if (!selected.length) return empty('needs-managers');
  if (days.length === 0) {
    warnings.push('No coaching days are available. Expand the dates or include weekend days.');
    return empty('no-days');
  }
  const start = timeNumber(p.dayStart);
  const end = timeNumber(p.dayEnd);
  if (start === null || end === null || end <= start || end - start < p.sessionMinutes) {
    warnings.push('The coaching workday is shorter than one visit. Change the working hours or visit length.');
    return empty('no-days');
  }
  const circuit=airport?roadCircuit(airport,selected,prefs):null;
  if(!circuit){warnings.push('Road-network travel times are unavailable for this circuit. No visit timings were assigned. Configure or refresh routing before scheduling.');return empty('overbooked');}
  const ordered = circuit.path;
  const appointments: ScheduledVisit[] = [];
  const unplaced: Manager[] = [];
  let currentDay = 0;
  let cursor = start;
  let lastLocation: { lat: number; lon: number; label: string } | null =
    airport && Number.isFinite(airport.lat) && Number.isFinite(airport.lon)
      ? { lat: airport.lat!, lon: airport.lon!, label: airport.iata + ' airport' } : null;
  let drive = 0;
  let unknownLegs = 0;
  for (const manager of ordered) {
    let placed = false;
    while (currentDay < days.length) {
      const known = Number.isFinite(manager.lat) && Number.isFinite(manager.lon);
      const roadMinutes = known && lastLocation
        ? roadTransfer(lastLocation,manager,prefs)?.minutes ?? null
        : null;
      if(roadMinutes===null){unknownLegs++;break;}
      const transfer = roadMinutes;
      const extra = appointments.length && cursor !== start ? p.breakMinutes : 0;
      const beginning = cursor + transfer + extra;
      const returnMinutes=roadTransfer(manager,airport!,prefs)?.minutes;
      if (returnMinutes!==undefined && beginning + p.sessionMinutes + returnMinutes <= end) {
        appointments.push({
          manager, date: days[currentDay], start: timeString(beginning),
          end: timeString(beginning + p.sessionMinutes), travelBeforeMinutes: roadMinutes,
          fromLocation: lastLocation?.label || 'Location not mapped',
        });
        cursor = beginning + p.sessionMinutes;
        drive += transfer;
        if (roadMinutes === null) unknownLegs += 1;
        lastLocation = known
          ? { lat: manager.lat!, lon: manager.lon!, label: manager.baseCity || manager.name } : null;
        placed = true;
        break;
      }
      if(lastLocation&&cursor!==start)drive+=roadTransfer(lastLocation,airport!,prefs)?.minutes || 0;
      currentDay++;
      cursor = start;
      lastLocation={lat:airport!.lat!,lon:airport!.lon!,label:airport!.iata+' airport area'};
    }
    if (!placed) unplaced.push(manager);
  }
  if(lastLocation&&cursor!==start)drive+=roadTransfer(lastLocation,airport!,prefs)?.minutes || 0;
  if (unknownLegs) warnings.push(unknownLegs + ' location transfer(s) could not be estimated because coordinates are missing.');
  if (appointments.some(v => v.date === plan.departDate)) warnings.push('Some coaching is planned on the flight departure day. Verify your actual arrival time.');
  if (appointments.some(v => v.date === plan.returnDate)) warnings.push('Some coaching is planned on your return travel day. Verify the flight departure cutoff.');
  if (appointments.length > 1) warnings.push('Hotel location and real traffic are not included. Multi-day travel remains an estimate.');
  if (unplaced.length) warnings.push(unplaced.length + ' manager visit(s) do not fit the selected working days.');
  if (!airport) warnings.push('Choose an arrival airport to calculate the first ground transfer.');
  return {
    status: unplaced.length ? 'overbooked' : 'conditional',
    visits: appointments, unplaced, days, drivingMinutes: drive,
    unknownLegs, coachedMinutes: appointments.length * p.sessionMinutes, warnings,
    first: appointments[0], last: appointments[appointments.length - 1],
  };
}
export type FlightWindow = {
  status: 'risk' | 'conditional' | 'not-checkable';
  lines: string[];
  earliestFirstMeeting?: string;
  latestFinalMeetingEnd?: string;
};
export function checkFlightWindows(
  quote: FlightQuote, schedule: CoachingSchedule,
  prefs: TravelPrefs, plan: TravelPlan, airports: Airport[],
): FlightWindow {
  const messages: string[] = [];
  if (!schedule.first || !schedule.last) return { status: 'not-checkable', lines: ['Add mapped manager visits to check flight-to-coaching timing.'] };
  const p = getPlanning(plan);
  const first = schedule.first;
  const last = schedule.last;
  const arrival = quote.outboundArrivalLocal || '';
  const departure = quote.returnDepartureLocal || '';
  let risky = false;
  if (!arrival) {
    messages.push('Enter actual outbound arrival date/time to check the first coaching visit.');
  } else if (arrival.slice(0, 10) > first.date) {
    risky = true;
    messages.push('Flight arrival is after the first planned coaching date.');
  } else if (arrival.slice(0, 10) === first.date) {
    if (first.travelBeforeMinutes !== null) {
      const arrivalMin = timeNumber(arrival.slice(11,16));
      const meetingMin = timeNumber(first.start);
      if (arrivalMin !== null && meetingMin !== null) {
        const readyAt = arrivalMin + prefs.rentalPickupMinutes + first.travelBeforeMinutes + p.arrivalToCoachingBufferMinutes;
        if (readyAt > meetingMin) {
          risky = true;
          messages.push('First visit is scheduled before the estimated airport-to-coaching arrival time (' + timeString(Math.min(1439,readyAt)) + ').');
        } else messages.push('First visit clears the entered arrival buffer by approximately ' + minutesLabel(meetingMin - readyAt) + '.');
      }
    } else messages.push('Cannot calculate the first visit transfer without mapped locations.');
  } else messages.push('Inbound flight arrives before the first coaching day.');
  if (!departure) {
    messages.push('Enter the return flight departure date/time to check the final coaching visit.');
  } else if (departure.slice(0,10) < last.date) {
    risky = true;
    messages.push('Return flight departs before the last planned coaching day.');
  } else if (departure.slice(0,10) === last.date) {
    const lastAirport = airports.find(a => a.iata === (quote.returnOrigin || quote.destination));
    const endMin = timeNumber(last.end);
    const departMin = timeNumber(departure.slice(11,16));
    if (lastAirport && Number.isFinite(lastAirport.lat) && Number.isFinite(lastAirport.lon) &&
        Number.isFinite(last.manager.lat) && Number.isFinite(last.manager.lon) &&
        endMin !== null && departMin !== null) {
      const returnDrive = roadTransfer(last.manager,lastAirport,prefs)?.minutes;
      if(returnDrive===undefined)return {status:'not-checkable',lines:[...messages,'The road-network return route is unavailable. Return-flight readiness could not be calculated.']};
      const readyBy = endMin + returnDrive + prefs.rentalReturnMinutes + prefs.checkinMinutes;
      if (readyBy > departMin) {
        risky = true;
        messages.push('Final visit ends too late for the entered return departure; estimated airport check-in readiness would be ' + timeString(Math.min(1439,readyBy)) + '.');
      } else messages.push('Final visit clears the airport return buffer by approximately ' + minutesLabel(departMin-readyBy) + '.');
    } else messages.push('Return flight cutoff cannot be estimated with missing airport or manager coordinates.');
  } else messages.push('Return flight departs after the last coaching day.');
  if (quote.connections > prefs.maxConnections) messages.push('This quote exceeds the preferred connection limit.');
  messages.push('Checks assume each entered meeting time and its airport time are in the same local time zone. Confirm time zones and real directions.');
  return { status: risky ? 'risk' : (!arrival || !departure) ? 'not-checkable' : 'conditional', lines: messages,
    earliestFirstMeeting: first.start, latestFinalMeetingEnd: last.end };
}
export type Opportunity = {
  manager: Manager; straightMiles: number; score: number;
  reasons: string[]; priority: 'High' | 'Moderate' | 'Routine';
};
export function nearbyCoachingOpportunities(
  plan: TravelPlan, managers: Manager[], visits: Visit[], notes: Coaching[],
  airport: Airport | undefined, radiusMiles: number,
): Opportunity[] {
  const selected = new Set(plan.managerIds);
  const anchors: Array<{ lat:number; lon:number }> = [];
  if (plan.destination) anchors.push(plan.destination);
  for (const m of managers.filter(m => selected.has(m.id))) {
    if (Number.isFinite(m.lat) && Number.isFinite(m.lon)) anchors.push({ lat:m.lat!, lon:m.lon! });
  }
  if (anchors.length === 0 && airport && Number.isFinite(airport.lat) && Number.isFinite(airport.lon)) {
    anchors.push({ lat:airport.lat!,lon:airport.lon! });
  }
  if (!anchors.length) return [];
  return managers.filter(m => !selected.has(m.id) && Number.isFinite(m.lat) && Number.isFinite(m.lon))
    .map(manager => {
      const straightMiles = Math.min(...anchors.map(a=>distanceMiles(a.lat,a.lon,manager.lat!,manager.lon!)));
      const priority = coachingPriority(manager,visits,notes);
      const proximity = Math.max(0, 20 - straightMiles / Math.max(1,radiusMiles)*20);
      return {manager,straightMiles,score:priority.score+proximity,
        reasons:priority.reasons,priority:priority.level};
    })
    .filter(o=>o.straightMiles<=radiusMiles)
    .sort((a,b)=>b.score-a.score||a.straightMiles-b.straightMiles)
    .slice(0,8);
}
export type AirportTradeoff = {
  gateway:Gateway;minutesDelta:number;roadDeltaMiles:number;
  timeCostDelta:number; fuelCostDelta:number; totalPenalty:number;
};
export function airportTradeoffs(gateways:Gateway[],prefs:TravelPrefs):AirportTradeoff[] {
  if (!gateways.length)return [];
  const baseline=gateways[0];
  return gateways.slice(0,8).map(g=>{
    const minutesDelta=g.planningDriveMinutes-baseline.planningDriveMinutes;
    const roadDeltaMiles=g.planningRoadMiles-baseline.planningRoadMiles;
    const timeCostDelta=minutesDelta/60*prefs.valueOfTimePerHour;
    const fuelCostDelta=roadDeltaMiles*prefs.fuelPerMile;
    return {
      gateway:g,minutesDelta,roadDeltaMiles,timeCostDelta,fuelCostDelta,
      totalPenalty:timeCostDelta+fuelCostDelta,
    };
  });
}
export function planningBrief(
  plan:TravelPlan,schedule:CoachingSchedule,airport:Airport|undefined,
  quotes:FlightQuote[]):string {
  const p=getPlanning(plan);
  const content=[
    'FIELD SALES ATLAS | COACHING TRAVEL BRIEF',
    'Plan: '+(plan.title||'Untitled travel plan'),
    'Travel window: '+plan.departDate+' to '+plan.returnDate,
    'Coaching window: '+p.firstCoachingDate+' to '+p.lastCoachingDate,
    'Coaching hours: '+p.dayStart+' to '+p.dayEnd,
    'Selected airport: '+(airport?.iata||plan.selectedArrival||'Not chosen'),
    'Managers selected: '+plan.managerIds.length,
    'Planned visits: '+schedule.visits.length,
    'Approximate in-region driving: '+minutesLabel(schedule.drivingMinutes),
    'Estimated coaching time: '+minutesLabel(schedule.coachedMinutes),
    '',
    'PLANNED VISITS (NOT APPOINTMENT CONFIRMATIONS)',
    ...schedule.visits.map((v,i)=>
      (i+1)+'. '+v.date+' '+v.start+'-'+v.end+' | '+v.manager.name+' | '+(v.manager.baseCity||'City unknown')+
      ' | Approx. transfer '+(v.travelBeforeMinutes===null?'Unknown':minutesLabel(v.travelBeforeMinutes))
    ),
    ...schedule.unplaced.map(m=>'UNSCHEDULED: '+m.name),
    '',
    'ENTERED FLIGHT QUOTES (NOT LIVE)',
    ...quotes.map(q=>q.origin+'-'+q.destination+' / return '+q.returnOrigin+
      ' | '+money(q.fare)+' entered airfare | '+q.carrier+' | '+q.source+' | checked '+q.observedOn),
    '',
    'ATTENTION ITEMS',
    ...schedule.warnings,
    'All travel times are approximate. Use real airline inventory, local time zones, confirmed meetings, verified driving routes, and company travel policy before booking.',
  ];
  return content.join('\n');
}
