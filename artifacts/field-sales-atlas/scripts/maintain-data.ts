import { runMaintenance } from "../../api-server/src/field-atlas/backend/maintenance";
import { db } from "../../api-server/src/field-atlas/backend/runtime/sdk";
try {
  const result = await runMaintenance();
  console.log(JSON.stringify(result, null, 2));
  if (result.outcomes.some((row) => row.state === "failed"))
    process.exitCode = 1;
} finally {
  await db.close();
}
