import { existsSync, readFileSync } from 'node:fs';
import { workspacePath } from '../runtime/paths';

export type RoutingManifest = { version: 1; endpoint: string; installedAt: string; dataDate: string; sha256: string; regions: string[];
  sources: string[]; polygons: Array<{ outer: number[][]; holes: number[][][] }>; image: string };
export function routingConfiguration() {
  const provider = process.env.ATLAS_ROUTING_PROVIDER || 'osrm';
  if (!['osrm', 'openrouteservice'].includes(provider)) throw new Error('ATLAS_ROUTING_PROVIDER must be osrm or openrouteservice.');
  if (provider === 'openrouteservice') return { provider, endpoint: process.env.ATLAS_ORS_API_KEY ? 'https://api.openrouteservice.org/v2/matrix/driving-car' : '', graph: null };
  const path = workspacePath(`${process.env.ATLAS_DATA_DIR || 'artifacts/field-sales-atlas/data'}/routing/service.json`);
  let graph: RoutingManifest | null = null;
  if (existsSync(path)) {
    try {
      const value = JSON.parse(readFileSync(path, 'utf8')) as RoutingManifest;
      if (value.version === 1 && /^https?:\/\//.test(value.endpoint) && /^[a-f0-9]{64}$/.test(value.sha256) && Array.isArray(value.polygons) && value.polygons.length && Array.isArray(value.regions)) graph = value;
    } catch { /* An invalid manifest cannot establish graph coverage. */ }
  }
  const endpoint = process.env.ATLAS_ROUTING_URL || graph?.endpoint || '';
  if (graph && endpoint.replace(/\/$/, '') !== graph.endpoint.replace(/\/$/, '')) graph = null;
  return { provider, endpoint, graph };
}
function ringContains(lon: number, lat: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [previousX, previousY] = ring[j];
    if (((y > lat) !== (previousY > lat)) && lon < (previousX - x) * (lat - y) / (previousY - y) + x) inside = !inside;
  }
  return inside;
}
export function withinRoutingCoverage(lat: number, lon: number, graph: RoutingManifest) {
  return graph.polygons.some(polygon => ringContains(lon, lat, polygon.outer) && !polygon.holes.some(hole => ringContains(lon, lat, hole)));
}
export function publicRoutingStatus() {
  const { provider, endpoint, graph } = routingConfiguration();
  if (provider === 'openrouteservice') return { provider, configured: !!endpoint, graph: null,
    scope: 'Hosted driving-car road matrix; no live traffic, border queues or road closures.',
    limitation: endpoint ? 'Credentials are present; a successful matrix probe is still required. Hosted graph age and coverage are not independently verified; account quotas apply.' : 'Set ATLAS_ORS_API_KEY in Replit Secrets, then validate a sample route.' };
  return { provider, configured: !!endpoint, graph: graph ? { installedAt: graph.installedAt, dataDate: graph.dataDate, sha256: graph.sha256, regions: graph.regions, sources: graph.sources } : null,
    scope: 'Road-network estimates; traffic, border queues and road closures are excluded.', limitation: !endpoint ? 'No road graph or maintained endpoint is configured.' : !graph ? 'The endpoint is configured, but its graph version and regional coverage have not been verified by this app.' : 'Routes outside the installed extract are unavailable. OpenStreetMap data may omit recent road changes.' };
}
