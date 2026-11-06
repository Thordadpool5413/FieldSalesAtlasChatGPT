import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type RoutingManifest = { version: 1; endpoint: string; installedAt: string; dataDate: string; sha256: string; regions: string[];
  sources: string[]; polygons: Array<{ outer: number[][]; holes: number[][][] }>; image: string };
export function routingConfiguration() {
  const path = resolve(process.env.ATLAS_DATA_DIR || 'data', 'routing/service.json');
  let graph: RoutingManifest | null = null;
  if (existsSync(path)) {
    try {
      const value = JSON.parse(readFileSync(path, 'utf8')) as RoutingManifest;
      if (value.version === 1 && /^https?:\/\//.test(value.endpoint) && /^[a-f0-9]{64}$/.test(value.sha256) && Array.isArray(value.polygons) && value.polygons.length && Array.isArray(value.regions)) graph = value;
    } catch { /* An invalid manifest cannot establish graph coverage. */ }
  }
  const endpoint = process.env.ATLAS_ROUTING_URL || graph?.endpoint || '';
  if (graph && endpoint.replace(/\/$/, '') !== graph.endpoint.replace(/\/$/, '')) graph = null;
  return { endpoint, graph };
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
  const { endpoint, graph } = routingConfiguration();
  return { configured: !!endpoint, graph: graph ? { installedAt: graph.installedAt, dataDate: graph.dataDate, sha256: graph.sha256, regions: graph.regions, sources: graph.sources } : null,
    scope: 'Road-network estimates; traffic, border queues and road closures are excluded.', limitation: !endpoint ? 'No road graph or maintained endpoint is configured.' : !graph ? 'The endpoint is configured, but its graph version and regional coverage have not been verified by this app.' : 'Routes outside the installed extract are unavailable. OpenStreetMap data may omit recent road changes.' };
}
