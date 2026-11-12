import type { Evidence } from './types';

export type AirportSignal = {
  title: string; detail: string; validFrom?: string; validTo?: string;
  observation?: { windKnots: number | null; windGustKnots?: number | null; windDirection?: string | null; visibility: string | null; temperatureC: number | null };
  alert?: { id: string; severity: string; urgency: string; area: string };
  forecast?: { number: number; isDaytime: boolean; temperature: number | null; temperatureUnit: string;
    windSpeed: string; windDirection: string; shortForecast: string; probabilityOfPrecipitation: number | null;
    timeZone: string; startTime: string; endTime: string };
};
export type AirportProduct = { data: AirportSignal[] | null; evidence: Evidence };
export type AirportBrief = {
  airport: { iata: string; name: string; country?: string; state?: string; icao?: string };
  checkedAt: string; products: AirportProduct[];
};
