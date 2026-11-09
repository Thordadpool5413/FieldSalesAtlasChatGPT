import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PostgresDatabase } from "../../api-server/src/field-atlas/backend/runtime/postgres";
import { migrateSqlite } from "../../api-server/src/field-atlas/backend/runtime/migrate";
import {
  workspacePath,
  workspaceRoot,
} from "../../api-server/src/field-atlas/backend/runtime/paths";
import { inspectRuntime } from "../../../scripts/runtime-state.mjs";

const apply = process.argv.includes("--apply");
const file = workspacePath(
  resolve(
    workspacePath(
      process.env.ATLAS_DATA_DIR || "artifacts/field-sales-atlas/data",
    ),
    "atlas.sqlite",
  ),
);
if (!existsSync(file))
  throw Error(
    "Existing SQLite file was not found. No source database was created.",
  );
if (!process.env.DATABASE_URL)
  throw Error(
    "Connect the Replit PostgreSQL database so DATABASE_URL is available; do not paste its value into chat.",
  );
if (apply) {
  const runtime = await inspectRuntime(workspaceRoot());
  if (runtime.state !== "stopped")
    throw Error(
      "Stop Run and the active Shell app before applying the migration. Both application ports must be free.",
    );
}
const target = new PostgresDatabase(process.env.DATABASE_URL);
try {
  console.log(
    JSON.stringify(await migrateSqlite(file, target, apply), null, 2),
  );
} catch (failure) {
  console.error(
    failure instanceof Error &&
      /Source |Target |SQL|Stop /.test(failure.message)
      ? failure.message
      : "Migration failed; source records were preserved. Check the configured PostgreSQL connection.",
  );
  process.exitCode = 1;
} finally {
  await target.close();
}
