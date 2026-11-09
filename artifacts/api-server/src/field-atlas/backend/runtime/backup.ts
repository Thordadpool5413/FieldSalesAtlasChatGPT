import { Client } from "@replit/object-storage";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash, randomUUID } from "node:crypto";
import { PostgresDatabase } from "./postgres";
import {
  insertSnapshot,
  postgresSnapshot,
  snapshotDigest,
  type StoreSnapshot,
} from "./migrate";

export type BackupStorage = Pick<Client, "uploadFromBytes" | "downloadAsBytes">;
const restoreTables = {
  records: "atlas_restore_records",
  revisions: "atlas_restore_revisions",
};
export const backupReceiptTable = "atlas_backup_receipts";
export const backupDestinationFingerprint = (bucket: string) =>
  createHash("sha256").update(bucket).digest("hex");
export function recentBackup(
  receipt: {
    createdAt: string;
    state: string;
    scope: string;
    destinationFingerprint?: string | null;
  } | null,
  env = process.env,
  now = Date.now(),
) {
  const age = now - Date.parse(receipt?.createdAt || "");
  return (
    !!receipt &&
    !!env.ATLAS_BACKUP_BUCKET_ID &&
    receipt.scope === env.ATLAS_BACKUP_SCOPE &&
    receipt.destinationFingerprint ===
      backupDestinationFingerprint(env.ATLAS_BACKUP_BUCKET_ID) &&
    receipt.state === "private-round-trip-and-record-restore-verified" &&
    age >= -300000 &&
    age <= 36 * 3600000
  );
}
export async function verifyRecordSnapshot(
  db: PostgresDatabase,
  snapshot: StoreSnapshot,
) {
  if (snapshot.digest !== snapshotDigest(snapshot.records, snapshot.revisions))
    throw Error("Backup content checksum mismatch.");
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "CREATE TEMP TABLE atlas_restore_records (LIKE atlas_records INCLUDING ALL) ON COMMIT DROP; CREATE TEMP TABLE atlas_restore_revisions (LIKE atlas_collection_revisions INCLUDING ALL) ON COMMIT DROP",
    );
    await insertSnapshot(client, snapshot, restoreTables);
    const restored = await postgresSnapshot(client, restoreTables);
    if (restored.digest !== snapshot.digest)
      throw Error("Backup temporary-table restoration mismatch.");
    await client.query("ROLLBACK");
  } catch (failure) {
    await client.query("ROLLBACK").catch(() => {});
    throw failure;
  } finally {
    client.release();
  }
}
export async function backupPostgres(
  db: PostgresDatabase,
  storage: BackupStorage,
  scope: string,
  destinationFingerprint: string | null = null,
) {
  if (!["development", "production"].includes(scope))
    throw Error("Set ATLAS_BACKUP_SCOPE to development or production.");
  await db.ready();
  const client = await db.pool.connect();
  let snapshot: StoreSnapshot;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    snapshot = await postgresSnapshot(client);
    await client.query("COMMIT");
  } catch (failure) {
    await client.query("ROLLBACK").catch(() => {});
    throw failure;
  } finally {
    client.release();
  }
  const createdAt = new Date().toISOString();
  const object =
    "atlas/" +
    scope +
    "/" +
    createdAt.replaceAll(":", "-") +
    "-" +
    randomUUID() +
    ".records.json.gz";
  const bytes = gzipSync(
    JSON.stringify({ version: 1, createdAt, scope, ...snapshot }),
  );
  const checksum = (value: Buffer) =>
    createHash("sha256").update(value).digest("hex");
  const uploaded = await storage.uploadFromBytes(object, bytes, {
    compress: false,
  });
  if (!uploaded.ok) throw Error("Private backup upload failed.");
  const downloaded = await storage.downloadAsBytes(object, {
    decompress: false,
  });
  if (!downloaded.ok || checksum(downloaded.value[0]) !== checksum(bytes))
    throw Error("Private backup read-back checksum failed.");
  const restored = JSON.parse(
    gunzipSync(downloaded.value[0]).toString(),
  ) as StoreSnapshot;
  await verifyRecordSnapshot(db, restored);
  const receipt = {
    state: "private-round-trip-and-record-restore-verified",
    createdAt,
    scope,
    destinationFingerprint,
    records: snapshot.records.length,
    digest: snapshot.digest,
    limitation:
      "Verified private object upload/download and restoration into temporary PostgreSQL tables. This does not verify host disaster recovery, database roles, or the separate BTS cache.",
  };
  await db.tx.update(backupReceiptTable, [{ id: "latest", record: receipt }]);
  return { ...receipt, object };
}
export async function runPrivateBackup(db: PostgresDatabase) {
  if (!process.env.ATLAS_BACKUP_BUCKET_ID)
    throw Error(
      "Create a private Replit App Storage bucket and set ATLAS_BACKUP_BUCKET_ID.",
    );
  return backupPostgres(
    db,
    new Client({ bucketId: process.env.ATLAS_BACKUP_BUCKET_ID }),
    process.env.ATLAS_BACKUP_SCOPE || "",
    backupDestinationFingerprint(process.env.ATLAS_BACKUP_BUCKET_ID),
  );
}
