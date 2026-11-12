import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  db,
  json,
  error,
  type RouterMiddleware,
  type RouterRoutes,
} from "../runtime/sdk";
import type { ScenarioBoard } from "./scenarios";
import { tripWorkspace } from "./companion";
import {
  calendarConfig,
  calendarScope,
  calendarRequest,
  publicOrigin,
  sealConnection,
  openConnection,
  exchangeToken,
  connectionTable,
  calendarEventKey,
  mappedEvent,
  saveMapping,
  eventPath,
  eventBody,
  type CalendarProvider,
  type CalendarConnection,
} from "./calendarConnection";
import type { TripEvent } from "../../shared/travel/companion";

const states = "atlas_calendar_oauth_states_v1",
  previews = "atlas_calendar_previews_v1";
const providerSchema = z.enum(["google", "microsoft"]);
type OAuthState = {
  id: string;
  provider: CalendarProvider;
  workspaceId: string;
  trainerId: string;
  expiresAt: string;
  used: boolean;
  box: string;
};
type Preview = {
  id: string;
  workspaceId: string;
  trainerId: string;
  provider: CalendarProvider;
  reportId: string;
  revision: number;
  itineraryVersion: string;
  expiresAt: string;
  used: boolean;
  items: Array<{
    event: TripEvent;
    key: string;
    eventId?: string;
    etag?: string;
    action: "create" | "update";
  }>;
  skipped: number;
};
function callbackPage(ok: boolean) {
  const nonce = randomBytes(16).toString("hex");
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Field Sales Atlas calendar</title><p>' +
      (ok
        ? "Calendar connected. Return to My Trip."
        : "Calendar connection did not complete. Return to My Trip and try again.") +
      '</p><script nonce="' +
      nonce +
      '">if(window.opener){window.opener.postMessage({type:"ATLAS_CALENDAR_CONNECTED",ok:' +
      ok +
      "}," +
      JSON.stringify(publicOrigin()) +
      ");window.close();}</script>",
    {
      status: ok ? 200 : 400,
      headers: {
        "Content-Type": "text/html;charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'nonce-" +
          nonce +
          "'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
export function makeCalendarRoutes(deps: {
  workspaceAccess: RouterMiddleware;
  member: (id: string) => Promise<{ workspaceId: string } | null>;
  load: (id: string) => Promise<ScenarioBoard>;
}): RouterRoutes {
  const access = deps.workspaceAccess;
  return {
    "GET /api/travel/calendar/connections": [
      access,
      async (ctx) => {
        const member = await deps.member(ctx.user!.userId);
        if (!member) return error("Workspace required.", 403);
        const saved = (
          await db.get<CalendarConnection>(
            connectionTable,
            ["google", "microsoft"].map(
              (provider) =>
                member.workspaceId + "|" + ctx.query.trainerId + "|" + provider,
            ),
            { consistent: true },
          )
        ).filter((row): row is CalendarConnection => !!row);
        return json({
          connections: (["google", "microsoft"] as const).map((provider) => ({
            provider,
            configured: calendarConfig(provider).configured,
            connected: saved.some((row) => row.provider === provider),
            connectedAt:
              saved.find((row) => row.provider === provider)?.connectedAt ||
              null,
          })),
          scope:
            "Only this trainer’s selected primary calendar. Calendar writes always require a fresh preview and your review.",
        });
      },
    ],
    "POST /api/travel/calendar/:provider/connect": [
      access,
      async (ctx) => {
        const member = await deps.member(ctx.user!.userId),
          parsed = providerSchema.safeParse(ctx.params.provider);
        if (!member) return error("Workspace required.", 403);
        if (!parsed.success) return error("Unknown calendar provider.", 400);
        const provider = parsed.data,
          config = calendarConfig(provider);
        const actor = z
          .object({
            workspaceId: z.string(),
            trainerId: z.enum(["trainer_a", "trainer_b"]),
          })
          .safeParse(ctx.body);
        if (
          !actor.success ||
          actor.data.workspaceId !== member.workspaceId ||
          actor.data.trainerId !== ctx.query.trainerId
        )
          return error(
            "The selected workspace or trainer changed. Review the connection again.",
            409,
          );
        if (!config.configured)
          return error(
            "Register this calendar integration and add its client credentials and encryption key to Replit Secrets first.",
            409,
          );
        const trainerId = ctx.query.trainerId;
        if (!["trainer_a", "trainer_b"].includes(trainerId))
          return error("Choose your trainer seat.", 400);
        const state = randomBytes(32).toString("hex"),
          id = createHash("sha256").update(state).digest("hex"),
          verifier = randomBytes(48).toString("base64url");
        await db.tx.add(states, [
          {
            id,
            provider,
            workspaceId: member.workspaceId,
            trainerId,
            used: false,
            expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
            box: sealConnection({ verifier }, id),
          },
        ]);
        const url = new URL(
          provider === "google"
            ? "https://accounts.google.com/o/oauth2/v2/auth"
            : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        );
        for (const [key, value] of Object.entries({
          client_id: config.clientId!,
          redirect_uri: config.redirect,
          response_type: "code",
          scope: calendarScope(provider),
          state,
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
          code_challenge_method: "S256",
          ...(provider === "google"
            ? { access_type: "offline", prompt: "consent" }
            : {}),
        }))
          url.searchParams.set(key, value);
        return json({ authorizationUrl: url.href });
      },
    ],
    "GET /api/travel/calendar/oauth/:provider/callback": [
      async (ctx) => {
        const parsed = providerSchema.safeParse(ctx.params.provider),
          state = ctx.query.state;
        if (!parsed.success || !state || !/^[a-f0-9]{64}$/.test(state))
          return callbackPage(false);
        const id = createHash("sha256").update(state).digest("hex"),
          [saved] = await db.get<OAuthState>(states, [id], {
            consistent: true,
          });
        if (
          !saved ||
          saved.used ||
          saved.provider !== parsed.data ||
          Date.parse(saved.expiresAt) <= Date.now()
        )
          return callbackPage(false);
        const [claimed] = await db.tx.update(
          states,
          [{ id, if: { used: false }, record: { used: true } }],
          { patch: true },
        );
        if (!claimed || ctx.query.error || !ctx.query.code)
          return callbackPage(false);
        try {
          const tokens = await exchangeToken(parsed.data, {
            grant_type: "authorization_code",
            code: ctx.query.code,
            redirect_uri: calendarConfig(parsed.data).redirect,
            code_verifier: openConnection<{ verifier: string }>(saved.box, id)
              .verifier,
          });
          const key =
            saved.workspaceId + "|" + saved.trainerId + "|" + parsed.data;
          await db.tx.update(connectionTable, [
            {
              id: key,
              record: {
                workspaceId: saved.workspaceId,
                trainerId: saved.trainerId,
                provider: parsed.data,
                box: sealConnection(tokens, key),
                version: randomUUID(),
                connectedAt: new Date().toISOString(),
              },
            },
          ]);
          return callbackPage(true);
        } catch {
          return callbackPage(false);
        }
      },
    ],
    "DELETE /api/travel/calendar/:provider/connection": [
      access,
      async (ctx) => {
        const member = await deps.member(ctx.user!.userId),
          parsed = providerSchema.safeParse(ctx.params.provider);
        if (!member) return error("Workspace required.", 403);
        if (!parsed.success) return error("Unknown calendar provider.", 400);
        const actor = z
          .object({
            workspaceId: z.string(),
            trainerId: z.enum(["trainer_a", "trainer_b"]),
          })
          .safeParse(ctx.body);
        if (
          !actor.success ||
          actor.data.workspaceId !== member.workspaceId ||
          actor.data.trainerId !== ctx.query.trainerId
        )
          return error(
            "Review this trainer’s connection before disconnecting.",
            409,
          );
        await db.delete(connectionTable, [
          member.workspaceId + "|" + ctx.query.trainerId + "|" + parsed.data,
        ]);
        return json({
          disconnected: true,
          limitation:
            "Stored access was removed from Atlas. Revoke the app in your provider account to end the provider grant. Existing calendar events remain.",
        });
      },
    ],
    "POST /api/travel/journeys/:id/calendar/preview": [
      access,
      async (ctx) => {
        const member = await deps.member(ctx.user!.userId),
          parsed = z
            .object({
              provider: providerSchema,
              expectedWorkspaceRevision: z.number().int(),
              expectedItineraryVersion: z.string(),
            })
            .strict()
            .safeParse(ctx.body);
        if (!member) return error("Workspace required.", 403);
        if (!parsed.success)
          return error("Review the current trip and calendar connection.", 400);
        try {
          const board = await deps.load(member.workspaceId),
            snapshot = await tripWorkspace(
              member.workspaceId,
              ctx.params.id,
              board,
            );
          if (snapshot.plan.pendingChange)
            return error(
              "Review the pending flight change before updating your calendar.",
              409,
            );
          if (
            snapshot.workspaceRevision !==
              parsed.data.expectedWorkspaceRevision ||
            snapshot.itineraryVersion !== parsed.data.expectedItineraryVersion
          )
            return error(
              "The trip changed. Refresh before previewing calendar updates.",
              409,
            );
          const [connection] = await db.get<CalendarConnection>(
            connectionTable,
            [
              member.workspaceId +
                "|" +
                ctx.query.trainerId +
                "|" +
                parsed.data.provider,
            ],
          );
          if (!connection)
            return error("Connect this trainer’s calendar first.", 409);
          const own = snapshot.timeline.filter(
              (event) => event.trainerId === ctx.query.trainerId,
            ),
            items: Preview["items"] = [];
          for (const event of own.filter(
            (event) =>
              event.startAt &&
              event.endAt &&
              Date.parse(event.endAt) > Date.parse(event.startAt),
          )) {
            const key = calendarEventKey(
                member.workspaceId,
                snapshot.plan.id,
                event.id,
              ),
              mapped = await mappedEvent(connection, key),
              existing = mapped
                ? await calendarRequest(
                    connection,
                    eventPath(connection.provider, mapped),
                  )
                : null;
            if (existing?.attendees?.length)
              throw Error(
                "An Atlas calendar event now has attendees. Review it in your calendar; Atlas will not update or notify those attendees.",
              );
            if (
              existing &&
              connection.provider === "google" &&
              existing.extendedProperties?.private?.atlasEventKey !== key
            )
              throw Error(
                "A calendar event ID is already in use by an unrelated event.",
              );
            const etag = existing && (existing.etag || existing["@odata.etag"]);
            if (
              existing &&
              (typeof existing.id !== "string" ||
                !existing.id ||
                existing.id.length > 1024 ||
                typeof etag !== "string" ||
                !etag ||
                etag.length > 1024)
            )
              throw Error(
                "The calendar did not return an edit version. No safe update preview is available.",
              );
            items.push({
              event,
              key,
              eventId: existing ? existing.id : undefined,
              etag: etag || undefined,
              action: existing ? "update" : "create",
            });
          }
          if (
            (await db.workspaceRevision(member.workspaceId)) !==
            snapshot.workspaceRevision
          )
            return error(
              "The saved trip changed during the preview. Refresh and try again.",
              409,
            );
          const preview: Preview = {
            id: randomUUID(),
            workspaceId: member.workspaceId,
            trainerId: ctx.query.trainerId,
            provider: parsed.data.provider,
            reportId: ctx.params.id,
            revision: snapshot.workspaceRevision,
            itineraryVersion: snapshot.itineraryVersion,
            expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
            used: false,
            items,
            skipped: own.length - items.length,
          };
          await db.tx.add(previews, [preview]);
          return json({
            id: preview.id,
            provider: preview.provider,
            expiresAt: preview.expiresAt,
            items: items.map((item) => ({
              id: item.event.id,
              title: item.event.title,
              startAt: item.event.startAt,
              endAt: item.event.endAt,
              action: item.action,
            })),
            skipped: preview.skipped,
            limitations: [
              "Only this trainer’s resolved flight and visit events are included. Unresolved times and cutoff-only events are excluded.",
              "Creates or updates Atlas events in the connected primary calendar; external events are not deleted.",
              "Events with attendees cannot be updated here. No invitations are sent.",
              "Changing or removing a saved trip does not automatically delete previously exported calendar events.",
            ],
          });
        } catch (failure) {
          return error(
            failure instanceof Error
              ? failure.message
              : "Calendar preview unavailable.",
            422,
          );
        }
      },
    ],
    "POST /api/travel/calendar/previews/:id/apply": [
      access,
      async (ctx) => {
        const member = await deps.member(ctx.user!.userId);
        if (!member) return error("Workspace required.", 403);
        if ((ctx.body as { reviewed?: boolean })?.reviewed !== true)
          return error("Review the listed events before applying.", 400);
        const [preview] = await db.get<Preview>(previews, [ctx.params.id], {
          consistent: true,
        });
        if (
          !preview ||
          preview.workspaceId !== member.workspaceId ||
          preview.trainerId !== ctx.query.trainerId
        )
          return error("Calendar preview not found for this trainer.", 404);
        if (
          preview.used ||
          Date.parse(preview.expiresAt) <= Date.now() ||
          (await db.workspaceRevision(member.workspaceId)) !== preview.revision
        )
          return error(
            "This calendar preview expired or the trip changed. Create a fresh preview.",
            409,
          );
        const [connection] = await db.get<CalendarConnection>(connectionTable, [
          member.workspaceId +
            "|" +
            ctx.query.trainerId +
            "|" +
            preview.provider,
        ]);
        if (!connection) return error("Reconnect the selected calendar.", 409);
        const [claimed] = await db.tx.update(
          previews,
          [{ id: preview.id, if: { used: false }, record: { used: true } }],
          { patch: true },
        );
        if (!claimed)
          return error(
            "This preview was already used. Create a new preview.",
            409,
          );
        const results: Array<{
          title: string;
          state: "saved" | "needs-review";
          reason?: string;
        }> = [];
        for (const item of preview.items) {
          try {
            if (
              (await db.workspaceRevision(member.workspaceId)) !==
              preview.revision
            )
              throw Error(
                "The trip changed during delivery. Refresh before applying the remaining events.",
              );
            const body = eventBody(connection.provider, item.event, item.key);
            if (connection.provider === "google" && !item.eventId)
              Object.assign(body, { id: item.key });
            const path =
              eventPath(connection.provider, item.eventId) +
              (connection.provider === "google" ? "?sendUpdates=none" : "");
            const saved = await calendarRequest(connection, path, {
              method: item.eventId ? "PATCH" : "POST",
              body,
              etag: item.etag,
            });
            if (
              typeof saved?.id !== "string" ||
              !saved.id ||
              saved.id.length > 1024
            )
              throw Error(
                "The provider did not confirm an event ID. Reopen the preview before retrying.",
              );
            await saveMapping(connection, item.key, saved.id);
            results.push({ title: item.event.title, state: "saved" });
          } catch (failure) {
            results.push({
              title: item.event.title,
              state: "needs-review",
              reason:
                failure instanceof Error
                  ? failure.message
                  : "Calendar delivery was not confirmed.",
            });
          }
        }
        return json({
          state: results.every((row) => row.state === "saved")
            ? "saved"
            : "partial",
          results,
          limitation:
            "Each event is delivered separately. A partial result is not an all-or-nothing calendar transaction. Reopen the preview before retrying.",
        });
      },
    ],
  };
}
