import type { AirportBrief } from '../shared/travel/airportBrief';
import { describeEvidence } from '../shared/travel/evidence';
import { weatherSignals } from '../shared/travel/weather';

// NWS retains the point's UTC offsets. Include an overnight period that starts
// the previous evening but covers part of the requested airport-local date.
export function forecastOverlapsDate(period: { startTime: string; endTime: string }, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(period.startTime)) || !Number.isFinite(Date.parse(period.endTime)) || Date.parse(period.endTime) <= Date.parse(period.startTime)) return false;
  const start = period.startTime.slice(0, 10), end = period.endTime.slice(0, 10);
  return start <= date && (end > date || end === date && !/T00:00(?::00)?(?:[+-]|Z)/.test(period.endTime));
}

// Project the same normalized products used by the planner and source checks.
// A successful HTTP response is not proof that a product is current.
export function flightAirportData(brief: AirportBrief) {
  const find = (provider: string) => brief.products.find(row => row.evidence.provider === provider);
  const metar = find('NOAA Aviation Weather'), taf = find('NOAA TAF');
  const observation = metar && describeEvidence(metar.evidence).state === 'current' ? metar.data?.[0] : null;
  const forecast = taf && describeEvidence(taf.evidence).state === 'current' ? taf.data?.[0] : null;
  const alerts = find('NWS alerts'), outlook = find('NWS point forecast');
  return {
    aviation: { icao: brief.airport.icao || '', available: !!(observation || forecast), checkedAt: brief.checkedAt,
      source: 'NOAA Aviation Weather Center', message: [metar, taf].filter(row => row && describeEvidence(row.evidence).state !== 'current').map(row => row!.evidence.limitation).join(' '),
      evidence: [metar, taf].flatMap(row => row ? [row.evidence] : []),
      observation: observation ? { reportTime: metar!.evidence.observedAt || null, category: observation.title, raw: observation.detail,
        windGustKnots: observation.observation?.windGustKnots ?? null, windDirection: observation.observation?.windDirection ?? null,
        windKnots: observation.observation?.windKnots ?? null, visibility: observation.observation?.visibility ?? null, temperatureC: observation.observation?.temperatureC ?? null } : null,
      forecast: forecast ? { raw: forecast.detail, validFrom: forecast.validFrom || null, validTo: forecast.validTo || null } : null },
    nws: alerts ? { available: describeEvidence(alerts.evidence).state === 'current', checkedAt: alerts.evidence.retrievedAt,
      source: alerts.evidence.provider, sourceUrl: alerts.evidence.sourceUrl, message: alerts.evidence.limitation, evidence: alerts.evidence,
      alerts: (alerts.data || []).map(row => ({ id: row.alert?.id || '', event: row.title, severity: row.alert?.severity || 'Unknown', urgency: row.alert?.urgency || 'Unknown',
        headline: row.detail, area: row.alert?.area || '', effective: row.validFrom || '', expires: row.validTo || '' })) } : undefined,
    outlook: outlook ? { available: describeEvidence(outlook.evidence).state === 'current', checkedAt: outlook.evidence.retrievedAt,
      source: outlook.evidence.provider, message: outlook.evidence.limitation, evidence: outlook.evidence,
      periods: (outlook.data || []).flatMap(row => row.forecast ? [{ ...row.forecast, name: row.title,
        signals: weatherSignals(row.detail, row.forecast.windSpeed, row.forecast.probabilityOfPrecipitation) }] : []) } : undefined,
    regional: brief.products.filter(row => row.evidence.provider.startsWith('ECCC ')),
  };
}
