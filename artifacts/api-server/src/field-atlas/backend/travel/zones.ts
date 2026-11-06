import { find } from 'geo-tz';
import { validZone } from '../../shared/travel/time';

export function zoneAt(lat: unknown, lon: unknown, explicit?: string): string | null {
  if (explicit) { if (!validZone(explicit)) throw new Error('Invalid IANA time zone.'); return explicit; }
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const zones = find(lat, lon);
  return zones.length === 1 ? zones[0] : null;
}
