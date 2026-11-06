import { source, dated, officialJson, type SourceResult } from './evidence';
import type { Evidence } from '../../shared/travel/types';

const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === 'string' ? v.slice(0, 240) : '';
export type TravelSignal = { title: string; detail: string; validFrom?: string; validTo?: string };
export function faa(airport: string) {
  return source<TravelSignal[]>({ provider: 'FAA NAS', subject: airport, url: 'https://nasstatus.faa.gov/api/airport-events', kind: 'observation',
    scope: 'Airport-wide notices only. Not flight-specific status.', ttlMs: 120000, maxAgeMs: 20 * 60000, version: 'faa-1',
    parse(value) {
      if (!Array.isArray(value)) throw new Error('Invalid FAA feed.');
      const record = value.map(object).find(row => row.airportId === airport);
      if (!record) return { data: [], limitation: 'Airport omitted from the feed. Its current operational status is unknown.' };
      const result: TravelSignal[] = [];
      for (const key of ['groundStop', 'groundDelay', 'airportClosure', 'arrivalDelay', 'departureDelay']) {
        const rows = Array.isArray(record[key]) ? record[key] as unknown[] : record[key] ? [record[key]] : [];
        for (const raw of rows.slice(0, 8)) {
          const item = object(raw);
          result.push({ title: key.replace(/[A-Z]/g, c => ' ' + c.toLowerCase()), detail: text(item.reason || item.simpleText || item.text), validFrom: dated(item.startTime), validTo: dated(item.endTime) });
        }
      }
      return { data: result, observedAt: dated(record.sourceTimeStamp || record.updatedAt || object(record.airportConfig).sourceTimeStamp), limitation: 'Returned notices describe the airport, not an individual flight.' };
    },
  });
}
export function metar(icao: string) {
  return source<TravelSignal[]>({ provider: 'NOAA Aviation Weather', subject: icao, url: `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(icao)}&format=json`,
    kind: 'observation', scope: 'Aviation weather observation at this reporting airport.', ttlMs: 5 * 60000, maxAgeMs: 90 * 60000, version: 'metar-1',
    parse(value) {
      if (!Array.isArray(value)) throw new Error('Invalid METAR response.');
      const row = value.map(object).find(row => row.icaoId === icao);
      if (!row) throw new Error('No matching observation.');
      const detail = text(row.rawOb);
      if (!detail) throw new Error('Observation missing.');
      return { data: [{ title: text(row.fltCat) || 'Aviation observation', detail }], observedAt: dated(row.obsTime || row.reportTime), limitation: 'Weather observations do not determine airline cancellations or operational safety.' };
    },
  });
}
export function taf(icao: string) {
  return source<TravelSignal[]>({ provider: 'NOAA TAF', subject: icao, url: `https://aviationweather.gov/api/data/taf?ids=${encodeURIComponent(icao)}&format=json`,
    kind: 'forecast', scope: 'Airport aviation forecast within its published valid period.', ttlMs: 15 * 60000, maxAgeMs: 24 * 3600000, version: 'taf-1',
    parse(value) {
      if (!Array.isArray(value)) throw new Error('Invalid TAF response.');
      const row = value.map(object).find(row => row.icaoId === icao);
      if (!row || !text(row.rawTAF)) throw new Error('No matching TAF.');
      const validFrom = dated(row.validTimeFrom), validTo = dated(row.validTimeTo);
      if (!validFrom || !validTo || validTo <= validFrom) throw new Error('Missing forecast validity.');
      return { data: [{ title: 'Published aviation forecast', detail: text(row.rawTAF), validFrom, validTo }], observedAt: dated(row.issueTime), validFrom, validTo, limitation: 'Applies only to the published period and airport; not a flight-delay prediction.' };
    },
  });
}
export function nws(lat: number, lon: number) {
  const subject = lat.toFixed(3) + ',' + lon.toFixed(3);
  return source<TravelSignal[]>({ provider: 'NWS alerts', subject, url: 'https://api.weather.gov/alerts/active?point=' + subject,
    kind: 'observation', scope: 'Active U.S. weather alerts for a single location.', ttlMs: 4 * 60000, maxAgeMs: 24 * 3600000, version: 'nws-alerts-1',
    parse(value) {
      const root = object(value);
      if (!Array.isArray(root.features)) throw new Error('Invalid alert collection.');
      const rows = root.features.map(v => object(object(v).properties));
      const dates = rows.map(row => dated(row.sent)).filter((v): v is string => !!v).sort();
      return { data: rows.slice(0, 15).map(row => ({ title: text(row.event), detail: text(row.headline), validFrom: dated(row.effective), validTo: dated(row.expires) })),
        observedAt: dates.at(-1), limitation: rows.length ? 'Location-specific alerts, not conditions along the entire flight path.' : 'No active alerts were returned at retrieval; an observation timestamp was not supplied for an empty collection.' };
    },
  });
}
export function canadianObservations(lat: number, lon: number) {
  const subject = lat.toFixed(2) + ',' + lon.toFixed(2);
  const bbox = [lon - .75, lat - .75, lon + .75, lat + .75].map(v => v.toFixed(3)).join(',');
  return source<TravelSignal[]>({ provider: 'ECCC GeoMet', subject, url: `https://api.weather.gc.ca/collections/swob-realtime/items?bbox=${bbox}&limit=5&sortby=-obs_date_tm&f=json`,
    kind: 'observation', scope: 'Nearby Canadian surface observations; not airport-specific warnings or forecasts.', ttlMs: 10 * 60000, maxAgeMs: 2 * 3600000, version: 'eccc-swob-2',
    parse(value) {
      const root = object(value);
      if (!Array.isArray(root.features)) throw new Error('Invalid GeoMet features.');
      if (!root.features.length) return { data: [], limitation: 'No nearby surface observations were returned; current Canadian weather status is unknown.' };
      const rows = root.features.map(v => object(object(v).properties)).map(row => ({
        row,
        observedAt: [row.obs_date_tm, row['date_tm-value'], row.date_tm, row.datetime, row.obs_date].map(dated).find((value): value is string => !!value),
      })).filter((entry): entry is { row: Record<string, unknown>; observedAt: string } => !!entry.observedAt);
      if (!rows.length) throw new Error('Canadian observation timestamps could not be validated.');
      const times = rows.map(entry => entry.observedAt).sort();
      return { data: rows.map(({ row, observedAt }) => ({ title: text(row['stn_nam-value'] || row.stn_nam || row.station_name) || 'Nearby surface station', detail: 'Published surface observation at ' + observedAt })), observedAt: times.at(-1), limitation: 'Nearby surface observations are not airport-specific warnings or forecasts.' };
    },
  });
}

export function nwsForecast(lat: number, lon: number) {
  const subject = lat.toFixed(3) + ',' + lon.toFixed(3);
  return source<TravelSignal[]>({ provider: 'NWS point forecast', subject, url: 'https://api.weather.gov/points/' + subject,
    kind: 'forecast', scope: 'Published U.S. point forecast; not an aviation forecast or airline-delay prediction.', ttlMs: 15 * 60000, maxAgeMs: 18 * 3600000, version: 'nws-forecast-1',
    async parse(value) {
      const point = object(object(value).properties);
      if (typeof point.forecast !== 'string' || !point.forecast.startsWith('https://api.weather.gov/gridpoints/')) throw new Error('Invalid forecast discovery URL.');
      const forecast = object(object(await officialJson(point.forecast)).properties);
      if (!Array.isArray(forecast.periods) || !forecast.periods.length) throw new Error('Forecast periods are missing.');
      const periods = forecast.periods.map(object);
      const validFrom = dated(periods[0].startTime), validTo = dated(periods.at(-1)!.endTime);
      if (!validFrom || !validTo || validTo <= validFrom) throw new Error('Invalid forecast validity.');
      return { data: periods.slice(0, 16).map(row => ({ title: text(row.name), detail: text(row.detailedForecast || row.shortForecast), validFrom: dated(row.startTime), validTo: dated(row.endTime) })),
        observedAt: dated(forecast.updateTime || forecast.updated), validFrom, validTo, limitation: 'Forecast applies to this point and its published validity period. Check destination conditions separately from airport aviation weather.' };
    },
  });
}

export async function publicAirportEvidence(airport: { iata: string; icao?: string; lat?: number; lon?: number; state?: string; country?: string }): Promise<Array<SourceResult<TravelSignal[]>>> {
  const work: Array<Promise<SourceResult<TravelSignal[]>>> = [];
  const canadian = ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'].includes(airport.state || '');
  const us = airport.country ? airport.country === 'US' : !canadian;
  if (us) work.push(faa(airport.iata));
  if (airport.icao) work.push(metar(airport.icao), taf(airport.icao));
  if (Number.isFinite(airport.lat) && Number.isFinite(airport.lon)) {
    if (canadian) work.push(canadianObservations(airport.lat!, airport.lon!));
    else if (us) work.push(nws(airport.lat!, airport.lon!), nwsForecast(airport.lat!, airport.lon!));
  }
  return Promise.all(work);
}
export function appliesTo(evidence: Evidence, start: string, end: string): boolean {
  return !!evidence.validFrom && !!evidence.validTo && evidence.validFrom <= end && evidence.validTo >= start;
}
