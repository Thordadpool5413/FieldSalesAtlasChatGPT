import app from "./app";
import { logger } from "./lib/logger";
import { refreshPublicSourceStatus } from "./field-atlas/backend/index";
import { closeEvents } from "./field-atlas/backend/runtime/events";
import { db } from "./field-atlas/backend/runtime/sdk";
import { runTravelReviews } from "./field-atlas/backend/travel/watch";

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

const travelReviews = setInterval(() => {
  void runTravelReviews().catch((err) =>
    logger.error({ err }, "Field Atlas travel review pass could not complete"),
  );
}, 30_000);
travelReviews.unref();

let lastScan = "";
let scanning = false;
const sourceHealthSchedule = setInterval(() => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  if (parts.hour !== "06" || parts.minute !== "00" || day === lastScan || scanning) {
    return;
  }

  lastScan = day;
  scanning = true;
  const now = new Date().toISOString();
  void refreshPublicSourceStatus({
    type: "cron",
    name: "field-atlas-daily-source-health",
    scheduledTime: now,
    invokedTime: now,
  }).finally(() => {
    scanning = false;
  });
}, 30_000);
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
  server.close(() => {
    db.close();
  });
  setTimeout(() => process.exit(), 5_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
