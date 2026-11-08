import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { refreshPublicSourceStatus } from "./index";
import { refreshAirportReference } from "./providers/airports";
import { runTravelReviews } from "./travel/watch";
import {
  dailyMaintenanceKey,
  runDurableJob,
  maintenanceStatus,
} from "./runtime/jobs";
import { workspacePath } from "./runtime/paths";

const execute = promisify(execFile);
let running: Promise<unknown> | null = null;
export function runMaintenance() {
  if (running) return running;
  running = (async () => {
    const key = dailyMaintenanceKey();
    const jobs: Array<[string, () => Promise<void>]> = [
      [
        "airport-reference",
        async () => {
          await refreshAirportReference();
        },
      ],
      [
        "source-health",
        async () => {
          const now = new Date().toISOString();
          await refreshPublicSourceStatus({
            type: "cron",
            name: "daily-source-health",
            scheduledTime: now,
            invokedTime: now,
          });
        },
      ],
    ];
    if (process.env.ATLAS_BACKUP_DIR)
      jobs.push([
        "database-backup",
        async () => {
          await execute(
            process.execPath,
            [
              workspacePath("scripts/backup-data.mjs"),
              resolve(process.env.ATLAS_BACKUP_DIR!),
            ],
            { timeout: 10 * 60000 },
          );
        },
      ]);
    if (process.env.ATLAS_BTS_AUTO_SYNC === "1")
      jobs.push([
        "bts-history",
        async () => {
          const local = workspacePath(".venv/bin/python");
          const python =
            process.env.ATLAS_PYTHON || (existsSync(local) ? local : "python3");
          await execute(python, ["scripts/sync-bts.py"], {
            cwd: workspacePath("artifacts/field-sales-atlas"),
            env: {
              ...process.env,
              ATLAS_DATA_DIR: workspacePath(
                process.env.ATLAS_DATA_DIR ||
                  "artifacts/field-sales-atlas/data",
              ),
            },
            timeout: 25 * 60000,
            maxBuffer: 1024 * 1024,
          });
        },
      ]);
    const outcomes = await Promise.allSettled([
      runTravelReviews(),
      ...jobs.map(([id, work]) => runDurableJob(id, key, work)),
    ]);
    return {
      ...(await maintenanceStatus()),
      outcomes: outcomes.map((row, index) => ({
        job: index === 0 ? "travel-reviews" : jobs[index - 1][0],
        state:
          row.status === "fulfilled"
            ? row.value === false
              ? "already-complete-or-leased"
              : "completed"
            : "failed",
      })),
    };
  })().finally(() => {
    running = null;
  });
  return running;
}
