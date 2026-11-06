import { existsSync, readFileSync } from 'node:fs';
import { airportReferenceStatus, lookupAirports } from './airports';
import { publicAirportEvidence } from './publicTravel';
import { publicRoutingStatus } from './routingConfig';
import { roadMatrix } from './routing';
import { historyCoverage } from './bts';
import { workspacePath } from '../runtime/paths';

function setupStatus(file: string) {
  const path = workspacePath(`${process.env.ATLAS_DATA_DIR || 'artifacts/field-sales-atlas/data'}/${file}`);
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null; } catch { return null; }
}
export async function connectionStatus() {
  return { checkedAt: new Date().toISOString(), airports: await airportReferenceStatus(), history: historyCoverage(), historySync: setupStatus('bts-sync-status.json'),
    routing: publicRoutingStatus(), routingSetup: setupStatus('routing/setup-status.json'),
    providers: [
      { name: 'FAA NAS', purpose: 'U.S. airport-wide operational notices', host: 'nasstatus.faa.gov', limitation: 'Not the status of an individual flight. Omitted airports remain unknown.' },
      { name: 'NOAA Aviation Weather', purpose: 'METAR observations and published TAF periods', host: 'aviationweather.gov', limitation: 'Only the matched reporting station and published validity period.' },
      { name: 'NWS', purpose: 'U.S. point forecasts and active alerts', host: 'api.weather.gov', limitation: 'Forecast horizons are bounded. Empty collections require usable publication metadata.' },
      { name: 'ECCC GeoMet', purpose: 'Canadian surface observations', host: 'api.weather.gc.ca', limitation: 'The specific observation collection must pass live schema validation. Canadian warnings and forecasts are separate products.' },
    ], flightStatus: { configured: false, limitation: 'No flight-specific status provider is connected. Reported flight changes are traveler-supplied; airport/weather feeds do not confirm them.' } };
}
export async function validateConnections(codes: string[], checkRouting: boolean) {
  const airports = await lookupAirports(codes);
  if (airports.length !== new Set(codes).size) throw new Error('Every requested airport must exist in the validated reference.');
  const results = await Promise.all(airports.map(async airport => ({ airport: airport.iata, checks: await publicAirportEvidence(airport) })));
  const routing = checkRouting ? await roadMatrix([{ id: 'MCO-terminal-reference', name: 'Orlando airport reference', lat: 28.4294, lon: -81.309 },
    { id: 'orlando-center-reference', name: 'Orlando city reference', lat: 28.5383, lon: -81.3792 }]) : null;
  return { ...(await connectionStatus()), results, routingProbe: routing ? { roadBased: routing.roadBased, minutes: routing.durations[0][1], evidence: routing.evidence } : null };
}
