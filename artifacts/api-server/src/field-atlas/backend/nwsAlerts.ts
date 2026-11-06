export type NwsAlert = {
  id: string;
  event: string;
  severity: string;
  urgency: string;
  headline: string;
  area: string;
  effective: string;
  expires: string;
};
export type NwsPointResult = {
  available: boolean;
  source: string;
  sourceUrl: string;
  checkedAt: string;
  scope: string;
  alerts: NwsAlert[];
  message: string;
};
const cache = new Map<string, { expiry: number; data: NwsPointResult }>();
const pending = new Map<string, Promise<NwsPointResult>>();
const textValue = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';
function unavailable(message: string): NwsPointResult {
  return {
    available: false,
    source: 'National Weather Service',
    sourceUrl: 'https://api.weather.gov/',
    checkedAt: new Date().toISOString(),
    scope: 'Active weather alerts at a single airport point, not along an entire flight path.',
    alerts: [],
    message
  };
}
async function fetchPoint(lat: number, lon: number): Promise<NwsPointResult> {
  try {
    const url = 'https://api.weather.gov/alerts/active?point=' +
      lat.toFixed(3) + ',' + lon.toFixed(3);
    const response = await fetch(url, {
      headers: {
        Accept: 'application/geo+json',
        'User-Agent': 'FieldSalesAtlas/1.0 (free public weather intelligence)'
      },
      signal: AbortSignal.timeout(8500)
    });
    if (response.status === 204) {
      return { ...unavailable(''), available: true, alerts: [] };
    }
    if (!response.ok) throw new Error('NWS API returned HTTP ' + response.status);
    const raw = await response.text();
    if (raw.length > 650000) throw new Error('NWS response too large');
    const parsed = JSON.parse(raw) as { features?: unknown };
    if (!Array.isArray(parsed.features)) throw new Error('Unexpected NWS alert data shape');
    const alerts: NwsAlert[] = [];
    for (const feature of parsed.features.slice(0, 45)) {
      if (!feature || typeof feature !== 'object') continue;
      const rawProps = (feature as { properties?: unknown }).properties;
      if (!rawProps || typeof rawProps !== 'object') continue;
      const p = rawProps as Record<string, unknown>;
      alerts.push({
        id: textValue(p.id, 100),
        event: textValue(p.event, 100) || 'Weather advisory',
        severity: textValue(p.severity, 30) || 'Unknown',
        urgency: textValue(p.urgency, 30) || 'Unknown',
        headline: textValue(p.headline, 240),
        area: textValue(p.areaDesc, 180),
        effective: textValue(p.effective, 40),
        expires: textValue(p.expires, 40)
      });
    }
    const weight = (severity: string) =>
      severity === 'Extreme' ? 4 : severity === 'Severe' ? 3 :
        severity === 'Moderate' ? 2 : severity === 'Minor' ? 1 : 0;
    alerts.sort((a, b) => weight(b.severity) - weight(a.severity));
    return {
      available: true,
      source: 'National Weather Service',
      sourceUrl: 'https://api.weather.gov/alerts/active?point=' +
        lat.toFixed(3) + ',' + lon.toFixed(3),
      checkedAt: new Date().toISOString(),
      scope: 'Active alerts for an airport point. Not a flight-specific risk forecast.',
      alerts: alerts.slice(0, 10),
      message: ''
    };
  } catch {
    return unavailable('The official weather-alert feed could not be reached. Conditions remain unknown.');
  }
}
export async function nwsPointAlerts(lat: number, lon: number): Promise<NwsPointResult> {
  const key = lat.toFixed(2) + ',' + lon.toFixed(2);
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiry > now) return existing.data;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const call = fetchPoint(lat, lon).then(data => {
    if (cache.size >= 100) cache.clear();
    cache.set(key, { expiry: Date.now() + (data.available ? 240000 : 40000), data });
    return data;
  }).finally(() => pending.delete(key));
  pending.set(key, call);
  return call;
}
