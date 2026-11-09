import { existsSync, readFileSync } from 'node:fs';
import { airportReferenceStatus, lookupAirports } from './airports';
import { publicAirportEvidence } from './publicTravel';
import { publicRoutingStatus } from './routingConfig';
import { roadMatrix } from './routing';
import { historyCoverage } from './bts';
import { maintenanceStatus } from '../runtime/jobs';
import { sourceStatuses } from './evidence';
import { workspacePath } from '../runtime/paths';
import { db } from '../runtime/sdk';
import { reconcileHistorySync } from './historySync';

function setupStatus(file: string) {
  const path = workspacePath(`${process.env.ATLAS_DATA_DIR || 'artifacts/field-sales-atlas/data'}/${file}`);
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null; } catch { return null; }
}
export async function connectionStatus() {
  const [sourceHealth] = await db.get('atlas_public_source_health', ['current']);
  const history = historyCoverage();
  return { sourceHealth, checkedAt: new Date().toISOString(), airports: await airportReferenceStatus(), history, historySync: reconcileHistorySync(setupStatus('bts-sync-status.json'), history.periods),
    maintenance: await maintenanceStatus(), sourceStatuses: await sourceStatuses(),
    routing: publicRoutingStatus(), routingSetup: setupStatus('routing/setup-status.json'),
    providers: [
      { name: 'OurAirports', purpose: 'Versioned airport reference shared by map and planner', host: 'raw.githubusercontent.com', limitation: 'Identifiers and coordinates only; a listing does not establish scheduled flights.' },
      { name: 'Official BTS', purpose: 'Direct monthly domestic flight history', host: 'transtats.bts.gov', limitation: 'Historical reporting-carrier data with publication lag and exclusions; not a forecast.' },
      { name: 'Flyerintel historical aggregates', purpose: 'Airport, route, flight-number and monthly reference cohorts', host: 'flyerintel.com', limitation: 'Independent CC BY 4.0 aggregates. Daily source checks report each dataset separately; live availability is not established.' },
      { name: 'Open checkpoint history archive', purpose: 'Bounded airport-published posted wait samples', host: 'datasets-server.huggingface.co', limitation: 'Historical, sampled posted estimates, not measured passenger waits or a real-time TSA API. Daily checks sample MCO only.' },
      { name: 'U.S. Census', purpose: 'County, place and ZIP tabulation geography', host: 'www2.census.gov', limitation: 'Reference geography, not verified visit addresses or USPS delivery ZIP codes.' },
      { name: 'FAA NAS', purpose: 'U.S. airport-wide operational notices', host: 'nasstatus.faa.gov', limitation: 'Not the status of an individual flight. Omitted airports remain unknown.' },
      { name: 'NOAA Aviation Weather', purpose: 'METAR observations and published TAF periods', host: 'aviationweather.gov', limitation: 'Only the matched reporting station and published validity period.' },
      { name: 'NWS', purpose: 'U.S. point forecasts and active alerts', host: 'api.weather.gov', limitation: 'Forecast horizons are bounded. Empty collections require usable publication metadata.' },
      { name: 'ECCC GeoMet', purpose: 'Canadian surface observations', host: 'api.weather.gc.ca', limitation: 'The specific observation collection must pass live schema validation. Canadian warnings and forecasts are separate products.' },
      { name: 'ECCC City Page Weather', purpose: 'Nearest Canadian regional forecast', host: 'api.weather.gc.ca', limitation: 'Named forecast periods do not have exact validity timestamps; not an airport aviation forecast.' },
      { name: 'ECCC Weather Alerts', purpose: 'Active Canadian regional warning polygons', host: 'api.weather.gc.ca', limitation: 'Regional query coverage only; not flight-specific status or nationwide all-clear.' },
    ], plannedIntegrations: { state: 'design-only', catalog: 'docs/architecture/aviation-connections.json', limitation: 'Research catalog entries are not active providers. Only the adapters and runtime checks listed here are connected.' }, flightStatus: { configured: false, limitation: 'No flight-specific status provider is connected. Reported flight changes are traveler-supplied; airport/weather feeds do not confirm them.' } };
}
export async function validateConnections(codes: string[], checkRouting: boolean) {
  const airports = await lookupAirports(codes);
  if (airports.length !== new Set(codes).size) throw new Error('Every requested airport must exist in the validated reference.');
  const results = await Promise.all(airports.map(async airport => ({ airport: airport.iata, checks: await publicAirportEvidence(airport) })));
  const routing = checkRouting ? await roadMatrix([{ id: 'MCO-terminal-reference', name: 'Orlando airport reference', lat: 28.4294, lon: -81.309 },
    { id: 'orlando-center-reference', name: 'Orlando city reference', lat: 28.5383, lon: -81.3792 }]) : null;
  return { ...(await connectionStatus()), results, routingProbe: routing ? { roadBased: routing.roadBased, minutes: routing.durations[0][1], evidence: routing.evidence } : null };
}
