import { createPostgresPool, type PoolClient } from "@workspace/db/driver";
import { AppDatabaseError } from "./database";
import {
  revisionCollections,
  type Change,
  type DatabaseOperation,
  type RecordData,
  type RecordStore,
  type TransactionGuard,
  type WriteOptions,
} from "./store";

class PgOperation implements DatabaseOperation {
  private result?: Promise<boolean[]>;
  constructor(
    readonly store: PostgresDatabase,
    readonly execute: (client: PoolClient) => Promise<boolean[]>,
  ) {}
  then<TResult1 = boolean[], TResult2 = never>(
    fulfilled?: ((value: boolean[]) => TResult1 | PromiseLike<TResult1>) | null,
    rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    this.result ??= this.store.single(this.execute);
    return this.result.then(fulfilled, rejected);
  }
}
function safeFailure(failure: unknown): Error {
  if (failure instanceof AppDatabaseError) return failure;
  const code = (failure as { code?: string })?.code;
  if (["40001", "40P01", "23505"].includes(code || ""))
    return new AppDatabaseError(
      "AppDatabaseConflict",
      "The record changed. Refresh before retrying.",
    );
  return new Error(
    "The configured PostgreSQL record store could not complete the operation.",
  );
}
function validConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname)
      throw Error();
  } catch {
    throw new Error(
      "DATABASE_URL must be a valid PostgreSQL connection string. Its value has not been logged.",
    );
  }
}

export class PostgresDatabase implements RecordStore {
  readonly kind = "postgres" as const;
  readonly pool: ReturnType<typeof createPostgresPool>;
  private initialization?: Promise<void>;
  constructor(connectionString: string) {
    validConnectionString(connectionString);
    this.pool = createPostgresPool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      statement_timeout: 30000,
      application_name: "FieldSalesAtlas",
    });
    this.pool.on("error", () =>
      console.error(
        "PostgreSQL idle connection failed; no credentials or record values were logged.",
      ),
    );
  }
  async ready() {
    this.initialization ??= (async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(1178686540)");
        await client.query(`
          CREATE TABLE IF NOT EXISTS atlas_records (
            collection text COLLATE "C" NOT NULL, id text COLLATE "C" NOT NULL, document jsonb NOT NULL,
            CONSTRAINT atlas_records_collection_id_pk PRIMARY KEY(collection,id), CHECK(jsonb_typeof(document)='object')
          );
          CREATE TABLE IF NOT EXISTS atlas_collection_revisions (
            collection text COLLATE "C" PRIMARY KEY, revision bigint NOT NULL DEFAULT 0 CHECK(revision >= 0)
          );
        `);
        await client.query("COMMIT");
      } catch (failure) {
        await client.query("ROLLBACK").catch(() => {});
        throw failure;
      } finally {
        client.release();
      }
    })().catch((failure) => {
      this.initialization = undefined;
      throw safeFailure(failure);
    });
    await this.initialization;
  }
  async close() {
    await this.pool.end();
  }
  private async changed(client: PoolClient, table: string) {
    await client.query(
      "INSERT INTO atlas_collection_revisions(collection,revision) VALUES($1,1) ON CONFLICT(collection) DO UPDATE SET revision=atlas_collection_revisions.revision+1",
      [table],
    );
  }
  private async revision(
    client: Pick<PoolClient, "query">,
    workspaceId: string,
  ) {
    const result = await client.query(
      "SELECT COALESCE(sum(revision),0)::text AS revision FROM atlas_collection_revisions WHERE collection = ANY($1::text[])",
      [revisionCollections(workspaceId)],
    );
    const revision = Number(result.rows[0].revision);
    if (!Number.isSafeInteger(revision))
      throw new Error("Workspace revision exceeds supported range.");
    return revision;
  }
  async workspaceRevision(workspaceId: string) {
    await this.ready();
    try {
      return await this.revision(this.pool, workspaceId);
    } catch (failure) {
      throw safeFailure(failure);
    }
  }
  async get<T = RecordData>(
    table: string,
    ids: string[],
    _options?: { consistent?: boolean },
  ): Promise<(T | null)[]> {
    await this.ready();
    if (!ids.length) return [];
    try {
      const result = await this.pool.query(
        "SELECT id,document FROM atlas_records WHERE collection=$1 AND id=ANY($2::text[])",
        [table, ids],
      );
      const rows = new Map(
        result.rows.map((row) => [row.id, row.document as T]),
      );
      return ids.map((id) => rows.get(id) ?? null);
    } catch (failure) {
      throw safeFailure(failure);
    }
  }
  async list<T = RecordData>(
    table: string,
    options: { limit?: number; nextToken?: string } = {},
  ) {
    await this.ready();
    const limit = Math.max(1, Math.min(1000, options.limit ?? 100));
    let after = "";
    if (options.nextToken) {
      try {
        const cursor = JSON.parse(
          Buffer.from(options.nextToken, "base64url").toString(),
        );
        if (cursor.table !== table || typeof cursor.after !== "string")
          throw Error();
        after = cursor.after;
      } catch {
        throw new AppDatabaseError(
          "AppDatabaseInvalidCursor",
          "Invalid pagination cursor.",
        );
      }
    }
    try {
      const result = await this.pool.query(
        'SELECT id,document FROM atlas_records WHERE collection=$1 AND id COLLATE "C">$2 ORDER BY id COLLATE "C" LIMIT $3',
        [table, after, limit + 1],
      );
      const rows = result.rows.slice(0, limit);
      return {
        items: rows.map((row) => row.document as T),
        nextToken:
          result.rows.length > limit
            ? Buffer.from(
                JSON.stringify({ table, after: rows.at(-1)!.id }),
              ).toString("base64url")
            : undefined,
      };
    } catch (failure) {
      throw safeFailure(failure);
    }
  }
  async single(
    work: (client: PoolClient) => Promise<boolean[]>,
  ): Promise<boolean[]> {
    await this.ready();
    const client = await this.pool.connect().catch((failure) => {
      throw safeFailure(failure);
    });
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (failure) {
      await client.query("ROLLBACK").catch(() => {});
      throw safeFailure(failure);
    } finally {
      client.release();
    }
  }
  readonly tx = {
    add: <T extends object>(table: string, records: T[]) =>
      new PgOperation(this, async (client) => {
        const results = [];
        for (const record of records) {
          const id = (record as { id?: unknown }).id;
          if (typeof id !== "string" || !id)
            throw new AppDatabaseError(
              "AppDatabaseInvalidRecord",
              "Record ID is required.",
            );
          const result = await client.query(
            "INSERT INTO atlas_records(collection,id,document) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING id",
            [table, id, JSON.stringify(record)],
          );
          const changed = result.rowCount === 1;
          if (changed) await this.changed(client, table);
          results.push(changed);
        }
        return results;
      }),
    update: (table: string, changes: Change[], options: WriteOptions = {}) =>
      new PgOperation(this, async (client) => {
        const results = [];
        for (const change of changes) {
          const result = await client.query(
            "SELECT document FROM atlas_records WHERE collection=$1 AND id=$2 FOR UPDATE",
            [table, change.id],
          );
          const before = result.rows[0]?.document as RecordData | undefined;
          if (
            (change.if &&
              (!before ||
                Object.entries(change.if).some(
                  ([key, value]) => before[key] !== value,
                ))) ||
            (options.patch && !before)
          ) {
            results.push(false);
            continue;
          }
          const document = {
            ...(options.patch ? before : {}),
            ...change.record,
            id: change.id,
          };
          await client.query(
            "INSERT INTO atlas_records(collection,id,document) VALUES($1,$2,$3::jsonb) ON CONFLICT(collection,id) DO UPDATE SET document=excluded.document",
            [table, change.id, JSON.stringify(document)],
          );
          await this.changed(client, table);
          results.push(true);
        }
        return results;
      }),
    delete: (table: string, ids: string[]) =>
      new PgOperation(this, async (client) => {
        const results = [];
        for (const id of ids) {
          const result = await client.query(
            "DELETE FROM atlas_records WHERE collection=$1 AND id=$2 RETURNING id",
            [table, id],
          );
          const changed = result.rowCount === 1;
          if (changed) await this.changed(client, table);
          results.push(changed);
        }
        return results;
      }),
  };
  delete(table: string, ids: string[]) {
    return this.tx.delete(table, ids);
  }
  async transact(operations: DatabaseOperation[], guard?: TransactionGuard) {
    if (
      operations.some((op) => !(op instanceof PgOperation) || op.store !== this)
    )
      throw new Error("Cross-database transaction is unsupported.");
    await this.ready();
    const client = await this.pool.connect().catch((failure) => {
      throw safeFailure(failure);
    });
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      if (typeof guard === "function") guard();
      else if (
        guard &&
        (await this.revision(client, guard.workspaceId)) !== guard.revision
      )
        throw new AppDatabaseError("AppDatabaseConflict", guard.message);
      const results = [];
      for (const op of operations as PgOperation[]) {
        const result = await op.execute(client);
        if (result.some((value) => !value))
          throw new AppDatabaseError(
            "AppDatabaseConflict",
            "Transaction conflicted with an existing or changed record.",
          );
        results.push(result);
      }
      await client.query("COMMIT");
      return results;
    } catch (failure) {
      await client.query("ROLLBACK").catch(() => {});
      throw safeFailure(failure);
    } finally {
      client.release();
    }
  }
}
