import { db } from "../../api-server/src/field-atlas/backend/runtime/sdk";
import { archiveBtsCache } from "../../api-server/src/field-atlas/backend/runtime/btsArchive";
try {
  console.log(JSON.stringify(await archiveBtsCache(), null, 2));
} catch {
  console.error(
    "BTS archive failed. Verify the private bucket and scope in Replit; no credentials were logged.",
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
