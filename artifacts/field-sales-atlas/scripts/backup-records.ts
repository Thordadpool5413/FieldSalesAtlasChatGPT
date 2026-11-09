import { db } from "../../api-server/src/field-atlas/backend/runtime/sdk";
import { PostgresDatabase } from "../../api-server/src/field-atlas/backend/runtime/postgres";
import { runPrivateBackup } from "../../api-server/src/field-atlas/backend/runtime/backup";
try {
  if (!(db instanceof PostgresDatabase))
    throw Error(
      "Complete the PostgreSQL migration before running private record backups.",
    );
  console.log(JSON.stringify(await runPrivateBackup(db), null, 2));
} catch (failure) {
  console.error(
    failure instanceof Error &&
      /^(Create |Set |Complete |Private |Backup )/.test(failure.message)
      ? failure.message
      : "Private backup failed. Verify App Storage access in Replit; no credentials were logged.",
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
