import Papa from 'papaparse';
import { createHash } from 'node:crypto';
import { db } from '../runtime/sdk';
import { STARTER_AIRPORTS, type Airport } from '../../src/data';
import { CANADA_STARTER_AIRPORTS } from '../../src/CanadaRegions';

const table = 'atlas_airport_reference_global';
export async function refreshAirportReference() {
  const url = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';
  const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error('Airport reference returned HTTP ' + response.status);
  const text = await response.text();
  if (text.length > 30_000_000) throw new Error('Airport source exceeds the supported size.');
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const rows = parsed.data.filter(row => /^[A-Z]{3}$/.test(row.iata_code || '') && row.scheduled_service === 'yes' && row.type !== 'closed');
  const records = new Map<string, Airport & { id: string; country: string }>();
  for (const row of rows) {
    const lat = Number(row.latitude_deg), lon = Number(row.longitude_deg);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (records.has(row.iata_code)) continue;
    records.set(row.iata_code, { id: row.iata_code, iata: row.iata_code, icao: row.gps_code || row.ident, name: row.name.slice(0, 180), lat, lon, country: row.iso_country,
      state: row.iso_region?.split('-').at(-1) || '', scheduled: true, tier: row.type === 'large_airport' ? 'Major' : row.type === 'medium_airport' ? 'Secondary' : 'Regional' });
  }
  if (records.size < 1000 || records.size > 15000 || !records.has('MCO') || !records.has('YYZ')) throw new Error('Airport reference identity/coverage validation failed.');
  const retrievedAt = new Date().toISOString(), checksum = createHash('sha256').update(text).digest('hex');
  await db.transact([
    db.tx.update(table, [...records.values()].map(record => ({ id: record.id, record: { ...record, referenceVersion: checksum } }))),
    db.tx.update(table, [{ id: '_head', record: { retrievedAt, checksum, count: records.size, sourceUrl: url, attribution: 'OurAirports public reference data' } }]),
  ]);
  return { retrievedAt, checksum, count: records.size, sourceUrl: url };
}
export async function lookupAirports(codes: string[]): Promise<Airport[]> {
  const unique = [...new Set(codes)];
  const rows = await db.get<Airport & { referenceVersion?: string }>(table, unique);
  const [head] = await db.get<{ checksum: string }>(table, ['_head']);
  const fallback = [...STARTER_AIRPORTS, ...CANADA_STARTER_AIRPORTS];
  return unique.flatMap((code, i) => {
    const row = rows[i];
    const found = row && row.referenceVersion === head?.checksum ? row : fallback.find(airport => airport.iata === code);
    return found ? [found] : [];
  });
}
export async function airportReferenceStatus() { const [head] = await db.get<{ retrievedAt: string; checksum: string; count: number; sourceUrl: string }>(table, ['_head']); return head; }
