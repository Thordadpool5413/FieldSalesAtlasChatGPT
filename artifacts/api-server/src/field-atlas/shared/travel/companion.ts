import type { Evidence, FlightInput } from "./types";
import type { PlanSummary } from "./intelligence";
import type { JourneyRequirements, ReadinessReport } from "./readiness";

export type TripEvent = {
  id: string;
  trainerId: string;
  kind: "flight" | "visit" | "pickup";
  title: string;
  startAt?: string;
  endAt?: string;
  localDate: string;
  localTime?: string;
  timeZone?: string;
  detail: string;
  basis: "traveler" | "workspace";
};
export type TripAction = {
  id: string;
  priority: "attention" | "review";
  title: string;
  reason: string;
  details?: string[];
  destination:
    | "booking"
    | "requirements"
    | "recovery"
    | "profile"
    | "evidence"
    | "calendar";
  trainerId?: string;
};
export type TripWorkspace = {
  plan: PlanSummary;
  checkedAt: string;
  workspaceRevision: number;
  itineraryVersion: string;
  stage: "prepare" | "travel" | "field" | "return" | "review";
  timeline: TripEvent[];
  actions: TripAction[];
  readiness: ReadinessReport;
  evidence: Evidence[];
  requirements: JourneyRequirements;
  flights: FlightInput[];
  monitoring: {
    enabled: boolean;
    flightStatusEnabled?: boolean;
    lastCheckedAt?: string;
    nextCheckAt?: string;
    state: string;
  };
  limitations: string[];
};
export type TravelExperience = {
  id: string;
  trainerId: "trainer_a" | "trainer_b";
  airport: string;
  date: string;
  kind:
    "security" | "arrival" | "rental-return" | "gate-transfer" | "home-drive";
  minutes: number;
  lane?: "standard" | "precheck";
  recordedAt: string;
};
export type ExperienceSummary = {
  count: number;
  medianMinutes: number | null;
  upperMinutes: number | null;
  firstDate?: string;
  lastDate?: string;
};
export function summarizeExperiences(
  rows: TravelExperience[],
  query: Pick<TravelExperience, "trainerId" | "airport" | "kind"> & {
    lane?: TravelExperience["lane"];
  },
  now = new Date().toISOString().slice(0, 10),
): ExperienceSummary {
  const oldest = new Date(now + "T00:00:00Z");
  oldest.setUTCFullYear(oldest.getUTCFullYear() - 1);
  const values = rows.filter(
    (row) =>
      row.trainerId === query.trainerId &&
      row.airport === query.airport &&
      row.kind === query.kind &&
      (query.kind !== "security" || row.lane === query.lane) &&
      row.date >= oldest.toISOString().slice(0, 10) &&
      row.date <= now &&
      Number.isFinite(row.minutes) &&
      row.minutes > 0 &&
      row.minutes <= 720,
  );
  const sorted = values.map((row) => row.minutes).sort((a, b) => a - b),
    dates = values.map((row) => row.date).sort();
  return {
    count: sorted.length,
    medianMinutes:
      sorted.length >= 5
        ? Math.round(
            (sorted[Math.floor((sorted.length - 1) / 2)] +
              sorted[Math.ceil((sorted.length - 1) / 2)]) /
              2,
          )
        : null,
    upperMinutes:
      sorted.length >= 5 ? sorted[Math.ceil(sorted.length * 0.8) - 1] : null,
    firstDate: dates[0],
    lastDate: dates.at(-1),
  };
}
