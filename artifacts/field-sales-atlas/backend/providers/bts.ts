import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Evidence, FlightInput } from '../../shared/travel/types';

function open() {
  const file = resolve(process.env.ATLAS_DATA_DIR || 'data', 'bts.sqlite');
  return existsSync(file) ? new DatabaseSync(file, { readOnly: true }) : null;
}
export function historyCoverage() {
  const connection = open();
  if (!connection) return { state: 'unavailable', periods: [], limitation: 'No direct BTS monthly dataset is installed. Historical reliability is unknown.' };
  try { return { state: 'historical', periods: connection.prepare('SELECT period,source_url AS sourceUrl,sha256,imported_at AS importedAt,rows FROM datasets ORDER BY period').all(),
    limitation: 'U.S. reporting-carrier domestic flights only; publication lag and coverage exclusions apply. Historical outcomes are not live status or a prediction.' }; }
  finally { connection.close(); }
}
export function routeHistory(origin: string, destination: string, carrier = '', flightNumber = '') {
  const coverage = historyCoverage(), connection = open();
  if (!connection) return { coverage, summary: null, state: 'unavailable' };
  try {
    const rows = connection.prepare(`SELECT cancelled,diverted,arrival_delay FROM flights WHERE origin=? AND destination=?${carrier ? ' AND carrier=?' : ''}${flightNumber ? ' AND number=?' : ''}`)
      .all(origin, destination, ...(carrier ? [carrier] : []), ...(flightNumber ? [String(Number(flightNumber))] : []));
    const cancellationKnown = rows.filter(row => row.cancelled !== null);
    const completed = rows.filter(row => row.cancelled === 0 && row.diverted === 0 && typeof row.arrival_delay === 'number');
    const delays = completed.map(row => Number(row.arrival_delay)).sort((a, b) => a - b);
    const enough = rows.length >= 30;
    return { coverage, state: enough ? 'historical' : rows.length ? 'sparse' : 'unavailable', summary: {
      origin, destination, carrier: carrier || null, flightNumber: flightNumber || null, sampleSize: rows.length, outcomeSampleSize: completed.length,
      cancellationSampleSize: cancellationKnown.length,
      cancelled: cancellationKnown.filter(row => row.cancelled === 1).length,
      diverted: rows.filter(row => row.diverted === 1).length,
      cancellationRate: enough && cancellationKnown.length >= 30 ? cancellationKnown.filter(row => row.cancelled === 1).length / cancellationKnown.length : null,
      onTimeRate: completed.length >= 30 ? completed.filter(row => Number(row.arrival_delay) < 15).length / completed.length : null,
      medianArrivalDelayMinutes: completed.length >= 30 ? delays[Math.floor((delays.length - 1) * .5)] : null,
      p90ArrivalDelayMinutes: completed.length >= 30 ? delays[Math.ceil((delays.length - 1) * .9)] : null,
      definition: 'On-time means arrival delay under 15 minutes among completed, non-diverted flights with reported arrival delay. Rates require at least 30 eligible observations.',
    } };
  } finally { connection.close(); }
}

export function itineraryHistory(flights: FlightInput[]): { evidence: Evidence[]; notes: string[] } {
  const coverage = historyCoverage();
  const periods = coverage.periods as Array<{ period: string; sourceUrl: string; sha256: string; importedAt: string }>;
  const id = 'bts-' + createHash('sha256').update(JSON.stringify(periods.map(period => [period.period, period.sha256]))).digest('hex').slice(0, 20);
  const evidence: Evidence = { id, provider: 'U.S. DOT / BTS', subject: 'Imported reporting-carrier flight outcomes', sourceUrl: periods.at(-1)?.sourceUrl || 'https://www.transtats.bts.gov/ONTIME/',
    kind: 'historical', state: periods.length ? 'reference' : 'unavailable', retrievedAt: periods.map(period => period.importedAt).sort().at(-1) || '', version: id,
    validFrom: periods[0]?.period ? periods[0].period + '-01T00:00:00Z' : undefined,
    scope: periods.length ? `Reporting months: ${periods.map(period => period.period).join(', ')}. U.S. domestic reporting carriers only.` : 'No official monthly dataset is installed.',
    limitation: coverage.limitation + ' Data-import age is distinct from the reporting period. Rates require 30 eligible observations; missing coverage is unknown.' };
  const unique = flights.filter((flight, index, all) => all.findIndex(other => other.origin === flight.origin && other.destination === flight.destination && other.carrier === flight.carrier) === index);
  const notes = periods.length ? unique.map(flight => {
    const summary = routeHistory(flight.origin, flight.destination, flight.carrier).summary;
    return `${flight.origin}–${flight.destination}${flight.carrier ? ' / ' + flight.carrier : ''}: ${summary?.sampleSize || 0} matching historical records; ${summary?.outcomeSampleSize || 0} eligible arrival outcomes. ${summary?.cancellationRate === null || summary?.cancellationRate === undefined ? 'Cancellation-rate evidence is insufficient.' : 'Observed cancellation rate ' + (summary.cancellationRate * 100).toFixed(1) + '%.'} This is not a prediction or evidence of today’s service.`;
  }) : ['BTS historical outcomes are unavailable; no reliability score or replacement-flight availability was inferred.'];
  return { evidence: [evidence], notes };
}
