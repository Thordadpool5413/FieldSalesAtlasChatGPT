import webpush from "web-push";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  db,
  json,
  error,
  type RouterMiddleware,
  type RouterRoutes,
} from "../runtime/sdk";
import { allRecords } from "./context";
import { inZone, validZone, zonedInstant } from "../../shared/travel/time";
const subscriptions = "atlas_web_push_subscriptions_v1",
  jobs = "atlas_web_push_jobs_v1",
  keys = "atlas_web_push_keys_v1";
const inbox = (id: string) => "atlas_trip_notifications_" + id;
const reads = (id: string) => "atlas_trip_notification_reads_" + id;
type QuietHours = { start: string; end: string; timeZone: string };
type Subscription = {
  id: string;
  workspaceId: string;
  trainerId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
  quiet?: QuietHours;
};
type Notice = {
  id: string;
  reportId: string;
  createdAt: string;
  readBy?: Record<string, string>;
  title: string;
  detail: string;
};
type PushJob = {
  id: string;
  subscriptionId: string;
  notice: Notice;
  workspaceId: string;
  version: string;
  state: "queued" | "sending" | "accepted" | "expired";
  attempts: number;
  nextRun: string;
  leaseUntil: string;
  acceptedAt?: string;
};
function trustedEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      url.href.length < 2048 &&
      ([
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(url.hostname) ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const quietSchema = z
  .object({ start: clock, end: clock, timeZone: z.string().refine(validZone) })
  .strict()
  .refine((row) => row.start !== row.end);
const schema = z
  .object({
    endpoint: z.string().refine(trustedEndpoint),
    keys: z.object({
      p256dh: z
        .string()
        .regex(/^[\w-]+=*$/)
        .max(100),
      auth: z
        .string()
        .regex(/^[\w-]+=*$/)
        .max(30),
    }),
    trainerId: z.enum(["trainer_a", "trainer_b"]),
    workspaceId: z.string().min(1),
    quiet: quietSchema.optional(),
  })
  .strict();
export function quietUntil(
  quiet: QuietHours | undefined,
  now: number,
): string | null {
  if (!quiet) return null;
  const local = inZone(new Date(now).toISOString(), quiet.timeZone);
  const overnight = quiet.start > quiet.end;
  if (
    !(overnight
      ? local.time >= quiet.start || local.time < quiet.end
      : local.time >= quiet.start && local.time < quiet.end)
  )
    return null;
  let date = local.date;
  if (overnight && local.time >= quiet.start)
    date = new Date(Date.parse(date + "T12:00:00Z") + 86400000)
      .toISOString()
      .slice(0, 10);
  return zonedInstant(date, quiet.end, quiet.timeZone, "later");
}
async function applicationKeys() {
  const [saved] = await db.get<{ publicKey: string; privateKey: string }>(
    keys,
    ["application"],
    { consistent: true },
  );
  if (saved) return saved;
  const generated = webpush.generateVAPIDKeys();
  try {
    await db.tx.add(keys, [{ id: "application", ...generated }]);
    return generated;
  } catch {
    const [winner] = await db.get<typeof generated>(keys, ["application"], {
      consistent: true,
    });
    if (!winner) throw Error("Notification keys unavailable.");
    return winner;
  }
}
export async function queueTripNotice(
  workspaceId: string,
  reportId: string,
  changeId: string,
  title: string,
  detail: string,
) {
  const id = createHash("sha256")
      .update(workspaceId + "|" + reportId + "|" + changeId)
      .digest("hex"),
    notice: Notice = {
      id,
      reportId,
      title: title.slice(0, 100),
      detail: detail.slice(0, 500),
      createdAt: new Date().toISOString(),
    };
  try {
    await db.tx.add(inbox(workspaceId), [notice]);
  } catch {
    const [existing] = await db.get<Notice>(inbox(workspaceId), [id]);
    if (!existing) throw Error("Trip update could not be recorded.");
    notice.createdAt = existing.createdAt;
  }
  const subscribers = (await allRecords<Subscription>(subscriptions)).filter(
    (row) => row.workspaceId === workspaceId,
  );
  for (const subscription of subscribers) {
    const key = createHash("sha256")
      .update(id + "|" + subscription.id)
      .digest("hex");
    try {
      await db.tx.add(jobs, [
        {
          id: key,
          subscriptionId: subscription.id,
          workspaceId,
          notice,
          version: randomUUID(),
          state: "queued",
          attempts: 0,
          nextRun: notice.createdAt,
          leaseUntil: "",
        },
      ]);
    } catch {
      /* This notice is already queued for that device. */
    }
  }
}
export async function deliverTripNotifications(
  now = Date.now(),
  send: typeof webpush.sendNotification = webpush.sendNotification,
) {
  const pending = (await allRecords<PushJob>(jobs))
    .filter(
      (row) =>
        (row.state === "queued" ||
          (row.state === "sending" && Date.parse(row.leaseUntil) <= now)) &&
        Date.parse(row.nextRun) <= now,
    )
    .slice(0, 10);
  if (!pending.length) return { processed: 0 };
  const vapid = await applicationKeys();
  let processed = 0;
  for (const job of pending) {
    const version = randomUUID(),
      [claimed] = await db.tx.update(
        jobs,
        [
          {
            id: job.id,
            if: { version: job.version },
            record: {
              version,
              state: "sending",
              leaseUntil: new Date(now + 60000).toISOString(),
            },
          },
        ],
        { patch: true },
      );
    if (!claimed) continue;
    const [subscription] = await db.get<Subscription>(
        subscriptions,
        [job.subscriptionId],
        { consistent: true },
      ),
      [notice] = await db.get<Notice>(inbox(job.workspaceId), [job.notice.id]);
    const [read] = subscription
      ? await db.get<{ id: string; readAt: string }>(reads(job.workspaceId), [
          job.notice.id + "|" + subscription.trainerId,
        ])
      : [];
    if (
      !subscription ||
      !notice ||
      read ||
      !trustedEndpoint(subscription.endpoint) ||
      Date.parse(job.notice.createdAt) < now - 24 * 3600000
    ) {
      await db.tx.update(
        jobs,
        [
          {
            id: job.id,
            if: { version },
            record: { state: "expired", leaseUntil: "" },
          },
        ],
        { patch: true },
      );
      continue;
    }
    const resume = quietUntil(subscription.quiet, now);
    if (resume) {
      await db.tx.update(
        jobs,
        [
          {
            id: job.id,
            if: { version },
            record: { state: "queued", nextRun: resume, leaseUntil: "" },
          },
        ],
        { patch: true },
      );
      continue;
    }
    try {
      // Payloads deliberately omit itinerary fields, names and workspace access keys.
      await send(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        JSON.stringify({
          title: "Field Sales Atlas",
          body: "Your trip has an update. Open the app to review the latest evidence.",
          reportId: job.notice.reportId,
          workspaceId: job.workspaceId,
          noticeId: job.notice.id,
        }),
        {
          TTL: 300,
          timeout: 5000,
          vapidDetails: {
            subject:
              process.env.ATLAS_PUSH_SUBJECT ||
              "https://field-sales-atlas.replit.app",
            publicKey: vapid.publicKey,
            privateKey: vapid.privateKey,
          },
        },
      );
      await db.tx.update(
        jobs,
        [
          {
            id: job.id,
            if: { version },
            record: {
              state: "accepted",
              acceptedAt: new Date().toISOString(),
              leaseUntil: "",
            },
          },
        ],
        { patch: true },
      );
      processed++;
    } catch (failure) {
      const status = (failure as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410)
        await db.delete(subscriptions, [subscription.id]);
      const attempts = job.attempts + 1;
      await db.tx.update(
        jobs,
        [
          {
            id: job.id,
            if: { version },
            record: {
              state:
                status === 404 || status === 410 || attempts >= 6
                  ? "expired"
                  : "queued",
              attempts,
              leaseUntil: "",
              version: randomUUID(),
              nextRun: new Date(
                now + Math.min(3600000, 60000 * 2 ** attempts),
              ).toISOString(),
            },
          },
        ],
        { patch: true },
      );
    }
  }
  return { processed };
}
export function makeNotificationRoutes(deps: {
  workspaceAccess: RouterMiddleware;
  member: (id: string) => Promise<{ workspaceId: string } | null>;
}): RouterRoutes {
  const access = deps.workspaceAccess;
  return {
    "GET /api/travel/notifications": [
      access,
      async (ctx) => {
        const m = await deps.member(ctx.user!.userId);
        if (!m) return error("Workspace required.", 403);
        const notices = (await allRecords<Notice>(inbox(m.workspaceId)))
          .filter(
            (row) => !ctx.query.reportId || row.reportId === ctx.query.reportId,
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 50);
        const viewed = await db.get<{ readAt: string }>(
          reads(m.workspaceId),
          notices.map((row) => row.id + "|" + ctx.query.trainerId),
        );
        return json({
          notices: notices.map((row, index) => ({
            ...row,
            readBy: undefined,
            readAt: viewed[index]?.readAt,
          })),
          deliveryScope:
            "Push-service acceptance is not proof a notification was displayed or read.",
        });
      },
    ],
    "POST /api/travel/notifications/:id/read": [
      access,
      async (ctx) => {
        const m = await deps.member(ctx.user!.userId);
        if (!m) return error("Workspace required.", 403);
        const [notice] = await db.get<Notice>(inbox(m.workspaceId), [
          ctx.params.id,
        ]);
        if (!notice) return error("Update not found.", 404);
        // A distinct record per trainer avoids one reader suppressing a partner's alert.
        await db.tx.update(reads(m.workspaceId), [
          {
            id: notice.id + "|" + ctx.query.trainerId,
            record: { readAt: new Date().toISOString() },
          },
        ]);
        return json({ read: true });
      },
    ],
    "GET /api/travel/push/public-key": [
      access,
      async () => json({ publicKey: (await applicationKeys()).publicKey }),
    ],
    "POST /api/travel/push/subscription": [
      access,
      async (ctx) => {
        const m = await deps.member(ctx.user!.userId);
        if (!m) return error("Workspace required.", 403);
        const parsed = schema.safeParse(ctx.body);
        if (
          !parsed.success ||
          parsed.data.trainerId !== ctx.query.trainerId ||
          parsed.data.workspaceId !== m.workspaceId
        )
          return error("Supply this trainer’s browser push subscription.", 400);
        if (
          Buffer.from(parsed.data.keys.p256dh, "base64url").length !== 65 ||
          Buffer.from(parsed.data.keys.auth, "base64url").length !== 16
        )
          return error("Invalid browser subscription keys.", 400);
        const own = (await allRecords<Subscription>(subscriptions)).filter(
          (row) =>
            row.workspaceId === m.workspaceId &&
            row.trainerId === ctx.query.trainerId,
        );
        const id = createHash("sha256")
          .update(
            m.workspaceId +
              "|" +
              ctx.query.trainerId +
              "|" +
              parsed.data.endpoint,
          )
          .digest("hex");
        if (own.length >= 10 && !own.some((row) => row.id === id))
          return error(
            "Remove an old device subscription before adding another.",
            409,
          );
        await db.tx.update(subscriptions, [
          {
            id,
            record: {
              ...parsed.data,
              workspaceId: m.workspaceId,
              createdAt: new Date().toISOString(),
            },
          },
        ]);
        return json({ subscribed: true, id });
      },
    ],
    "POST /api/travel/push/status": [
      access,
      async (ctx) => {
        const m = await deps.member(ctx.user!.userId);
        if (!m) return error("Workspace required.", 403);
        const endpoint = (ctx.body as { endpoint?: string })?.endpoint;
        if (typeof endpoint !== "string" || !trustedEndpoint(endpoint))
          return json({ subscribed: false });
        const id = createHash("sha256")
            .update(m.workspaceId + "|" + ctx.query.trainerId + "|" + endpoint)
            .digest("hex"),
          [saved] = await db.get<Subscription>(subscriptions, [id]);
        return json({ subscribed: !!saved, quiet: saved?.quiet || null });
      },
    ],
    "DELETE /api/travel/push/subscription": [
      access,
      async (ctx) => {
        const m = await deps.member(ctx.user!.userId);
        if (!m) return error("Workspace required.", 403);
        const endpoint = (ctx.body as { endpoint?: string })?.endpoint;
        const actor = ctx.body as { trainerId?: string; workspaceId?: string };
        if (
          actor.trainerId !== ctx.query.trainerId ||
          actor.workspaceId !== m.workspaceId
        )
          return error("Review this trainer’s device subscription again.", 409);
        if (typeof endpoint !== "string" || !trustedEndpoint(endpoint))
          return error("Supply this device subscription.", 400);
        const id = createHash("sha256")
          .update(m.workspaceId + "|" + ctx.query.trainerId + "|" + endpoint)
          .digest("hex");
        await db.delete(subscriptions, [id]);
        return json({ subscribed: false });
      },
    ],
  };
}
