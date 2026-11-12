import { z } from "zod";
import {
  db,
  json,
  error,
  type RouterMiddleware,
  type RouterRoutes,
} from "../runtime/sdk";
import { tripWorkspace } from "./companion";
import type { ScenarioBoard } from "./scenarios";
import { planContext } from "./context";
import { itineraryVersion } from "./readiness";
import { flightStatusConfig } from "../providers/flightStatus";
import {
  setFlightMonitoring,
  cancelWatch,
  queueWatch,
  watchesFor,
} from "./watch";

const envelopeSchema = z
  .object({
    algorithm: z.literal("AES-256-GCM"),
    kdf: z.literal("PBKDF2-SHA256"),
    iterations: z.literal(600000),
    salt: z
      .string()
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .max(30),
    iv: z
      .string()
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .max(20),
    ciphertext: z
      .string()
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .max(750000),
    format: z.literal(1),
  })
  .strict();
type Vault = {
  id: string;
  version: number;
  updatedAt: string;
  envelope: z.infer<typeof envelopeSchema> | null;
};
export function makeCompanionRoutes(deps: {
  workspaceAccess: RouterMiddleware;
  member: (id: string) => Promise<{ workspaceId: string } | null>;
  load: (workspaceId: string) => Promise<ScenarioBoard>;
}): RouterRoutes {
  const access = deps.workspaceAccess;
  const vaultTable = (id: string) => "atlas_private_travel_" + id;
  return {
    "GET /api/travel/journeys/:id/workspace": [
      access,
      async (ctx) => {
        const m = await deps.member(ctx.user!.userId);
        if (!m) return error("Workspace required.", 403);
        try {
          const board = await deps.load(m.workspaceId);
          if (board.truncated)
            return error("Complete workspace records are required.", 409);
          const result = await tripWorkspace(
            m.workspaceId,
            ctx.params.id,
            board,
          );
          if ((await db.workspaceRevision(m.workspaceId)) !== board.revision)
            return error("Your shared plan changed. Refresh My Trip.", 409);
          return json(result);
        } catch (failure) {
          return error(
            failure instanceof Error
              ? failure.message
              : "The trip could not be opened.",
            422,
          );
        }
      },
    ],
    "PUT /api/travel/journeys/:id/monitoring": [
      access,
      async (ctx) => {
        const m = await deps.member(ctx.user!.userId);
        if (!m) return error("Workspace required.", 403);
        const parsed = z
          .object({
            enabled: z.boolean(),
            flightStatus: z.boolean().optional(),
            expectedItineraryVersion: z.string(),
            expectedWorkspaceRevision: z.number().int().nonnegative(),
          })
          .safeParse(ctx.body);
        if (!parsed.success)
          return error(
            "Review the current trip before changing monitoring.",
            400,
          );
        if (
          parsed.data.flightStatus &&
          (!flightStatusConfig(m.workspaceId).configured ||
            !flightStatusConfig().backgroundEnabled)
        )
          return error(
            "Enable an authorized flight provider and its background-polling policy in Replit Secrets first.",
            409,
          );
        try {
          const board = await deps.load(m.workspaceId),
            context = await planContext(m.workspaceId, ctx.params.id, board);
          if (
            board.revision !== parsed.data.expectedWorkspaceRevision ||
            itineraryVersion(context.input.flights) !==
              parsed.data.expectedItineraryVersion
          )
            return error(
              "The trip changed. Refresh before updating monitoring.",
              409,
            );
          const matching = (await watchesFor(m.workspaceId)).filter(
            (watch) =>
              !["stopped", "complete"].includes(watch.state) &&
              watch.tripIds.some((id) => context.tripIds.includes(id)),
          );
          if (parsed.data.enabled && !matching.length)
            await queueWatch(
              m.workspaceId,
              context.report,
              context.tripIds,
              context.input.flights,
              parsed.data.flightStatus === true,
            );
          if (
            parsed.data.enabled &&
            typeof parsed.data.flightStatus === "boolean"
          )
            for (const watch of matching)
              if (
                !(await setFlightMonitoring(
                  m.workspaceId,
                  watch.id,
                  parsed.data.flightStatus,
                ))
              )
                return error(
                  "Trip monitoring changed. Refresh before retrying.",
                  409,
                );
          if (!parsed.data.enabled)
            for (const watch of matching)
              await cancelWatch(m.workspaceId, watch.id);
          return json({ enabled: parsed.data.enabled });
        } catch (failure) {
          return error(
            failure instanceof Error
              ? failure.message
              : "Monitoring could not be updated.",
            409,
          );
        }
      },
    ],
    "GET /api/travel/private-sync": [
      access,
      async (ctx) => {
        const m = await deps.member(ctx.user!.userId);
        if (!m) return error("Workspace required.", 403);
        const seat = ctx.query.trainerId;
        if (seat !== "trainer_a" && seat !== "trainer_b")
          return error("Choose your trainer seat.", 400);
        const [saved] = await db.get<Vault>(vaultTable(m.workspaceId), [seat], {
          consistent: true,
        });
        return json({
          version: saved?.version || 0,
          updatedAt: saved?.updatedAt || null,
          envelope: saved?.envelope || null,
          trainerId: seat,
        });
      },
    ],
    "PUT /api/travel/private-sync": [
      access,
      async (ctx) => {
        const m = await deps.member(ctx.user!.userId);
        if (!m) return error("Workspace required.", 403);
        const seat = ctx.query.trainerId;
        if (seat !== "trainer_a" && seat !== "trainer_b")
          return error("Choose your trainer seat.", 400);
        const parsed = z
          .object({
            expectedVersion: z.number().int().nonnegative(),
            workspaceId: z.string().min(1),
            trainerId: z.enum(["trainer_a", "trainer_b"]),
            envelope: envelopeSchema,
          })
          .strict()
          .safeParse(ctx.body);
        if (!parsed.success)
          return error(
            "Only a bounded encrypted travel snapshot can be synchronized.",
            400,
          );
        if (
          parsed.data.workspaceId !== m.workspaceId ||
          parsed.data.trainerId !== seat
        )
          return error(
            "The selected workspace or trainer changed. Open the intended copy before saving.",
            409,
          );
        const envelope = parsed.data.envelope;
        if (
          Buffer.from(envelope.salt, "base64").length !== 16 ||
          Buffer.from(envelope.iv, "base64").length !== 12 ||
          Buffer.from(envelope.ciphertext, "base64").length < 17
        )
          return error("Invalid encrypted travel snapshot.", 400);
        const table = vaultTable(m.workspaceId),
          [before] = await db.get<Vault>(table, [seat], { consistent: true });
        if ((before?.version || 0) !== parsed.data.expectedVersion)
          return error(
            "Another device updated your encrypted copy. Download and review that version first.",
            409,
          );
        const saved: Vault = {
          id: seat,
          version: (before?.version || 0) + 1,
          updatedAt: new Date().toISOString(),
          envelope,
        };
        try {
          if (before) {
            const [updated] = await db.tx.update(table, [
              { id: seat, if: { version: before.version }, record: saved },
            ]);
            if (!updated)
              return error(
                "Another device saved first. Refresh and review both copies.",
                409,
              );
          } else await db.tx.add(table, [saved]);
        } catch {
          return error(
            "Another device saved first. Refresh and review both copies.",
            409,
          );
        }
        return json({ version: saved.version, updatedAt: saved.updatedAt });
      },
    ],
    "DELETE /api/travel/private-sync": [
      access,
      async (ctx) => {
        const m = await deps.member(ctx.user!.userId);
        if (!m) return error("Workspace required.", 403);
        const seat = ctx.query.trainerId;
        if (seat !== "trainer_a" && seat !== "trainer_b")
          return error("Choose your trainer seat.", 400);
        const parsed = z
          .object({
            expectedVersion: z.number().int().nonnegative(),
            workspaceId: z.string(),
            trainerId: z.enum(["trainer_a", "trainer_b"]),
          })
          .strict()
          .safeParse(ctx.body);
        if (
          !parsed.success ||
          parsed.data.workspaceId !== m.workspaceId ||
          parsed.data.trainerId !== seat
        )
          return error(
            "Review the selected encrypted copy before removing it.",
            409,
          );
        const table = vaultTable(m.workspaceId),
          [before] = await db.get<Vault>(table, [seat], { consistent: true });
        if (!before || before.version !== parsed.data.expectedVersion)
          return error(
            "Another device changed this copy. Refresh before removing it.",
            409,
          );
        const [changed] = await db.tx.update(
          table,
          [
            {
              id: seat,
              if: { version: before.version },
              record: {
                envelope: null,
                version: before.version + 1,
                updatedAt: new Date().toISOString(),
              },
            },
          ],
          { patch: true },
        );
        return changed
          ? json({ version: before.version + 1, removed: true })
          : error("Another device saved first. Refresh and review.", 409);
      },
    ],
  };
}
