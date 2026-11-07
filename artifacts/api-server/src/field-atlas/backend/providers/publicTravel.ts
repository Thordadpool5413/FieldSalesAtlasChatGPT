import { source, dated, officialJson, type SourceResult } from './evidence';
import type { Evidence } from '../../shared/travel/types';

const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === 'string' ? v.slice(0, 240) : '';
const english = (v: unknown) => {
  const row = object(v);
  return text(row.en ?? row.value ?? v);
};
const canadianStates = ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'];
const isCanadianAirport = (airport: { state?: string; country?: string }) => airport.country ? airport.country === 'CA' : canadianStates.includes(airport.state || '');
function airportBbox(lat: number, lon: number, radius: number) {
  return [lon - radius, lat - radius, lon + radius, lat + radius].map(value => value.toFixed(3)).join(',');
}
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1), dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
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
export function parseCanadianObservations(value: unknown, now = Date.now()) {
  const root = object(value);
  if (!Array.isArray(root.features)) throw new Error('Invalid GeoMet features.');
  const rows = root.features.map(v => object(object(v).properties)).flatMap(row => {
    const at = dated(row.obs_date_tm || row['date_tm-value'] || row.datetime);
    const time = at ? Date.parse(at) : NaN;
    return at && Number.isFinite(time) && time <= now + 300000 && now - time <= 2 * 3600000 ? [{ row, at }] : [];
  });
  if (!rows.length) throw new Error('No recent Canadian observation with validated source timestamps.');
  return {
    data: rows.map(({ row, at }) => ({ title: text(row['stn_nam-value'] || row.stn_nam || row.station_name) || 'Nearby surface station', detail: 'Published surface observation at ' + at })),
    observedAt: rows.map(item => item.at).sort()[0],
    limitation: 'Nearby Canadian surface stations, not necessarily the airport. Each observation keeps its source time. Weather warnings and forecasts are separate products.',
  };
}
export function canadianObservations(lat: number, lon: number) {
  const subject = lat.toFixed(2) + ',' + lon.toFixed(2);
  const bbox = airportBbox(lat, lon, .75);
  const since = new Date(Math.floor(Date.now() / 3600000) * 3600000 - 2 * 3600000).toISOString();
  const url = 'https://api.weather.gc.ca/collections/swob-realtime/items?bbox=' + bbox + '&datetime=' + encodeURIComponent(since + '/..') + '&sortby=-obs_date_tm&limit=5&f=json';
  return source<TravelSignal[]>({ provider: 'ECCC GeoMet', subject, url, kind: 'observation',
    scope: 'Nearby Canadian surface observations; not airport-specific warnings or forecasts.', ttlMs: 10 * 60000, maxAgeMs: 2 * 3600000, version: 'eccc-swob-2',
    parse: parseCanadianObservations,
  });
}

export function canadianForecast(lat: number, lon: number) {
  const subject = lat.toFixed(3) + ',' + lon.toFixed(3);
  const bbox = airportBbox(lat, lon, 1.25);
  return source<TravelSignal[]>({ provider: 'ECCC City Page Weather', subject, url: `https://api.weather.gc.ca/collections/citypageweather-realtime/items?bbox=${bbox}&limit=25&f=json`,
    kind: 'forecast', scope: 'Nearest available ECCC city-page forecast within 150 km of the airport coordinates; regional forecast, not an airport observation or aviation forecast.', ttlMs: 15 * 60000, maxAgeMs: 12 * 3600000, version: 'eccc-citypage-1',
    parse(value) {
      const root = object(value);
      if (!Array.isArray(root.features)) throw new Error('Invalid ECCC city forecast collection.');
      if (!root.features.length) return { data: [], limitation: 'No ECCC city forecast was returned near this airport; Canadian forecast coverage is unknown.' };
      const candidates = root.features.map(raw => {
        const feature = object(raw), geometry = object(feature.geometry), coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
        const cityLon = Number(coordinates[0]), cityLat = Number(coordinates[1]);
        if (!Number.isFinite(cityLon) || !Number.isFinite(cityLat) || Math.abs(cityLon) > 180 || Math.abs(cityLat) > 90) return null;
        return { properties: object(feature.properties), distance: distanceKm(lat, lon, cityLat, cityLon) };
      }).filter((entry): entry is { properties: Record<string, unknown>; distance: number } => !!entry);
      if (!candidates.length) throw new Error('ECCC city forecast locations could not be validated.');
      const nearest = candidates.filter(candidate => candidate.distance <= 150).sort((a, b) => a.distance - b.distance)[0];
      if (!nearest) return { data: [], limitation: 'No published ECCC city forecast is within 150 km; conditions at the airport are unknown.' };
      const group = object(nearest.properties.forecastGroup);
      if (!Array.isArray(group.forecasts) || !group.forecasts.length) throw new Error('ECCC forecast periods are missing.');
      const forecasts = group.forecasts.map(raw => {
        const row = object(raw), period = object(row.period);
        return {
          title: english(period.textForecastName) || english(period.value),
          detail: english(row.textSummary) || english(row.cloudPrecip) || english(object(row.abbreviatedForecast).textSummary),
        };
      }).filter(row => row.title && row.detail).slice(0, 16);
      if (!forecasts.length) throw new Error('ECCC forecast periods could not be validated.');
      const observedAt = dated(english(group.timestamp) || nearest.properties.lastUpdated);
      const city = english(nearest.properties.name) || 'Nearby Canadian city';
      return { data: forecasts.map(row => ({ title: row.title, detail: `${row.detail} (${city} regional forecast)` })), observedAt,
        limitation: `Regional forecast for ${city}, approximately ${Math.round(nearest.distance)} km from the airport. ECCC does not publish exact period validity timestamps in this product; airport conditions and full trip-window coverage are unknown.` };
    },
  });
}

export function canadianWarnings(lat: number, lon: number) {
  const subject = lat.toFixed(3) + ',' + lon.toFixed(3);
  const bbox = airportBbox(lat, lon, .75);
  return source<TravelSignal[]>({ provider: 'ECCC Weather Alerts', subject, url: `https://api.weather.gc.ca/collections/weather-alerts/items?bbox=${bbox}&limit=100&sortby=-publication_datetime&f=json`,
    kind: 'observation', scope: 'Active ECCC warning polygons intersecting the 0.75-degree bounding box around the airport; warnings are regional, not airport-specific.', ttlMs: 5 * 60000, maxAgeMs: 2 * 3600000, version: 'eccc-alerts-1',
    parse(value) {
      const root = object(value);
      if (!Array.isArray(root.features)) throw new Error('Invalid ECCC weather alert collection.');
      const alerts = root.features.map(raw => {
        const feature = object(raw);
        return { feature, properties: object(feature.properties) };
      });
      const publicationTimes = alerts.map(({ properties }) => dated(properties.publication_datetime)).filter((value): value is string => !!value).sort();
      const observedAt = dated(root.timeStamp) || publicationTimes.at(-1);
      const now = Date.now();
      const warnings: TravelSignal[] = [];
      for (const { feature, properties: row } of alerts) {
        const status = text(row.status_en).toLowerCase();
        const type = text(row.alert_type).toLowerCase();
        if (!status || !type) throw new Error('ECCC alert status or type is missing.');
        if (status !== 'active' || type !== 'warning') continue;
        const geometry = object(feature.geometry);
        if (!['Polygon', 'MultiPolygon'].includes(text(geometry.type)) || !Array.isArray(geometry.coordinates) || !geometry.coordinates.length) throw new Error('ECCC warning area geometry could not be validated.');
        const validFrom = dated(row.validity_datetime);
        const expiration = dated(row.expiration_datetime);
        const validTo = dated(row.event_end_datetime) || expiration;
        if (!validFrom || !validTo || validTo <= validFrom || !expiration) throw new Error('ECCC warning validity could not be validated.');
        if (Date.parse(expiration) <= now) continue;
        const name = text(row.alert_name_en) || 'Weather warning';
        const area = text(row.feature_name_en) || text(row.province);
        const detail = text(row.alert_text_en);
        if (!detail) throw new Error('ECCC warning text is missing.');
        warnings.push({ title: area ? `${name} — ${area}` : name, detail, validFrom, validTo });
      }
      return { data: warnings.slice(0, 30), observedAt,
        limitation: warnings.length
          ? 'These are active warning records in the queried regional area, not airport-specific advisories or an all-clear for areas outside the published warning polygons.'
          : 'No active ECCC warning records were returned for this queried area at the source timestamp; this is not an all-clear for conditions outside the query area.' };
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
  const canadian = isCanadianAirport(airport);
  const us = airport.country ? airport.country === 'US' : !canadian;
  if (us) work.push(faa(airport.iata));
  if (airport.icao) work.push(metar(airport.icao), taf(airport.icao));
  if (Number.isFinite(airport.lat) && Number.isFinite(airport.lon)) {
    if (canadian) work.push(canadianObservations(airport.lat!, airport.lon!), canadianForecast(airport.lat!, airport.lon!), canadianWarnings(airport.lat!, airport.lon!));
    else if (us) work.push(nws(airport.lat!, airport.lon!), nwsForecast(airport.lat!, airport.lon!));
  }
  return Promise.all(work);
}
export function appliesTo(evidence: Evidence, start: string, end: string): boolean {
  return !!evidence.validFrom && !!evidence.validTo && evidence.validFrom <= end && evidence.validTo >= start;
}
