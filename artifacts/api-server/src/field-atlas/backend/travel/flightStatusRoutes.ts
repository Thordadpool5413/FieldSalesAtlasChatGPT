import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  db,
  json,
  error,
  type RouterMiddleware,
  type RouterRoutes,
} from "../runtime/sdk";
import {
  flightStatusConfig,
  checkFlight,
  type FlightSnapshot,
} from "../providers/flightStatus";
import { planContext } from "./context";
import { itineraryVersion } from "./readiness";
import type { ScenarioBoard } from "./scenarios";
import { reportFlightChange } from "./recovery";
const table = "atlas_flight_status_checks_v1";
type Check = {
  id: string;
  workspaceId: string;
  reportId: string;
  revision: number;
  itineraryVersion: string;
  checkedAt: string;
  expiresAt: string;
  flights: FlightSnapshot[];
};
export function makeFlightStatusRoutes(deps: {
  workspaceAccess: RouterMiddleware;
  member: (id: string) => Promise<{ workspaceId: string } | null>;
  load: (id: string) => Promise<ScenarioBoard>;
}): RouterRoutes {
  return {
    "GET /api/travel/flight-status/connection": [
      deps.workspaceAccess,
      async (ctx) => {
        const member = await deps.member(ctx.user!.userId);
        return member
          ? json(flightStatusConfig(member.workspaceId))
          : error("Workspace required.", 403);
      },
    ],
    "POST /api/travel/journeys/:id/flight-status/check": [
      deps.workspaceAccess,
      async (ctx) => {
        const member = await deps.member(ctx.user!.userId);
        if (!member) return error("Workspace required.", 403);
        const parsed = z
          .object({
            expectedItineraryVersion: z.string(),
            expectedWorkspaceRevision: z.number().int(),
          })
          .strict()
          .safeParse(ctx.body);
        if (!parsed.success)
          return error("Refresh the current itinerary before checking.", 400);
        if (!flightStatusConfig(member.workspaceId).configured)
          return error(
            "Connect an authorized AeroAPI account in Replit Secrets first. Airport and weather feeds remain separate.",
            409,
          );
        try {
          const board = await deps.load(member.workspaceId),
            context = await planContext(
              member.workspaceId,
              ctx.params.id,
              board,
            );
          if (
            board.revision !== parsed.data.expectedWorkspaceRevision ||
            itineraryVersion(context.input.flights) !==
              parsed.data.expectedItineraryVersion
          )
            return error(
              "Your itinerary changed. Refresh before checking flight-specific status.",
              409,
            );
          if (!context.input.flights.length)
            return error(
              "Connect reviewed flight fields first; a confirmation number alone cannot identify an operating flight.",
              422,
            );
          if (context.input.flights.length > 12)
            return error(
              "Review at most 12 flight legs in one provider check.",
              422,
            );
          const flights: FlightSnapshot[] = [];
          for (const leg of context.input.flights)
            flights.push(await checkFlight(member.workspaceId, leg));
          if (
            (await db.workspaceRevision(member.workspaceId)) !== board.revision
          )
            return error(
              "Your itinerary changed during the provider check. Refresh to use the results.",
              409,
            );
          const result: Check = {
            id: randomUUID(),
            workspaceId: member.workspaceId,
            reportId: ctx.params.id,
            revision: board.revision || 0,
            itineraryVersion: parsed.data.expectedItineraryVersion,
            checkedAt: new Date().toISOString(),
            expiresAt: new Date(
              Math.min(
                ...flights.map((row) =>
                  Date.parse(row.evidence.expiresAt || ""),
                ),
              ),
            ).toISOString(),
            flights,
          };
          await db.tx.add(table, [result]);
          return json({
            ...result,
            workspaceId: undefined,
            configuration: flightStatusConfig(member.workspaceId),
          });
        } catch (failure) {
          return error(
            failure instanceof Error
              ? failure.message
              : "Flight-specific check unavailable.",
            422,
          );
        }
      },
    ],
    "POST /api/travel/flight-status/checks/:id/report-change": [
      deps.workspaceAccess,
      async (ctx) => {
        const member = await deps.member(ctx.user!.userId);
        if (!member) return error("Workspace required.", 403);
        const parsed = z
          .object({
            legIndex: z.number().int().min(0).max(11),
            reviewed: z.literal(true),
          })
          .strict()
          .safeParse(ctx.body);
        if (!parsed.success)
          return error(
            "Review the exact flight instance and proposed change first.",
            400,
          );
        const [saved] = await db.get<Check>(table, [ctx.params.id]);
        if (!saved || saved.workspaceId !== member.workspaceId)
          return error("Provider check not found.", 404);
        if (
          Date.parse(saved.expiresAt) <= Date.now() ||
          (await db.workspaceRevision(member.workspaceId)) !== saved.revision
        )
          return error(
            "This provider check expired or the shared trip changed. Check again before reporting.",
            409,
          );
        const flight = saved.flights[parsed.data.legIndex];
        if (
          !flight ||
          flight.state !== "matched" ||
          flight.evidence.state === "unavailable"
        )
          return error(
            "No exact provider match is available for this flight.",
            422,
          );
        if (!flight.canceled && !flight.replacement)
          return error(
            "No complete changed departure and arrival times were supplied. Confirm the flight with your airline.",
            422,
          );
        if (
          !flight.canceled &&
          flight.replacement &&
          ["departDate", "departTime", "arriveDate", "arriveTime"].every(
            (key) =>
              flight.replacement![key as keyof typeof flight.replacement] ===
              flight.leg[key as keyof typeof flight.leg],
          )
        )
          return error("The provider times do not change this saved leg.", 422);
        try {
          const change = await reportFlightChange(
            member.workspaceId,
            {
              id: randomUUID(),
              reportId: saved.reportId,
              originalLeg: flight.leg,
              replacementLeg: flight.canceled ? undefined : flight.replacement,
              status: flight.canceled ? "canceled" : "changed",
              checkedAt: flight.evidence.retrievedAt,
              notes:
                "Provider snapshot reviewed by the traveler; reservation and rebooking rights remain unverified.",
            },
            await deps.load(member.workspaceId),
            flight.evidence,
          );
          return json(change, 201);
        } catch (failure) {
          return error(
            failure instanceof Error
              ? failure.message
              : "The reported change could not be saved.",
            409,
          );
        }
      },
    ],
  };
}
