import type { Matrix, Point } from '../../shared/travel/types';
import { source, sourceId } from './evidence';
import { routingConfiguration, withinRoutingCoverage } from './routingConfig';

function miles(a: Point, b: Point) {
  const radians = (value: number) => value * Math.PI / 180;
  const dlat = radians(b.lat - a.lat), dlon = radians(b.lon - a.lon);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dlon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export async function roadMatrix(points: Point[]): Promise<Matrix> {
  if (!points.length || points.length > 26 || points.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180)) throw new Error('Routing requires 1–26 valid locations.');
  const { endpoint, graph } = routingConfiguration();
  if (graph && points.some(point => !withinRoutingCoverage(point.lat, point.lon, graph))) {
    const supported = points.flatMap((point, index) => withinRoutingCoverage(point.lat, point.lon, graph) ? [index] : []);
    const subset = supported.length > 1 ? await roadMatrix(supported.map(index => points[index])) : null;
    const expand = (matrix?: Matrix['durations']) => points.map((_, a) => points.map((__, b) => a === b ? 0 : supported.includes(a) && supported.includes(b) && matrix ? matrix[supported.indexOf(a)][supported.indexOf(b)] : null));
    return { durations: expand(subset?.durations), distances: expand(subset?.distances), roadBased: subset?.roadBased ?? true,
      evidence: { ...(subset?.evidence || { id: sourceId('OSRM coverage', graph.sha256), provider: 'OSRM road routing', subject: 'Installed graph coverage', kind: 'estimate' as const,
        sourceUrl: graph.sources[0], state: 'partial' as const, retrievedAt: graph.installedAt, version: graph.sha256, scope: 'OpenStreetMap regional road graph.' }),
        state: 'partial', limitation: 'Some locations are outside the installed routing extract. Transfers to or from those locations are unavailable; no geographic substitute is used.' } };
  }
  if (endpoint) {
    const base = new URL(endpoint.endsWith('/') ? endpoint : endpoint + '/');
    if (base.username || base.password || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(base.hostname)))) throw new Error('Configure an HTTPS routing endpoint, or a local HTTP OSRM service, without URL credentials.');
    const coords = points.map(p => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
    const response = await source<{ durations: Matrix['durations']; distances: Matrix['distances'] }>({
      provider: 'OSRM road routing', subject: points.map(p => p.lat.toFixed(5) + ',' + p.lon.toFixed(5)).join(';'),
      url: new URL('table/v1/driving/' + coords + '?annotations=duration,distance&radiuses=' + points.map(() => '1500').join(';'), base).toString(), kind: 'estimate',
      scope: 'Road-network driving estimates. Traffic, road closures and border queues are not included.',
      ttlMs: 24 * 3600000, maxAgeMs: 24 * 3600000, version: 'osrm-table-2:' + (graph?.sha256 || 'unversioned'),
      parse(value) {
        const data = value as { code?: string; durations?: unknown[][]; distances?: unknown[][]; sources?: Array<{ distance?: number }>; destinations?: Array<{ distance?: number }> };
        const valid = (matrix: unknown[][] | undefined) => Array.isArray(matrix) && matrix.length === points.length && matrix.every(row => Array.isArray(row) && row.length === points.length && row.every(v => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)));
        if (data.code !== 'Ok' || !valid(data.durations) || !valid(data.distances)) throw new Error('Invalid OSRM matrix.');
        const far = (index: number) => Number(data.sources?.[index]?.distance || 0) > 1500 || Number(data.destinations?.[index]?.distance || 0) > 1500;
        return { observedAt: new Date().toISOString(), data: { durations: data.durations!.map((row, a) => row.map((v, b) => v === null || far(a) || far(b) ? null : Math.ceil(Number(v) / 60))), distances: data.distances!.map((row, a) => row.map((v, b) => v === null || far(a) || far(b) ? null : Number(v) / 1609.344)) }, limitation: graph ? `OpenStreetMap extract: ${graph.regions.join(', ')}; source data ${graph.dataDate}; installed ${graph.installedAt}. No live traffic. © OpenStreetMap contributors, ODbL.` : 'Routing estimate calculated at retrieval; the maintained endpoint’s graph age/coverage are unknown. No live traffic. © OpenStreetMap contributors, ODbL.' };
      },
    });
    if (response.data && response.evidence.state === 'current') return { ...response.data, evidence: response.evidence, roadBased: true };
  }
  return {
    roadBased: false,
    distances: points.map(a => points.map(b => miles(a, b) * 1.3)),
    durations: points.map(a => points.map(b => a.id === b.id ? 0 : Math.ceil(miles(a, b) * 1.3 / 47 * 60))),
    evidence: { id: sourceId('geographic-estimate', points.map(p => p.id).join(',')), provider: 'Geographic fallback', subject: 'Journey transfers', sourceUrl: '', kind: 'estimate', state: 'partial', retrievedAt: new Date().toISOString(), version: 'straight-line-1', scope: 'Straight-line distance × 1.3 at an assumed 47 mph.', limitation: endpoint ? 'The configured road service is unavailable. Geographic estimates cannot establish drivable-route feasibility.' : 'No road-routing service is configured. Geographic estimates cannot establish drivable-route feasibility.' },
  };
}
