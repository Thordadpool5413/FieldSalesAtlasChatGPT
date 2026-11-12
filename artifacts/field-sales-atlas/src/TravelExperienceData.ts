import type { TravelExperience } from "../shared/travel/companion";
import { workspaceDeviceKey } from "./deviceWorkspace";
import { today } from "./opsModels";
const key = () => workspaceDeviceKey("atlas-measured-travel-v1");
export function validExperience(value: unknown): value is TravelExperience {
  if (!value || typeof value !== "object") return false;
  const row = value as TravelExperience;
  return (
    typeof row.id === "string" &&
    row.id.length <= 80 &&
    ["trainer_a", "trainer_b"].includes(row.trainerId) &&
    /^[A-Z]{3}$/.test(row.airport) &&
    /^(20\d{2})-\d{2}-\d{2}$/.test(row.date) &&
    row.date <= today() &&
    Number.isFinite(Date.parse(row.date + "T00:00:00Z")) &&
    new Date(row.date + "T00:00:00Z").toISOString().slice(0, 10) === row.date &&
    [
      "security",
      "arrival",
      "rental-return",
      "gate-transfer",
      "home-drive",
    ].includes(row.kind) &&
    Number.isInteger(row.minutes) &&
    row.minutes > 0 &&
    row.minutes <= 720 &&
    (row.kind !== "security" ||
      row.lane === "standard" ||
      row.lane === "precheck") &&
    typeof row.recordedAt === "string" &&
    Number.isFinite(Date.parse(row.recordedAt))
  );
}
export function readTravelExperiences(): TravelExperience[] {
  try {
    const rows = JSON.parse(localStorage.getItem(key()) || "[]");
    return Array.isArray(rows)
      ? rows.filter(validExperience).slice(0, 200)
      : [];
  } catch {
    return [];
  }
}
export function storeTravelExperiences(rows: TravelExperience[]) {
  if (rows.length > 200)
    throw Error(
      "This device holds at most 200 measurements. Existing records were preserved.",
    );
  localStorage.setItem(
    key(),
    JSON.stringify(rows.filter(validExperience).slice(0, 200)),
  );
}

export function earlierSecurityExperiences(
  workspaceId: string,
  trainerId: TravelExperience["trainerId"],
): TravelExperience[] {
  try {
    const rows = JSON.parse(
      localStorage.getItem(
        "atlas-personal-security-experiences-v1-" +
          workspaceId +
          "-" +
          trainerId,
      ) || "[]",
    );
    if (!Array.isArray(rows)) return [];
    const existing = new Set(readTravelExperiences().map((row) => row.id));
    return rows
      .map((row) => ({
        id: "security-" + row.id,
        trainerId,
        airport: row.airport,
        date: row.date,
        kind: "security" as const,
        minutes: row.minutes,
        lane: row.queue,
        recordedAt: new Date().toISOString(),
      }))
      .filter((row) => validExperience(row) && !existing.has(row.id));
  } catch {
    return [];
  }
}
