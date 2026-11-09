import { randomUUID } from "node:crypto";
import { db } from "./sdk";
import { backupReceiptTable, recentBackup } from './backup';

export const jobTable = "atlas_maintenance_jobs";
export type JobState = {
  id: string;
  version: string;
  leaseUntil: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  completedKey?: string;
  retryAfter?: string;
  state: string;
  error?: string | null;
};
// Compare-and-swap leases coordinate processes sharing the selected record store.
export async function runDurableJob(
  id: string,
  key: string,
  work: () => Promise<void>,
  now = Date.now(),
  leaseMs = 30 * 60000,
) {
  await db.tx.add(jobTable, [
    { id, version: randomUUID(), leaseUntil: "", state: "pending" },
  ]);
  const [previous] = await db.get<JobState>(jobTable, [id]);
  if (
    !previous ||
    previous.completedKey === key ||
    Date.parse(previous.leaseUntil) > now ||
    Date.parse(previous.retryAfter || "") > now
  )
    return false;
  const version = randomUUID();
  const [claimed] = await db.tx.update(
    jobTable,
    [
      {
        id,
        if: { version: previous.version },
        record: {
          version,
          state: "running",
          lastAttemptAt: new Date(now).toISOString(),
          leaseUntil: new Date(now + leaseMs).toISOString(),
        },
      },
    ],
    { patch: true },
  );
  if (!claimed) return false;
  try {
    await work();
    await db.tx.update(
      jobTable,
      [
        {
          id,
          if: { version },
          record: {
            state: "complete",
            leaseUntil: "",
            completedKey: key,
            lastSuccessAt: new Date().toISOString(),
            retryAfter: "",
            error: null,
            version: randomUUID(),
          },
        },
      ],
      { patch: true },
    );
  } catch {
    // Public diagnostics never store command output, tokens, records or URLs with queries.
    await db.tx.update(
      jobTable,
      [
        {
          id,
          if: { version },
          record: {
            state: "failed",
            leaseUntil: "",
            retryAfter: new Date(Date.now() + 15 * 60000).toISOString(),
            error:
              "Job failed. Last successful data was preserved; inspect server logs.",
            version: randomUUID(),
          },
        },
      ],
      { patch: true },
    );
    throw new Error("Maintenance job failed: " + id);
  }
  return true;
}
export async function maintenanceStatus() {
  const [backupReceipt] = await db.get<{ createdAt: string; state: string; scope: string; limitation: string; destinationFingerprint?: string | null }>(backupReceiptTable, ['latest']);
  const jobs = (await db.list<JobState>(jobTable, { limit: 100 })).items.map(
    ({
      id,
      state,
      lastAttemptAt,
      lastSuccessAt,
      completedKey,
      leaseUntil,
      retryAfter,
      error,
    }) => ({
      id,
      state,
      lastAttemptAt,
      lastSuccessAt,
      completedKey,
      leaseUntil,
      retryAfter,
      error,
    }),
  );
  return {
    checkedAt: new Date().toISOString(),
    jobs,
    storage: {
      engine: db.kind === 'postgres' ? 'PostgreSQL' : 'SQLite WAL',
      deployment:
        db.kind === 'postgres' ? 'External database; use one app instance until cross-instance live events are implemented' : 'Local file; published Replit filesystem is not durable storage',
      durability: db.kind === 'postgres' ? 'external-database-connected; host-recovery-unverified' : 'unverified',
      limitation:
        db.kind === 'postgres' ? 'Database connectivity is verified by this query. Production database selection and disaster recovery still require host verification.' : 'A writable local file does not prove persistence. Migrate private records to PostgreSQL before relying on a published Replit deployment.',
    },
    scheduling: {
      mode: "In-process catch-up with durable leases",
      externalTriggerConfigured:
        (process.env.ATLAS_MAINTENANCE_TOKEN || "").length >= 32,
      externalSchedulerVerified: false,
      limitation:
        "Timers run only while an instance is awake. Configure an external scheduled trigger for sleeping deployments; a configured token does not prove delivery.",
    },
    backups: {
      configured: !!process.env.ATLAS_BACKUP_BUCKET_ID || !!process.env.ATLAS_BACKUP_DIR,
      restoreVerified: false,
      recordRestoreVerifiedAt: backupReceipt?.createdAt || null,
      recordBackupFresh: recentBackup(backupReceipt),
      recordBackup: backupReceipt || null,
      limitation:
        'A private-backup receipt verifies only its recorded object round trip and temporary-table restore. Complete host disaster recovery remains unverified.',
    },
    btsAutoSync: process.env.ATLAS_BTS_AUTO_SYNC === "1",
  };
}
export function dailyMaintenanceKey(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  // Before 06:00 Eastern, catch up yesterday's pass. UTC offset varies with DST.
  if (Number(parts.hour) < 6) {
    const yesterday = new Date(
      Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day) - 1,
      ),
    );
    return yesterday.toISOString().slice(0, 10);
  }
  return parts.year + "-" + parts.month + "-" + parts.day;
}
