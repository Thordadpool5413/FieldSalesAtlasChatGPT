import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgresDatabase } from "../../api-server/src/field-atlas/backend/runtime/postgres";
import { AtlasDatabase } from "../../api-server/src/field-atlas/backend/runtime/database";
import {
  assertMigratedWorkspaces,
  migrateSqlite,
} from "../../api-server/src/field-atlas/backend/runtime/migrate";
import { workspaceGuard } from "../../api-server/src/field-atlas/backend/runtime/store";

const connection = process.env.ATLAS_TEST_POSTGRES_URL;
async function isolated(run: (database: PostgresDatabase) => Promise<void>) {
  const admin = new PostgresDatabase(connection!);
  const schema = "atlas_test_" + randomUUID().replaceAll("-", "");
  await admin.pool.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(connection!);
  url.searchParams.set("options", "-c search_path=" + schema);
  const database = new PostgresDatabase(url.toString());
  try {
    await run(database);
  } finally {
    await database.close();
    await admin.pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.close();
  }
}

test(
  "PostgreSQL rolls back all writes, scopes cursors and preserves concurrent compare-and-swap",
  { skip: !connection },
  async () =>
    isolated(async (db) => {
      await db.tx.add("records", [
        { id: "a", version: 1 },
        { id: "é" },
        { id: "Z" },
      ]);
      await assert.rejects(
        db.transact([
          db.tx.add("other", [{ id: "new" }]),
          db.tx.add("records", [{ id: "a" }]),
        ]),
      );
      assert.deepEqual(await db.get("other", ["new"]), [null]);
      const first = await db.list<{ id: string }>("records", { limit: 2 });
      assert.deepEqual(
        first.items.map((r) => r.id),
        ["Z", "a"],
      );
      assert.deepEqual(
        (
          await db.list<{ id: string }>("records", {
            nextToken: first.nextToken,
          })
        ).items.map((r) => r.id),
        ["é"],
      );
      await assert.rejects(db.list("other", { nextToken: first.nextToken }));
      const results = await Promise.all(
        Array.from({ length: 12 }, () =>
          db.tx.update(
            "records",
            [{ id: "a", record: { version: 2 }, if: { version: 1 } }],
            { patch: true },
          ),
        ),
      );
      assert.equal(results.flat().filter(Boolean).length, 1);
      assert.deepEqual(
        await db.tx.update("records", [
          { id: "missing", record: {}, if: { version: undefined } },
        ]),
        [false],
      );
    }),
);

test(
  "PostgreSQL serializable workspace guard permits only one concurrent calendar adoption",
  { skip: !connection },
  async () =>
    isolated(async (db) => {
      const table = "atlas_visits_ws";
      const revision = await db.workspaceRevision("ws");
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          db.transact(
            [db.tx.add(table, [{ id: "visit-" + i }])],
            workspaceGuard("ws", revision, "stale"),
          ),
        ),
      );
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal((await db.list(table)).items.length, 1);
      assert.equal(await db.workspaceRevision("ws"), revision + 1);
    }),
);

test(
  "SQLite migration is read-only in preview, verifies contents and refuses a different target",
  { skip: !connection },
  async () =>
    isolated(async (target) => {
      const directory = mkdtempSync(join(tmpdir(), "atlas-migration-"));
      const file = join(directory, "atlas.sqlite");
      try {
        const source = new AtlasDatabase(file);
        await source.tx.add("workspace", [
          { id: "Z", nested: { beta: 2, alpha: 1 }, value: "Montréal 🌴" },
          { id: "é" },
        ]);
        await source.tx.add("atlas_visits_ws", [
          { id: "visit", startsAt: "2026-11-08T17:00:00Z" },
        ]);
        await source.tx.add("atlas_teams", [{ id: "saved-workspace" }]);
        source.close();
        const before = readFileSync(file);
        const preview = await migrateSqlite(file, target);
        assert.equal(preview.state, "dry-run");
        assert.equal(
          (
            await target.pool.query(
              "SELECT to_regclass('atlas_records') AS name",
            )
          ).rows[0].name,
          null,
        );
        await target.ready();
        await assert.rejects(
          assertMigratedWorkspaces(file, target),
          /missing existing SQLite workspaces/,
        );
        const applied = await migrateSqlite(file, target, true);
        assert.equal(applied.state, "migrated-and-verified");
        assert.equal(applied.digest, preview.digest);
        assert.equal(applied.records, 4);
        assert.equal(applied.workspaces, 1);
        await assertMigratedWorkspaces(file, target);
        assert.deepEqual(readFileSync(file), before);
        assert.equal(
          (await target.get<{ value: string }>("workspace", ["Z"]))[0]?.value,
          "Montréal 🌴",
        );
        assert.equal(await target.workspaceRevision("ws"), 1);
        assert.equal(
          (await migrateSqlite(file, target, true)).state,
          "already-migrated",
        );
        await target.tx.add("different", [{ id: "keep" }]);
        await assert.rejects(
          migrateSqlite(file, target, true),
          /nothing was overwritten/,
        );
        assert.deepEqual(await target.get("different", ["keep"]), [
          { id: "keep" },
        ]);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }),
);

test(
  "private backups require an intact object round trip and restore into temporary tables without editing live records",
  { skip: !connection },
  async () =>
    isolated(async (database) => {
      const {
        backupPostgres,
        verifyRecordSnapshot,
        backupDestinationFingerprint,
        recentBackup,
      } =
        await import("../../api-server/src/field-atlas/backend/runtime/backup");
      await database.tx.add("private", [
        { id: "saved", nested: { trainers: ["A", "B"] } },
      ]);
      let saved: Buffer | undefined;
      const storage = {
        async uploadFromBytes(_object: string, bytes: Buffer) {
          saved = bytes;
          return { ok: true as const, value: null };
        },
        async downloadAsBytes() {
          return { ok: true as const, value: [saved!] as [Buffer] };
        },
      };
      const receipt = await backupPostgres(
        database,
        storage,
        "development",
        backupDestinationFingerprint("test-bucket"),
      );
      const backupEnv = {
        ATLAS_BACKUP_BUCKET_ID: "test-bucket",
        ATLAS_BACKUP_SCOPE: "development",
      };
      assert.equal(recentBackup(receipt, backupEnv), true);
      assert.equal(
        recentBackup(receipt, {
          ...backupEnv,
          ATLAS_BACKUP_BUCKET_ID: "different",
        }),
        false,
      );
      assert.equal(
        recentBackup(
          receipt,
          backupEnv,
          Date.parse(receipt.createdAt) + 37 * 3600000,
        ),
        false,
      );
      assert.equal(
        receipt.state,
        "private-round-trip-and-record-restore-verified",
      );
      assert.deepEqual(await database.get("private", ["saved"]), [
        { id: "saved", nested: { trainers: ["A", "B"] } },
      ]);
      assert.equal(
        (
          await database.pool.query(
            "SELECT to_regclass('pg_temp.atlas_restore_records') AS name",
          )
        ).rows[0].name,
        null,
      );
      storage.downloadAsBytes = async () => ({
        ok: true as const,
        value: [Buffer.from("tampered")],
      });
      await assert.rejects(
        backupPostgres(database, storage, "production"),
        /read-back checksum/,
      );
      await assert.rejects(
        verifyRecordSnapshot(database, {
          records: [],
          revisions: [],
          digest: "wrong",
        }),
        /checksum/,
      );
    }),
);

test(
  "BTS reference archive restores a lost cache and rejects a corrupted private object",
  { skip: !connection },
  async () =>
    isolated(async (database) => {
      const { DatabaseSync } = await import("node:sqlite");
      const { writeFileSync, unlinkSync, existsSync } = await import("node:fs");
      const { archiveBtsCache, restoreBtsCache } =
        await import("../../api-server/src/field-atlas/backend/runtime/btsArchive");
      const directory = mkdtempSync(join(tmpdir(), "atlas-bts-archive-")),
        path = join(directory, "bts.sqlite");
      let bytes: Buffer;
      const storage = {
        async uploadFromFilename(_object: string, file: string) {
          bytes = readFileSync(file);
          return { ok: true as const, value: null };
        },
        async downloadToFilename(_object: string, file: string) {
          writeFileSync(file, bytes);
          return { ok: true as const, value: null };
        },
      };
      const options = { database, path, storage, scope: "development" };
      try {
        const sqlite = new DatabaseSync(path);
        sqlite.exec(
          "CREATE TABLE datasets(period TEXT); INSERT INTO datasets VALUES('2026-08'); CREATE TABLE flights(period TEXT,origin TEXT,destination TEXT); INSERT INTO flights VALUES('2026-08','MCO','ATL');",
        );
        sqlite.close();
        assert.equal(
          (await archiveBtsCache(options)).state,
          "archived-and-read-back-verified",
        );
        unlinkSync(path);
        await restoreBtsCache(options);
        const restored = new DatabaseSync(path, { readOnly: true });
        assert.equal(
          restored.prepare("SELECT destination FROM flights").get()
            ?.destination,
          "ATL",
        );
        restored.close();
        unlinkSync(path);
        bytes = Buffer.from("corrupted");
        await assert.rejects(restoreBtsCache(options), /checksum/);
        assert.equal(existsSync(path), false);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }),
);
