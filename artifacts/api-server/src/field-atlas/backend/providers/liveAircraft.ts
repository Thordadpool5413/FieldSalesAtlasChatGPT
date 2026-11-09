import type { Evidence } from '../../shared/travel/types';
import { dated, source, type SourceResult } from './evidence';

export type LiveAircraft = {
  hex: string;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  onGround: boolean;
  groundSpeedKnots: number | null;
  trackDegrees: number | null;
  lastPositionSeconds: number | null;
  distanceNm: number;
};

export type LiveAircraftResponse = {
  airport: string;
  airportName: string;
  latitude: number;
  longitude: number;
  radiusNm: number;
  available: boolean;
  checkedAt: string;
  source: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  message: string;
  aircraft: LiveAircraft[];
  evidence: Evidence;
};

const provider = 'adsb.lol';
const sourceUrl = 'https://adsb.lol/docs/open-data/api';
const license = 'Open Database License (ODbL)';
const attribution = 'Aircraft observations from the adsb.lol community network; source data is licensed under ODbL.';
const radiusNm = 25;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const finite = (value: unknown, min: number, max: number): number | null => {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
};
const nullableText = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1), dLon = radians(lon2 - lon1);
  const a = Math.min(1, Math.max(0, Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2));
  return 3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseAircraft(value: unknown, center: { lat: number; lon: number }) {
  const root = object(value);
  if (!Array.isArray(root.ac)) throw new Error('Invalid live aircraft response.');
  const observedAt = dated(root.now);
  if (observedAt && Date.parse(observedAt) > Date.now() + 5000) throw new Error('Aircraft source time is in the future.');
  const sourceAgeSeconds = observedAt ? Math.max(0, (Date.now() - Date.parse(observedAt)) / 1000) : 0;
  const rows = root.ac.slice(0, 1000).map(object);
  const aircraft = rows.flatMap((row): LiveAircraft[] => {
    const hex = nullableText(row.hex, 8)?.toUpperCase();
    const lat = finite(row.lat, -90, 90), lon = finite(row.lon, -180, 180);
    const seen = finite(row.seen_pos, 0, 3600);
    if (!hex || !/^[A-F0-9]{6,8}$/.test(hex) || lat === null || lon === null ||
      seen === null || seen + sourceAgeSeconds > 120) return [];
    const distance = distanceNm(center.lat, center.lon, lat, lon);
    if (distance > radiusNm) return [];
    const rawAltitude = row.alt_baro;
    const altitudeFt = rawAltitude === 'ground' ? null : finite(rawAltitude, -2000, 70000);
    return [{
      hex,
      callsign: nullableText(row.flight, 12),
      registration: nullableText(row.r, 12),
      aircraftType: nullableText(row.t, 8),
      lat, lon, altitudeFt,
      onGround: rawAltitude === 'ground' || row.gnd === true,
      groundSpeedKnots: finite(row.gs, 0, 1500),
      trackDegrees: finite(row.track, 0, 360),
      lastPositionSeconds: observedAt ? Math.round((seen + sourceAgeSeconds) * 10) / 10 : null,
      distanceNm: Math.round(distance * 10) / 10,
    }];
  });
  aircraft.sort((a, b) => a.distanceNm - b.distanceNm);
  return { data: aircraft.slice(0, 100), observedAt,
    limitation: 'Live ADS-B observations and callsigns only. They do not confirm an airline schedule, route, delay, cancellation, gate, or booking.' };
}

export async function liveAircraftNearAirport(airport: {
  iata: string; name: string; lat: number; lon: number;
}): Promise<LiveAircraftResponse> {
  const lat = Number(airport.lat.toFixed(3)), lon = Number(airport.lon.toFixed(3));
  const subject = `${airport.iata}:${lat},${lon}:${radiusNm}nm`;
  const url = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radiusNm}`;
  const result: SourceResult<LiveAircraft[]> = await source({
    provider, subject, url, kind: 'observation',
    scope: 'Aircraft positions received by a community ADS-B network within 25 nautical miles of this airport.',
    ttlMs: 15000, maxAgeMs: 120000, version: 'adsb-lol-live-1',
    parse: value => parseAircraft(value, { lat, lon }),
  });
  return {
    airport: airport.iata, airportName: airport.name, latitude: lat, longitude: lon,
    radiusNm, available: result.evidence.state === 'current' && Array.isArray(result.data),
    checkedAt: result.evidence.retrievedAt, source: provider, sourceUrl, license, attribution,
    message: result.evidence.state === 'current' ?
      (result.data?.length ? '' : 'No recent aircraft positions were returned within this radius. This is not evidence that the airport or airspace is clear.') :
      result.evidence.limitation,
    aircraft: result.data || [], evidence: result.evidence,
  };
}

export function liveAircraftProductionGate(airport: string, airportName: string, lat: number, lon: number): LiveAircraftResponse | null {
  const production = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';
  if (!production || process.env.ADSB_LOL_PRODUCTION_APPROVED === 'true') return null;
  const checkedAt = new Date().toISOString();
  return {
    airport, airportName, latitude: lat, longitude: lon, radiusNm, available: false,
    checkedAt, source: provider, sourceUrl, license, attribution,
    message: 'Live aircraft positions are disabled in production until production use is confirmed with the data provider.',
    aircraft: [],
    evidence: {
      id: `adsb-lol-production-review:${airport}`,
      provider, subject: `${airport}:${radiusNm}nm`, sourceUrl: `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radiusNm}`,
      kind: 'observation', state: 'unavailable', retrievedAt: checkedAt,
      version: 'adsb-lol-live-1',
      scope: 'Aircraft positions from a community ADS-B network.',
      limitation: 'Production data access has not been confirmed with the provider.',
    },
  };
}
