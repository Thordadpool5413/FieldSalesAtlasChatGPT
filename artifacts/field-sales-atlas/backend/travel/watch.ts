import { randomUUID, createHash } from 'node:crypto';
import { db } from '../runtime/sdk';
import type { ScenarioReport } from '../../shared/travel/types';
import { lookupAirports } from '../providers/airports';
import { publicAirportEvidence } from '../providers/publicTravel';

const table = 'atlas_journey_watches_v1';
type Watch = { id: string; workspaceId: string; airport: string; tripIds: string[]; endDate: string; nextRun: string; leaseUntil: string; version: string;
  state: 'queued' | 'current' | 'incomplete' | 'stopped' | 'complete'; attempts: number; fingerprint?: string; reviewedAt?: string;
  review?: { id: string; at: string; message: string; evidence: ScenarioReport['evidence'] } };
export function queueWatch(workspaceId: string, report: ScenarioReport, tripIds: string[]) {
  const record: Watch = { id: randomUUID(), workspaceId, airport: report.arrivalAirport, tripIds, endDate: report.endDate,
    nextRun: new Date().toISOString(), leaseUntil: '', version: randomUUID(), state: 'queued', attempts: 0 };
  return db.tx.add(table, [record]);
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
        const trips = watch.tripIds.length ? await db.get<{ status: string }>('atlas_trips_' + watch.workspaceId, watch.tripIds) : [];
        if ((watch.tripIds.length && trips.every(trip => !trip || trip.status !== 'Planned')) || watch.endDate < new Date(now - 86400000).toISOString().slice(0, 10)) {
          await db.tx.update(table, [{ id: watch.id, record: { state: 'complete', leaseUntil: '', version: randomUUID() }, if: { version } }], { patch: true });
          continue;
        }
        const [airport] = await lookupAirports([watch.airport]);
        if (!airport) throw new Error('Airport reference unavailable.');
        const signals = await publicAirportEvidence(airport);
        const evidence = signals.map(result => result.evidence);
        const incomplete = evidence.some(item => item.state !== 'current');
        const notices = signals.filter(result => ['FAA NAS', 'NWS alerts'].includes(result.evidence.provider)).flatMap(result => result.data || []);
        const message = incomplete ? 'Some public sources could not be verified. Open your airline and official airport updates before acting.' : notices.length ? 'Public notices changed. Review the evidence and your itinerary; flight impact has not been confirmed.' : 'Current airport and weather snapshots checked. Individual flight status remains unverified.';
        const fingerprint = createHash('sha256').update(JSON.stringify({ states: evidence.map(item => [item.id, item.state]), notices })).digest('hex');
        const attempts = incomplete ? watch.attempts + 1 : 0;
        await db.tx.update(table, [{ id: watch.id, if: { version }, record: { state: incomplete ? 'incomplete' : 'current', fingerprint, attempts,
          reviewedAt: new Date().toISOString(), leaseUntil: '', version: randomUUID(), nextRun: new Date(now + Math.min(3600000, incomplete ? 60000 * 2 ** Math.min(attempts, 6) : 15 * 60000)).toISOString(),
          review: fingerprint === watch.fingerprint && watch.review ? { ...watch.review, evidence } : { id: randomUUID(), at: new Date().toISOString(), message, evidence } } }], { patch: true });
      } catch {
        await db.tx.update(table, [{ id: watch.id, if: { version }, record: { state: 'incomplete', leaseUntil: '', version: randomUUID(), attempts: watch.attempts + 1,
          nextRun: new Date(now + 15 * 60000).toISOString(), review: { id: randomUUID(), at: new Date().toISOString(), message: 'Review could not complete. No flight-status conclusion is available.', evidence: [] } } }], { patch: true });
      }
    }
  } finally { active = false; }
}
