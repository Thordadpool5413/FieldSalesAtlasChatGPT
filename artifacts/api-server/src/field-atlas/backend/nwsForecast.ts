import { nwsForecast } from "./providers/publicTravel";
import type { Evidence } from "../shared/travel/types";
/* NOAA / National Weather Service point forecast.
   Public U.S. weather, not flight status or an airline disruption prediction.
   Inputs are airport coordinates; no manager/employee details leave the workspace. */
export type PointForecastPeriod = {
  number: number;
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number | null;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  probabilityOfPrecipitation: number | null;
  signals: string[];
};
export type PointForecast = {
  available: boolean;
  checkedAt: string;
  issuedAt: string;
  timeZone: string;
  source: string;
  sourceUrl: string;
  scope: string;
  periods: PointForecastPeriod[];
  message: string;
  evidence?: Evidence;
};
function weatherSignals(detail: string, wind: string, precip: number | null) {
  const desc = detail.toLowerCase(),
    alerts: string[] = [];
  if (/thunderstorm|tornado/.test(desc)) alerts.push("Thunderstorm conditions");
  if (/snow|ice|sleet|freezing rain|blizzard/.test(desc))
    alerts.push("Winter conditions");
  if (/fog/.test(desc)) alerts.push("Reduced visibility possible");
  const speeds = (wind.match(/\d+/g) || []).map(Number);
  if (speeds.length && Math.max(...speeds) >= 25)
    alerts.push("Wind at least 25 mph");
  if (precip !== null && precip >= 70) alerts.push("High precipitation chance");
  return alerts.slice(0, 4);
}
export async function nwsAirportForecast(
  lat: number,
  lon: number,
): Promise<PointForecast> {
  const result = await nwsForecast(lat, lon);
  return {
    available: result.evidence.state === "current",
    checkedAt: result.evidence.retrievedAt,
    issuedAt: result.evidence.observedAt || "",
    timeZone: result.data?.[0]?.forecast?.timeZone || "",
    source: "NOAA National Weather Service",
    sourceUrl: result.evidence.sourceUrl,
    scope: result.evidence.scope,
    evidence: result.evidence,
    message:
      result.evidence.state === "current" ? "" : result.evidence.limitation,
    periods: (result.data || []).flatMap((row) =>
      row.forecast && row.validFrom && row.validTo
        ? [
            {
              ...row.forecast,
              name: row.title,
              startTime: row.forecast.startTime,
              endTime: row.forecast.endTime,
              signals: weatherSignals(
                row.detail,
                row.forecast.windSpeed,
                row.forecast.probabilityOfPrecipitation,
              ),
            },
          ]
        : [],
    ),
  };
}
