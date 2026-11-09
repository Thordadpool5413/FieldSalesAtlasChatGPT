import app from "./app";
import { logger } from "./lib/logger";
import { runMaintenance } from "./field-atlas/backend/maintenance";
import { closeEvents } from "./field-atlas/backend/runtime/events";
import { db } from "./field-atlas/backend/runtime/sdk";
import { runTravelReviews } from "./field-atlas/backend/travel/watch";
import { restoreBtsCache } from './field-atlas/backend/runtime/btsArchive';
import { existsSync } from 'node:fs';
import { workspacePath } from './field-atlas/backend/runtime/paths';
import { PostgresDatabase } from './field-atlas/backend/runtime/postgres';
import { assertMigratedWorkspaces } from './field-atlas/backend/runtime/migrate';

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await db.ready();
const oldStore = workspacePath((process.env.ATLAS_DATA_DIR || 'artifacts/field-sales-atlas/data') + '/atlas.sqlite');
if (db instanceof PostgresDatabase && existsSync(oldStore)) await assertMigratedWorkspaces(oldStore, db);
// BTS is rebuildable reference data. Failure leaves history unavailable and never
// prevents access to the durable workspace records.
await restoreBtsCache().catch(() => logger.warn('Private BTS cache restoration failed; historical coverage remains unavailable.'));

const travelReviews = setInterval(() => {
  void runTravelReviews().catch((err) =>
    logger.error({ err }, "Field Atlas travel review pass could not complete"),
  );
}, 30_000);
travelReviews.unref();

// Startup catches up a missed daily pass; persisted completion keys prevent replay.
void runMaintenance().catch(err => logger.error({ err }, 'Maintenance catch-up failed'));
const sourceHealthSchedule = setInterval(() => {
  void runMaintenance().catch(err => logger.error({ err }, 'Maintenance pass failed'));
}, 60_000);
sourceHealthSchedule.unref();

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(travelReviews);
  clearInterval(sourceHealthSchedule);
  closeEvents();
  server.close(async () => {
    await db.close();
  });
  setTimeout(() => process.exit(), 5_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
