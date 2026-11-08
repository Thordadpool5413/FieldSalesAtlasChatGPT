import Papa from 'papaparse';
import { createHash } from 'node:crypto';
import { db } from '../runtime/sdk';
import { STARTER_AIRPORTS, type Airport } from '../../src/data';
import { CANADA_STARTER_AIRPORTS } from '../../src/CanadaRegions';

const table = 'atlas_airport_reference_global';
const sourceUrl = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';
type ReferenceAirport = Airport & { id: string; country: string; referenceVersion?: string };
type Head = { retrievedAt: string; checksum: string; count: number; sourceUrl: string; migrated?: boolean };
type Refresh = { lastAttemptAt: string; retryAfter: string; lastError: string | null };
let pending: Promise<Head> | null = null;

export function refreshAirportReference(): Promise<Head> {
  if (pending) return pending;
  pending = (async () => {
    const lastAttemptAt = new Date().toISOString();
    try {
      const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error('Airport reference returned HTTP ' + response.status);
      const text = await response.text();
      if (text.length > 30_000_000) throw new Error('Airport source exceeds the supported size.');
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      const records = new Map<string, ReferenceAirport>();
      for (const row of parsed.data) {
        if (!/^[A-Z]{3}$/.test(row.iata_code || '') || row.type === 'closed') continue;
        const lat = Number(row.latitude_deg), lon = Number(row.longitude_deg);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || records.has(row.iata_code)) continue;
        // One global reference serves both map browsing and itinerary lookup.
        records.set(row.iata_code, { id: row.iata_code, iata: row.iata_code, icao: row.icao_code || row.gps_code || row.ident,
          name: (row.name || '').slice(0, 180), lat, lon, country: row.iso_country,
          state: row.iso_region?.split('-').at(-1) || '', scheduled: row.scheduled_service === 'yes',
          tier: row.type === 'large_airport' ? 'Major' : row.type === 'medium_airport' ? 'Secondary' : 'Regional' });
      }
      if (records.size < 1000 || records.size > 15000 || records.get('MCO')?.country !== 'US' || records.get('YYZ')?.country !== 'CA') throw new Error('Airport reference identity/coverage validation failed.');
      const retrievedAt = new Date().toISOString(), checksum = createHash('sha256').update(text).digest('hex');
      const head = { retrievedAt, checksum, count: records.size, sourceUrl, attribution: 'OurAirports public reference data' };
      await db.transact([
        db.tx.update(table, [...records.values()].map(record => ({ id: record.id, record: { ...record, referenceVersion: checksum } }))),
        db.tx.update(table, [{ id: '_head', record: head }, { id: '_refresh', record: { lastAttemptAt, retryAfter: new Date(Date.now() + 6 * 3600000).toISOString(), lastError: null } }]),
      ]);
      return head;
    } catch (failure) {
      await db.tx.update(table, [{ id: '_refresh', record: { lastAttemptAt, retryAfter: new Date(Date.now() + 15 * 60000).toISOString(), lastError: failure instanceof Error ? failure.message : 'Airport refresh failed.' } }]);
      throw failure;
    }
  })().finally(() => { pending = null; });
  return pending;
}

// Upgrade the old map-only snapshot without changing its original retrieval time.
// Migrated data stays explicitly stale until an official refresh succeeds.
async function referenceHead(): Promise<Head | null> {
  const [existing] = await db.get<Head>(table, ['_head']);
  if (existing) return existing;
  type LegacyHead = { revision: string; checkedAt: string; count: number; chunks: number };
  const [old] = await db.get<LegacyHead>('atlas_public_airports_snapshot', ['head']);
  if (!old || old.count < 150 || old.count > 6000 || old.chunks < 2 || old.chunks > 80 || !Number.isFinite(Date.parse(old.checkedAt))) return null;
  const pages = await db.get<{ revision: string; airports: ReferenceAirport[] }>('atlas_public_airports_snapshot', Array.from({ length: old.chunks }, (_, i) => 'part_' + i));
  if (pages.some(p => !p || p.revision !== old.revision || !Array.isArray(p.airports))) return null;
  const rows = pages.flatMap(p => p!.airports);
  if (rows.length !== old.count || new Set(rows.map(r => r.iata)).size !== old.count || rows.some(r => !/^[A-Z]{3}$/.test(r.iata) || !Number.isFinite(r.lat) || !Number.isFinite(r.lon) || Math.abs(r.lat!) > 90 || Math.abs(r.lon!) > 180)) return null;
  const checksum = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const head: Head = { retrievedAt: old.checkedAt, count: rows.length, checksum, sourceUrl, migrated: true };
  const canada = new Set('AB BC MB NB NL NS NT NU ON PE QC SK YT'.split(' '));
  await db.transact([db.tx.update(table, rows.map(r => ({ id: r.iata, record: { ...r, country: r.country || (canada.has(r.state || '') ? 'CA' : 'US'), referenceVersion: checksum } }))), db.tx.update(table, [{ id: '_head', record: head }])]);
  return head;
}

export async function curatedAirportDirectory() {
  let head = await referenceHead();
  let [refresh] = await db.get<Refresh>(table, ['_refresh']);
  let mode: 'source' | 'memory' | 'snapshot' = 'snapshot';
  if (!refresh || refresh.retryAfter <= new Date().toISOString()) {
    try { head = await refreshAirportReference(); mode = 'source'; } catch { /* Keep the last complete reference and its source time. */ }
    [refresh] = await db.get<Refresh>(table, ['_refresh']);
  }
  const airports: ReferenceAirport[] = [];
  if (head) {
    let nextToken: string | undefined;
    do {
      const page = await db.list<ReferenceAirport>(table, { limit: 1000, nextToken });
      airports.push(...page.items.filter(row => row.referenceVersion === head!.checksum && ['US', 'CA'].includes(row.country) && (row.scheduled || row.tier === 'Major' || row.tier === 'Secondary')));
      nextToken = page.nextToken;
    } while (nextToken);
  }
  const stale = !head || !!head.migrated || !!refresh?.lastError || !Number.isFinite(Date.parse(head.retrievedAt)) || Date.now() - Date.parse(head.retrievedAt) > 24 * 3600000;
  return { available: airports.length > 0, airports, checkedAt: head?.retrievedAt || '', checksum: head?.checksum || null,
    sourceUrl, stale, mode, message: !airports.length ? 'Public directory unavailable. Use the limited starter reference.' : stale ? 'Using the last stored airport reference; freshness is unverified.' : 'Validated public airport reference',
    limitation: 'Airport reference data does not establish airline service, flight schedules or seat availability.', lastAttemptAt: refresh?.lastAttemptAt, lastError: refresh?.lastError || null };
}
export async function lookupAirports(codes: string[]): Promise<Airport[]> {
  const unique = [...new Set(codes)];
  const head = await referenceHead();
  const rows = await db.get<ReferenceAirport>(table, unique);
  const fallback = [...STARTER_AIRPORTS, ...CANADA_STARTER_AIRPORTS];
  return unique.flatMap((code, i) => {
    const row = rows[i];
    const found = row && row.referenceVersion === head?.checksum ? row : fallback.find(airport => airport.iata === code);
    return found ? [found] : [];
  });
}
export async function airportReferenceStatus() {
  const head = await referenceHead();
  const [refresh] = await db.get<Refresh>(table, ['_refresh']);
  return head ? { ...head, refresh, stale: !!head.migrated || !!refresh?.lastError || Date.now() - Date.parse(head.retrievedAt) > 24 * 3600000 } : null;
}
