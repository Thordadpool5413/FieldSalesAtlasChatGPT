import { nws } from "./providers/publicTravel";
import type { Evidence } from "../shared/travel/types";
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
  evidence?: Evidence;
};
export async function nwsPointAlerts(
  lat: number,
  lon: number,
): Promise<NwsPointResult> {
  const result = await nws(lat, lon);
  const available = result.evidence.state === "current";
  const alerts = (result.data || []).map((row) => ({
    id: row.alert?.id || "",
    event: row.title,
    severity: row.alert?.severity || "Unknown",
    urgency: row.alert?.urgency || "Unknown",
    headline: row.detail,
    area: row.alert?.area || "",
    effective: row.validFrom || "",
    expires: row.validTo || "",
  }));
  const weight = (s: string) =>
    ["Unknown", "Minor", "Moderate", "Severe", "Extreme"].indexOf(s);
  alerts.sort((a, b) => weight(b.severity) - weight(a.severity));
  return {
    available,
    source: "National Weather Service",
    sourceUrl: result.evidence.sourceUrl,
    checkedAt: result.evidence.retrievedAt,
    scope: result.evidence.scope,
    alerts,
    message: available ? "" : result.evidence.limitation,
    evidence: result.evidence,
  };
}
