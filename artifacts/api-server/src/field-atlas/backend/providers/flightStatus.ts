import { createHash, randomUUID } from "node:crypto";
import { db } from "../runtime/sdk";
import { dated } from "./evidence";
import { lookupAirports } from "./airports";
import { zoneAt } from "../travel/zones";
import { inZone } from "../../shared/travel/time";
import type { Evidence, FlightInput } from "../../shared/travel/types";
import type { FlightSnapshot } from "../../shared/travel/flightStatus";
export type { FlightSnapshot } from "../../shared/travel/flightStatus";
const table = "atlas_provider_flight_snapshots_v1";
export function flightStatusConfig(workspaceId?: string) {
  const approved = (process.env.ATLAS_AEROAPI_WORKSPACE_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const keyConfigured = !!process.env.ATLAS_AEROAPI_KEY,
    workspaceApproved = workspaceId
      ? approved.includes(workspaceId)
      : approved.length > 0;
  return {
    provider: "FlightAware AeroAPI",
    configured: keyConfigured && workspaceApproved,
    keyConfigured,
    workspaceApproved,
    backgroundEnabled: process.env.ATLAS_FLIGHT_STATUS_POLLING === "enabled",
    limitation:
      "Requires an authorized AeroAPI account and an explicitly approved workspace. Operating identifier, airport pair and local departure date must match. A confirmation number alone does not access a reservation.",
  };
}

const ident = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(\D+)0+(\d)/, "$1$2");
const label = (value: unknown) =>
  typeof value === "string" ? value.slice(0, 80) : undefined;
async function loadFlight(
  workspaceId: string,
  leg: FlightInput,
): Promise<FlightSnapshot> {
  const key = createHash("sha256")
      .update(workspaceId + "|" + JSON.stringify(leg))
      .digest("hex"),
    [cached] = await db.get<{ snapshot: FlightSnapshot; retryAfter: string }>(
      table,
      [key],
    );
  if (cached && Date.parse(cached.retryAfter) > Date.now())
    return cached.snapshot;
  const now = new Date().toISOString(),
    url =
      "https://aeroapi.flightaware.com/aeroapi/flights/" +
      encodeURIComponent(ident(leg.carrier + leg.flightNumber));
  const evidence: Evidence = {
    id: randomUUID(),
    provider: "FlightAware AeroAPI",
    subject:
      leg.carrier +
      leg.flightNumber +
      " · " +
      leg.origin +
      "–" +
      leg.destination +
      " · " +
      leg.departDate,
    sourceUrl: url,
    kind: "observation",
    state: "partial",
    retrievedAt: now,
    expiresAt: new Date(Date.now() + 5 * 60000).toISOString(),
    version: "aeroapi-flight-v1",
    scope:
      "Provider-reported flight instance matched to operating identifier, route and local departure date.",
    limitation:
      "This snapshot does not verify a booking, ticket, boarding eligibility, seat availability or airline rebooking rights. The response does not supply a general last-status-update timestamp; retrieval time is shown separately.",
  };
  let result: FlightSnapshot = {
    id: key,
    leg,
    state: "unknown",
    status: "No unambiguous provider match",
    evidence,
  };
  try {
    if (!flightStatusConfig(workspaceId).configured)
      throw Error(
        "Configure an authorized AeroAPI key before checking flight-specific status.",
      );
    const response = await fetch(url, {
      headers: {
        "x-apikey": process.env.ATLAS_AEROAPI_KEY!,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8500),
      redirect: "error",
    });
    if (!response.ok)
      throw Error("Flight provider returned HTTP " + response.status + ".");
    const text = await response.text();
    if (text.length > 1500000)
      throw Error("Flight response exceeds the supported size.");
    const body = JSON.parse(text);
    if (!Array.isArray(body.flights) || body.flights.length > 100)
      throw Error(
        "The flight provider response did not match the expected schema.",
      );
    const airports = await lookupAirports([leg.origin, leg.destination]),
      origin = airports.find((row) => row.iata === leg.origin),
      destination = airports.find((row) => row.iata === leg.destination);
    const zone = leg.departureZone || zoneAt(origin?.lat, origin?.lon);
    const originCode = (row: any, ref: typeof origin) =>
      !!row &&
      !!ref &&
      (row.code_iata === ref.iata ||
        row.code_icao === ref.icao ||
        row.code === ref.icao ||
        row.code === ref.iata);
    const matches = body.flights.filter((row: any) => {
      const scheduled = dated(row.scheduled_out);
      if (
        !scheduled ||
        !zone ||
        !originCode(row.origin, origin) ||
        !originCode(row.destination, destination)
      )
        return false;
      if (
        ![row.ident, row.ident_iata].some(
          (value) =>
            typeof value === "string" &&
            ident(value) === ident(leg.carrier + leg.flightNumber),
        )
      )
        return false;
      return (
        inZone(scheduled, zone).date === leg.departDate &&
        typeof row.fa_flight_id === "string"
      );
    });
    if (matches.length !== 1) {
      result.evidence.limitation +=
        " " +
        (matches.length > 1
          ? "Multiple matching instances were returned; select and verify the operating flight with the airline."
          : "No exact instance was returned in this bounded search. Missing records do not establish a cancellation or absence of service.");
    } else {
      const row = matches[0];
      result = {
        ...result,
        state: "matched",
        status:
          label(row.status) ||
          (row.cancelled === true
            ? "Cancellation reported"
            : "Provider timing fields returned"),
        canceled: row.cancelled === true,
        scheduledDeparture: dated(row.scheduled_out),
        scheduledArrival: dated(row.scheduled_in),
        estimatedDeparture: dated(row.estimated_out),
        estimatedArrival: dated(row.estimated_in),
        actualDeparture: dated(row.actual_out),
        actualArrival: dated(row.actual_in),
        gate: label(row.gate_origin),
        arrivalGate: label(row.gate_destination),
        terminal: label(row.terminal_origin),
        arrivalTerminal: label(row.terminal_destination),
        providerFlightId: row.fa_flight_id,
      };
      const departure = result.actualDeparture || result.estimatedDeparture,
        arrival = result.actualArrival || result.estimatedArrival;
      const arrivalZone =
        leg.arrivalZone || zoneAt(destination?.lat, destination?.lon);
      if (
        !result.canceled &&
        departure &&
        arrival &&
        zone &&
        arrivalZone &&
        Date.parse(arrival) > Date.parse(departure)
      ) {
        const out = inZone(departure, zone),
          into = inZone(arrival, arrivalZone);
        result.replacement = {
          ...leg,
          departDate: out.date,
          departTime: out.time,
          arriveDate: into.date,
          arriveTime: into.time,
          departureZone: zone,
          arrivalZone: arrivalZone,
          review: undefined,
          providedAt: now,
        };
      }
    }
  } catch (failure) {
    result = {
      ...result,
      state: "unavailable",
      status: "Flight-specific status unavailable",
      evidence: {
        ...evidence,
        state: "unavailable",
        limitation:
          (failure instanceof Error
            ? failure.message
            : "Flight provider request failed.") +
          " Current flight-specific status is unknown.",
      },
    };
  }
  await db.tx.update(table, [
    {
      id: key,
      record: {
        snapshot: result,
        retryAfter: new Date(
          Date.now() + (result.state === "matched" ? 5 * 60000 : 60000),
        ).toISOString(),
      },
    },
  ]);
  return result;
}

const pendingChecks = new Map<string, Promise<FlightSnapshot>>();
export function checkFlight(
  workspaceId: string,
  leg: FlightInput,
): Promise<FlightSnapshot> {
  const key = createHash("sha256")
    .update(workspaceId + "|" + JSON.stringify(leg))
    .digest("hex");
  const running = pendingChecks.get(key);
  if (running) return running;
  const work = loadFlight(workspaceId, leg).finally(() =>
    pendingChecks.delete(key),
  );
  pendingChecks.set(key, work);
  return work;
}
