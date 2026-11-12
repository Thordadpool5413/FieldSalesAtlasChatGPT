import { randomUUID, createHash } from 'node:crypto';
import { db } from '../runtime/sdk';
import type { ScenarioReport, FlightInput } from '../../shared/travel/types';
import { lookupAirports } from '../providers/airports';
import { publicAirportEvidence } from '../providers/publicTravel';
import type { SavedReport } from './context';
import { checkFlight, flightStatusConfig } from '../providers/flightStatus';
import { queueTripNotice } from './notifications';

const table = 'atlas_journey_watches_v1';
type Watch = { id: string; workspaceId: string; reportId?:string; airport: string; airports?: string[]; tripIds: string[]; endDate: string; nextRun: string; leaseUntil: string; version: string;
  monitorFlights?: boolean; state: 'queued' | 'current' | 'incomplete' | 'stopped' | 'complete'; attempts: number; fingerprint?: string; reviewedAt?: string;
  review?: { id: string; at: string; message: string; evidence: ScenarioReport['evidence'] } };
export function queueWatch(workspaceId: string, report: ScenarioReport, tripIds: string[], flights: FlightInput[] = [], monitorFlights=false) {
  const record: Watch = { monitorFlights, id: createHash('sha256').update(workspaceId+'|'+report.id+'|'+[...tripIds].sort().join('|')).digest('hex'), workspaceId, reportId:report.id, airport: report.arrivalAirport,
    airports: [...new Set([report.arrivalAirport, ...flights.flatMap(flight => [flight.origin, flight.destination])])], tripIds, endDate: report.endDate,
    nextRun: new Date().toISOString(), leaseUntil: '', version: randomUUID(), state: 'queued', attempts: 0 };
  return db.tx.update(table, [{id:record.id,record}]);
}
async function allWatches() {
  const items: Watch[] = []; let nextToken: string | undefined;
  for (let page = 0; page < 50; page++) {
    const rows = await db.list<Watch>(table, { limit: 200, nextToken });
    items.push(...rows.items); nextToken = rows.nextToken;
    if (!nextToken) return items;
  }
  throw new Error('Travel review capacity reached. Archive completed watches before scheduling more.');
}
export async function watchesFor(workspaceId: string) {
  return (await allWatches()).filter(watch => watch.workspaceId === workspaceId).map(({ workspaceId: _workspace, leaseUntil: _lease, version: _version, ...watch }) => watch);
}
export async function setFlightMonitoring(workspaceId:string,id:string,enabled:boolean){
  const [watch]=await db.get<Watch>(table,[id]);if(!watch||watch.workspaceId!==workspaceId)return false;
  const [updated]=await db.tx.update(table,[{id,if:{version:watch.version},record:{monitorFlights:enabled,nextRun:new Date().toISOString(),version:randomUUID()}}],{patch:true});return updated;
}
export async function cancelWatch(workspaceId: string, id: string) {
  const [watch] = await db.get<Watch>(table, [id]);
  if (!watch || watch.workspaceId !== workspaceId) return false;
  const [changed] = await db.tx.update(table, [{ id, record: { state: 'stopped', version: randomUUID() }, if: { version: watch.version } }], { patch: true });
  return changed;
}
export async function watchReplacementOperations(workspaceId: string, tripIds: string[]) {
  const matching = (await allWatches()).filter(watch => watch.workspaceId === workspaceId && !['stopped', 'complete'].includes(watch.state) && watch.tripIds.some(id => tripIds.includes(id)));
  return matching.length ? [db.tx.update(table, matching.map(watch => ({ id: watch.id, record: { state: 'stopped', leaseUntil: '', version: randomUUID() } })), { patch: true })] : [];
}
export async function watchItineraryOperations(workspaceId: string, tripIds: string[], flights: FlightInput[]) {
  const matching = (await allWatches()).filter(watch => watch.workspaceId === workspaceId && !['stopped', 'complete'].includes(watch.state) && watch.tripIds.some(id => tripIds.includes(id)));
  return matching.length ? [db.tx.update(table, matching.map(watch => ({ id: watch.id, record: {
    airports: [...new Set([watch.airport, ...flights.flatMap(flight => [flight.origin, flight.destination])])],
    state: 'queued', review: null, fingerprint: '', leaseUntil: '', nextRun: new Date().toISOString(), version: randomUUID(),
  } })), { patch: true })] : [];
}
let active = false;
export async function runTravelReviews(now = Date.now()) {
  if (active) return;
  active = true;
  try {
    const due = (await allWatches()).filter(watch => !['stopped', 'complete'].includes(watch.state) && Date.parse(watch.nextRun) <= now && (!watch.leaseUntil || Date.parse(watch.leaseUntil) <= now)).sort((a, b) => a.nextRun.localeCompare(b.nextRun)).slice(0, 5);
    for (const watch of due) {
      const version = randomUUID();
      const [leased] = await db.tx.update(table, [{ id: watch.id, record: { leaseUntil: new Date(now + 120000).toISOString(), version }, if: { version: watch.version } }], { patch: true });
      if (!leased) continue;
      try {
        const trips = watch.tripIds.length ? await db.get<{ status: string; scenarioReportId?: string }>('atlas_trips_' + watch.workspaceId, watch.tripIds) : [];
        if ((watch.tripIds.length && trips.every(trip => !trip || trip.status !== 'Planned')) || watch.endDate < new Date(now - 86400000).toISOString().slice(0, 10)) {
          await db.tx.update(table, [{ id: watch.id, record: { state: 'complete', leaseUntil: '', version: randomUUID() }, if: { version } }], { patch: true });
          continue;
        }
        // Existing watches predate airport lists. Resolve their saved itinerary
        // as well so an upgrade does not leave their departure/connection unchecked.
        const reportIds = [...new Set(trips.flatMap(trip => trip?.scenarioReportId || []))];
        const saved = reportIds.length ? await db.get<SavedReport>('atlas_scenarios_' + watch.workspaceId, reportIds) : [];
        const linked = saved.filter((item): item is SavedReport => !!item);
        const codes = [...new Set([watch.airport, ...(linked.length
          ? linked.flatMap(item => (item.currentPlan?.input || item.input).flights.flatMap(flight => [flight.origin, flight.destination]))
          : watch.airports || [])])];
        const airports = await lookupAirports(codes);
        if (airports.length !== new Set(codes).size) throw new Error('An itinerary airport reference is unavailable.');
        const signals = (await Promise.all(airports.map(publicAirportEvidence))).flat();
        const evidence = signals.map(result => result.evidence);
        const providerFlights=[];
        if(watch.monitorFlights&&flightStatusConfig(watch.workspaceId).configured&&flightStatusConfig().backgroundEnabled){
          const legs=linked.flatMap(item=>(item.currentPlan?.input||item.input).flights).filter(leg=>Math.abs(Date.parse(leg.departDate+'T12:00:00Z')-now)<=2*86400000).slice(0,6);
          for(const leg of legs)providerFlights.push(await checkFlight(watch.workspaceId,leg));
          evidence.push(...providerFlights.map(row=>row.evidence));
        }
        const incomplete = evidence.some(item => item.state !== 'current');
        const notices = signals.filter(result => result.evidence.state === 'current' && ['FAA NAS', 'NWS alerts', 'ECCC Weather Alerts'].includes(result.evidence.provider))
          .flatMap(result => (result.data || []).filter(signal => (!signal.validFrom || Date.parse(signal.validFrom) <= now) && (!signal.validTo || Date.parse(signal.validTo) > now)));
        const providerSummary=[...providerFlights].sort((a,b)=>Number(!!b.canceled)-Number(!!a.canceled)).map(row=>row.leg.carrier+row.leg.flightNumber+' '+row.leg.origin+'–'+row.leg.destination+': '+row.status+(row.gate?' · departure gate '+row.gate:'')+(row.arrivalGate?' · arrival gate '+row.arrivalGate:'')).join('; ');
        const message = `${codes.join(', ')} checked. ` + (incomplete ? 'Some public sources could not be verified. Open your airline and official airport updates before acting.' : notices.length ? 'Published notices are present. Review their timing and your itinerary; flight impact has not been confirmed.' : 'Current airport and weather snapshots checked. Individual flight status remains unverified.')+(providerSummary?' Provider snapshots: '+providerSummary+'. Open My Trip for exact matches, retrieval times and recovery review.':'');
        const fingerprint = createHash('sha256').update(JSON.stringify({ states: signals.map(item=>[item.evidence.id,item.evidence.state]), notices, flights:providerFlights.map(row=>[row.leg.trainerId,row.leg.origin,row.leg.destination,row.leg.departDate,row.state,row.status,row.estimatedDeparture,row.estimatedArrival,row.actualDeparture,row.actualArrival,row.gate,row.arrivalGate]) })).digest('hex');
        const initialProviderChange=providerFlights.some(row=>row.state==='matched'&&(row.canceled||/delay/i.test(row.status)));
        if((watch.fingerprint&&watch.fingerprint!==fingerprint)||(!watch.fingerprint&&(notices.length||initialProviderChange))){
          const reportId=linked[0]?.id||watch.reportId;
          if(reportId)await queueTripNotice(watch.workspaceId,reportId,watch.id+'|'+fingerprint,providerFlights.some(row=>row.state==='matched'&&row.canceled)?'A flight provider reports a cancellation':'Trip source information changed',message);
        }
        const failed=evidence.some(item=>item.state==='unavailable'||item.state==='stale'&&!!item.failureCode);
        const attempts = failed ? watch.attempts + 1 : 0;
        await db.tx.update(table, [{ id: watch.id, if: { version }, record: { state: incomplete ? 'incomplete' : 'current', fingerprint, attempts,
          airports: codes, reviewedAt: new Date().toISOString(), leaseUntil: '', version: randomUUID(), nextRun: new Date(now + Math.min(3600000, failed ? 60000 * 2 ** Math.min(attempts, 6) : 15 * 60000)).toISOString(),
          review: fingerprint === watch.fingerprint && watch.review ? { ...watch.review, evidence } : { id: randomUUID(), at: new Date().toISOString(), message, evidence } } }], { patch: true });
      } catch {
        await db.tx.update(table, [{ id: watch.id, if: { version }, record: { state: 'incomplete', leaseUntil: '', version: randomUUID(), attempts: watch.attempts + 1,
          nextRun: new Date(now + 15 * 60000).toISOString(), review: { id: randomUUID(), at: new Date().toISOString(), message: 'Review could not complete. No flight-status conclusion is available.', evidence: [] } } }], { patch: true });
      }
    }
  } finally { active = false; }
}
