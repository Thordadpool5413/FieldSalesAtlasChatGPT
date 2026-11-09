import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import type { PoolClient } from "@workspace/db/driver";
import { PostgresDatabase } from "./postgres";

export async function assertMigratedWorkspaces(
  file: string,
  target: PostgresDatabase,
) {
  const source = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = source
      .prepare(
        "SELECT id FROM records WHERE collection='atlas_teams' ORDER BY id",
      )
      .all();
    if (!rows.length) return;
    const result = await target.pool.query(
      "SELECT id FROM atlas_records WHERE collection='atlas_teams' AND id=ANY($1::text[])",
      [rows.map((row) => String(row.id))],
    );
    if (result.rowCount !== rows.length)
      throw Error(
        "PostgreSQL is missing existing SQLite workspaces. Stop the app and complete data:migrate-records before switching stores.",
      );
  } finally {
    source.close();
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            canonicalJson((value as Record<string, unknown>)[key]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
type SnapshotRecord = {
  collection: string;
  id: string;
  document: Record<string, unknown>;
};
type Revision = { collection: string; revision: number };
export type StoreSnapshot = {
  records: SnapshotRecord[];
  revisions: Revision[];
  digest: string;
};
export function snapshotDigest(
  records: SnapshotRecord[],
  revisions: Revision[],
) {
  const hash = createHash("sha256");
  for (const record of records) hash.update(canonicalJson(record) + "\n");
  for (const revision of revisions) hash.update(canonicalJson(revision) + "\n");
  return hash.digest("hex");
}
export async function postgresSnapshot(
  client: Pick<PoolClient, "query">,
  tables = {
    records: "atlas_records",
    revisions: "atlas_collection_revisions",
  },
): Promise<StoreSnapshot> {
  if (
    !["atlas_records", "atlas_restore_records"].includes(tables.records) ||
    !["atlas_collection_revisions", "atlas_restore_revisions"].includes(
      tables.revisions,
    )
  )
    throw Error("Unsupported snapshot table.");
  const records: SnapshotRecord[] = [];
  let lastCollection = "",
    lastId = "";
  while (true) {
    const page = await client.query(
      `SELECT collection,id,document FROM ${tables.records} WHERE (collection COLLATE "C",id COLLATE "C")>($1,$2) ORDER BY collection COLLATE "C",id COLLATE "C" LIMIT 500`,
      [lastCollection, lastId],
    );
    if (!page.rows.length) break;
    records.push(...page.rows);
    lastCollection = page.rows.at(-1)!.collection;
    lastId = page.rows.at(-1)!.id;
  }
  const revisions = (
    await client.query(
      `SELECT collection,revision::text AS revision FROM ${tables.revisions} ORDER BY collection COLLATE "C"`,
    )
  ).rows.map((row) => ({
    collection: row.collection,
    revision: Number(row.revision),
  }));
  return { records, revisions, digest: snapshotDigest(records, revisions) };
}
export async function insertSnapshot(
  client: PoolClient,
  snapshot: StoreSnapshot,
  tables = {
    records: "atlas_records",
    revisions: "atlas_collection_revisions",
  },
) {
  // Table identifiers are fixed internal constants, never CLI or document values.
  if (
    !["atlas_records", "atlas_restore_records"].includes(tables.records) ||
    !["atlas_collection_revisions", "atlas_restore_revisions"].includes(
      tables.revisions,
    )
  )
    throw Error("Unsupported snapshot table.");
  for (let offset = 0; offset < snapshot.records.length; offset += 500)
    await client.query(
      `INSERT INTO ${tables.records}(collection,id,document) SELECT collection,id,document FROM jsonb_to_recordset($1::jsonb) AS r(collection text,id text,document jsonb)`,
      [JSON.stringify(snapshot.records.slice(offset, offset + 500))],
    );
  for (let offset = 0; offset < snapshot.revisions.length; offset += 500)
    await client.query(
      `INSERT INTO ${tables.revisions}(collection,revision) SELECT collection,revision FROM jsonb_to_recordset($1::jsonb) AS r(collection text,revision bigint)`,
      [JSON.stringify(snapshot.revisions.slice(offset, offset + 500))],
    );
}
export async function migrateSqlite(
  file: string,
  target: PostgresDatabase,
  apply = false,
) {
  const source = new DatabaseSync(file, { readOnly: !apply });
  let sourceTransaction = false;
  try {
    source.exec(apply ? "BEGIN IMMEDIATE" : "BEGIN");
    sourceTransaction = true;
    if (source.prepare("PRAGMA quick_check").get()?.quick_check !== "ok")
      throw Error("Source SQLite integrity validation failed.");
    const records = source
      .prepare(
        "SELECT collection,id,document FROM records ORDER BY collection,id",
      )
      .all()
      .map((row) => {
        const document = JSON.parse(String(row.document)) as Record<
          string,
          unknown
        >;
        if (
          !document ||
          typeof document !== "object" ||
          Array.isArray(document) ||
          document.id !== row.id
        )
          throw Error("Source record identity validation failed.");
        return {
          collection: String(row.collection),
          id: String(row.id),
          document,
        };
      });
    const revisions = source
      .prepare(
        "SELECT collection,revision FROM collection_revisions ORDER BY collection",
      )
      .all()
      .map((row) => ({
        collection: String(row.collection),
        revision: Number(row.revision),
      }));
    if (!records.length)
      throw Error(
        "Source database contains no records. Confirm the authoritative data directory before migrating.",
      );
    const workspaces = records.filter(
      (record) => record.collection === "atlas_teams",
    ).length;
    const snapshot = {
      records,
      revisions,
      digest: snapshotDigest(records, revisions),
    };
    if (apply) await target.ready();
    const client = await target.pool.connect();
    try {
      await client.query(
        apply
          ? "BEGIN ISOLATION LEVEL SERIALIZABLE"
          : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      if (apply) {
        await client.query("SELECT pg_advisory_xact_lock(1178686541)");
        await client.query(
          "LOCK TABLE atlas_records,atlas_collection_revisions IN SHARE ROW EXCLUSIVE MODE",
        );
      }
      const existing = await client.query(
        "SELECT to_regclass('atlas_records') AS records,to_regclass('atlas_collection_revisions') AS revisions",
      );
      const present = existing.rows[0];
      const current =
        present.records && present.revisions
          ? await postgresSnapshot(client)
          : { records: [], revisions: [], digest: "" };
      if (current.records.length || current.revisions.length) {
        if (current.digest !== snapshot.digest)
          throw Error(
            "Target already contains different Atlas records. Use an empty target; nothing was overwritten.",
          );
        await client.query("COMMIT");
        return {
          state: "already-migrated",
          records: records.length,
          workspaces,
          collections: revisions.length,
          digest: snapshot.digest,
        };
      }
      if (apply) {
        await insertSnapshot(client, snapshot);
        const copied = await postgresSnapshot(client);
        if (
          copied.digest !== snapshot.digest ||
          copied.records.length !== records.length
        )
          throw Error("Target row count or content checksum did not match.");
      }
      await client.query("COMMIT");
      return {
        state: apply ? "migrated-and-verified" : "dry-run",
        records: records.length,
        workspaces,
        collections: revisions.length,
        digest: snapshot.digest,
        sourcePreserved: true,
        next: apply
          ? "Set ATLAS_DATABASE_ENGINE=postgres only after this verified migration; keep the original SQLite file."
          : "Stop the app and Agent edits, then rerun with --apply before selecting PostgreSQL.",
      };
    } catch (failure) {
      await client.query("ROLLBACK").catch(() => {});
      throw failure;
    } finally {
      client.release();
    }
  } finally {
    if (sourceTransaction) source.exec("ROLLBACK");
    source.close();
  }
}
