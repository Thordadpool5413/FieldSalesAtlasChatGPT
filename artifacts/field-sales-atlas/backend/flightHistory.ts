/*
 * Read-only, zero-key historical aviation data.
 * These CC BY 4.0 files are independently aggregated from official US DOT BTS flight records.
 * All statistics describe past operations, never current airline schedules, seats or forecasts.
 */
type SourceName = 'airports' | 'routes' | 'flight-numbers' | 'airport-monthly';
type AnyRow = Record<string, unknown>;
type RemoteFile = {
  meta: { dataset?: string; license?: string; period?: {start?: string;end?: string}; generated?: string };
  rows: AnyRow[];
};
export type FlightMetric = {
  basis: 'flight number' | 'route' | 'airport';
  label: string;
  origin: string;
  destination: string;
  carrier: string;
  flightNumber: string;
  flights: number;
  onTimePct: number | null;
  cancelPct: number | null;
  severePct: number | null;
  avgArrivalDelay: number | null;
  medianArrivalDelay: number | null;
  departureOnTimePct: number | null;
  periodStart: string;
  periodEnd: string;
};
export type HistoryLeg = {
  origin: string;
  destination: string;
  match: FlightMetric | null;
  route: FlightMetric | null;
  airportBaseline: FlightMetric | null;
  note: string;
};
export type AltPath = {
  connection: string;
  legs: FlightMetric[];
  index: number;
  description: string;
};
type HistoryResult = {
  available: boolean;
  checkedAt: string;
  source: string;
  sourceUrl: string;
  attribution: string;
  license: string;
  period: { start: string; end: string } | null;
  sources: Array<{name: SourceName; available: boolean; records: number; periodEnd: string}>;
  legs: HistoryLeg[];
  alternatePaths: AltPath[];
  alternateArrival: HistoryLeg | null;
  selectedMonth: string;
  monthly: Array<{month: string; flights: number; onTimePct: number | null; cancelPct: number | null}>;
  notes: string[];
};
const url: Record<SourceName, string> = {
  airports: 'https://flyerintel.com/data/airports.json',
  routes: 'https://flyerintel.com/data/routes.json',
  'flight-numbers': 'https://flyerintel.com/data/flight-numbers.json',
  'airport-monthly': 'https://flyerintel.com/data/airport-monthly.json'
};
const memory = new Map<SourceName, { expiry: number; value: RemoteFile | null }>();
const running = new Map<SourceName, Promise<RemoteFile | null>>();
const iata = (value: unknown) => String(value || '').toUpperCase();
const num = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value :
  typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
const cleanNum = (value: unknown) => {
  const x = num(value);
  return x === null ? 0 : x;
};
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
function validate(name: SourceName, payload: unknown): RemoteFile {
  if (!payload || typeof payload !== 'object') throw Error('Invalid source');
  const raw = payload as Record<string, unknown>;
  const meta = raw.meta && typeof raw.meta === 'object'
    ? raw.meta as Record<string, unknown> : {};
  if (!Array.isArray(raw.rows) || raw.rows.length > 12000 || !raw.rows.every(row =>
    row && typeof row === 'object' && !Array.isArray(row))) {
    throw Error('Historical dataset missing or changed shape');
  }
  const license = String(meta.license || '');
  if (!/CC BY 4\.0/i.test(license) || String(meta.dataset || '') !== name)
    throw Error('Historical dataset license or identity was not as expected');
  const period = meta.period && typeof meta.period === 'object' ?
    meta.period as Record<string, unknown> : {};
  return {
    meta: { dataset: name, license, period: {
      start: date(period.start), end: date(period.end)
    }, generated: String(meta.generated || '') },
    rows: raw.rows as AnyRow[]
  };
}
async function load(name: SourceName): Promise<RemoteFile | null> {
  const entry = memory.get(name);
  if (entry && entry.expiry > Date.now()) return entry.value;
  const existing = running.get(name);
  if (existing) return existing;
  const task = (async (): Promise<RemoteFile | null> => {
    let value: RemoteFile | null = null;
    try {
      const response = await fetch(url[name], {
        headers: { Accept: 'application/json', 'User-Agent': 'FieldSalesAtlas/1.0 (CC BY 4.0 public data analysis)' },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw Error('Historical source unavailable');
      if (!(response.headers.get('content-type') || '').includes('json')) throw Error('Non-JSON response');
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 3500000) throw Error('File too large for bounded historical lookup');
      const raw = await response.text();
      if (raw.length > 3500000) throw Error('Response too large');
      value = validate(name, JSON.parse(raw));
    } catch {
      value = null;
    }
    if (memory.size > 10) memory.clear();
    memory.set(name, { expiry: Date.now() + (value ? 6 * 3600000 : 60000), value });
    return value;
  })().finally(() => running.delete(name));
  running.set(name, task);
  return task;
}
function mapMetric(
  row: AnyRow | undefined, basis: FlightMetric['basis'],
  origin: string, destination: string, carrier = '', flightNumber = ''
): FlightMetric | null {
  if (!row) return null;
  const flights = cleanNum(row.flights ?? row.operations);
  if (flights < 1) return null;
  return {
    basis,
    label: basis === 'flight number' ? carrier + flightNumber :
      basis === 'route' ? origin + ' → ' + destination : origin + ' airport departures',
    origin, destination, carrier, flightNumber, flights,
    onTimePct: num(row.on_time_pct),
    cancelPct: num(row.cancellation_pct),
    severePct: num(row.severe_delay_pct),
    avgArrivalDelay: num(row.avg_arrival_delay_min),
    medianArrivalDelay: num(row.median_arrival_delay_min),
    departureOnTimePct: num(row.departure_on_time_pct),
    periodStart: date(row.period_start ?? row.first_seen),
    periodEnd: date(row.period_end ?? row.last_seen)
  };
}
export async function flightHistory(params: {
  origin: string; destination: string; connection: string; alternate: string;
  carrier: string; flightNumber: string; selectedMonth: string;
}): Promise<HistoryResult> {
  const [airports, routes, flightNumbers, monthly] = await Promise.all([
    load('airports'), load('routes'), load('flight-numbers'), load('airport-monthly')
  ]);
  const sources = ([
    ['airports', airports], ['routes', routes], ['flight-numbers', flightNumbers],
    ['airport-monthly', monthly]
  ] as const).map(([name, item]) => ({
    name, available: Boolean(item), records: item?.rows.length || 0,
    periodEnd: item?.meta.period?.end || ''
  }));
  const routeIndex = new Map<string, AnyRow>();
  for (const row of routes?.rows || []) {
    routeIndex.set(iata(row.origin) + '>' + iata(row.destination), row);
  }
  const airportIndex = new Map<string, AnyRow>();
  for (const row of airports?.rows || []) airportIndex.set(iata(row.code), row);
  const numbers = new Map<string, AnyRow>();
  for (const row of flightNumbers?.rows || []) {
    numbers.set(iata(row.carrier) + String(row.flight_number || ''), row);
  }
  const { origin, destination, connection, alternate, carrier, flightNumber, selectedMonth } = params;
  const pairs = connection
    ? [[origin, connection], [connection, destination]]
    : [[origin, destination]];
  const notes: string[] = [];
  const legs: HistoryLeg[] = pairs.map(([from, to], index) => {
    const route = mapMetric(routeIndex.get(from + '>' + to), 'route', from, to);
    const airportBaseline = mapMetric(airportIndex.get(from), 'airport', from, '');
    const candidate = index === 0 && carrier && flightNumber ?
      numbers.get(carrier + String(Number(flightNumber))) : undefined;
    const sameRoute = candidate && iata(candidate.origin) === from && iata(candidate.destination) === to;
    const exact = sameRoute ? mapMetric(candidate, 'flight number', from, to, carrier, flightNumber) : null;
    const match = exact || route || airportBaseline;
    let    note = exact ? 'Matching historical operating-carrier flight number and directional route. A flight number can be reassigned; this is not the exact future departure, time, or aircraft.' :
      route ? 'Directional route across reporting airlines; not carrier or departure-hour specific.' :
      airportBaseline ? 'Route not covered; showing departure-airport network baseline only, not a route rate.' :
        'No eligible historical match in the published data.';
    if (candidate && !sameRoute) note += ' The flight number appears on another historical route; no exact match is claimed.';
    if (index > 0 && flightNumber) note += ' No flight number was supplied for this connection leg.';
    return { origin: from, destination: to, match, route, airportBaseline, note };
  });
  if (carrier && !flightNumber) notes.push(
    'Operating-carrier-specific route history is not in these compact files. Route rates include all reporting airlines.'
  );
  if (!routes) notes.push('Directional route dataset is unavailable. Do not treat airport-level history as route reliability.');
  if (!flightNumbers && flightNumber) notes.push('Flight-number dataset is unavailable. No flight-number match was established.');
  const chosen = new Set([origin, destination, connection, alternate]);
  const paths: AltPath[] = [];
  if (routes) {
    for (const route of routes.rows) {
      if (iata(route.origin) !== origin) continue;
      const hub = iata(route.destination);
      if (!hub || chosen.has(hub)) continue;
      const second = routeIndex.get(hub + '>' + destination);
      const firstMetric = mapMetric(route, 'route', origin, hub);
      const secondMetric = mapMetric(second, 'route', hub, destination);
      if (!firstMetric || !secondMetric) continue;
      // Descriptive screening index only, never an itinerary failure probability.
      if (firstMetric.severePct===null || secondMetric.severePct===null ||
          firstMetric.cancelPct===null || secondMetric.cancelPct===null) continue;
      const severe = Math.max(firstMetric.severePct, secondMetric.severePct);
      const cancel = Math.max(firstMetric.cancelPct, secondMetric.cancelPct);
      paths.push({
        connection: hub, legs: [firstMetric, secondMetric],
        index: Math.round((severe + cancel) * 10) / 10,
        description: 'Largest historical leg severe-delay rate plus largest historical leg cancellation rate. Ranking proxy, not actual connection failure probability.'
      });
    }
  }
  paths.sort((a, b) => a.index - b.index ||
    Math.min(...b.legs.map(leg => leg.flights)) - Math.min(...a.legs.map(leg => leg.flights)));
  const altRoute = alternate ? mapMetric(routeIndex.get(origin + '>' + alternate), 'route', origin, alternate) : null;
  const altBaseline = alternate ? mapMetric(airportIndex.get(alternate), 'airport', alternate, '') : null;
  const alternateArrival = alternate ? {
    origin, destination: alternate, match: altRoute || altBaseline,
    route: altRoute, airportBaseline: altBaseline,
    note: altRoute ? 'Historic service on this directional route; not confirmation of a currently scheduled flight.' :
      altBaseline ? 'Only destination-airport baseline available. No alternate flight route is established.' :
        'No historical match; live flight service and seats remain unknown.'
  } : null;
  const monthlyRows = (monthly?.rows || []).filter(row => iata(row.airport) === origin &&
    /^\d{4}-\d{2}$/.test(String(row.month || ''))).sort((a,b) =>
    String(a.month).localeCompare(String(b.month))).slice(-12);
  const monthlySummary = monthlyRows.map(row => ({
    month: String(row.month), flights: cleanNum(row.flights),
    onTimePct: num(row.on_time_pct), cancelPct: num(row.cancellation_pct)
  }));
  if (!monthly) notes.push('Monthly airport trend unavailable from the open data feed.');
  if (selectedMonth) notes.push('Travel month is for planning context. Historical route and flight-number rates are not filtered to that month.');
  notes.push('Publication covers only eligible major airports, high-volume directional routes, and flight numbers above source publication thresholds. Missing historical records are not proof of no airline service.');
  notes.push('Current source publication thresholds include at least 12,000 flights per directional route and 600 operations for a published flight number; individual source periods may differ.');
  const present = [airports, routes, flightNumbers, monthly].filter(Boolean);
  const periods = present.map(item=>item!.meta.period).filter((item):item is {start?:string;end?:string}=>!!item);
  const allAgree = periods.length===present.length && periods.every(item=>
    item.start===periods[0]?.start && item.end===periods[0]?.end);
  const period = allAgree && periods[0]?.start && periods[0]?.end ?
    {start:periods[0].start,end:periods[0].end}:null;
  if (!allAgree) notes.push('Historical files have different reporting windows. Use each matched row’s period and the per-source coverage dates rather than assuming one common cutoff.');
  return {
    available: present.length > 0,
    checkedAt: new Date().toISOString(),
    source: 'Independent BTS on-time aggregates',
    sourceUrl: 'https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FGJ',
    attribution: 'FlyerIntel analysis of US DOT Bureau of Transportation Statistics data',
    license: 'CC BY 4.0',
    period, sources, legs, alternatePaths: paths.slice(0, 8),
    alternateArrival, selectedMonth, monthly: monthlySummary, notes
  };
}
