import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

type RecordData = { id: string; [key: string]: unknown };
type Change = { id: string; record: Record<string, unknown>; if?: Record<string, unknown> };
type WriteOptions = { patch?: boolean };

export class AppDatabaseError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AppDatabaseError';
  }
}

// Operations remain lazy so cross-table writes can commit in one SQLite transaction.
class Operation<T> implements PromiseLike<T> {
  private result?: Promise<T>;
  constructor(readonly store: AtlasDatabase, readonly execute: () => T) {}
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.result ??= Promise.resolve().then(() => this.store.write(this.execute));
    return this.result.then(onfulfilled, onrejected);
  }
}

export class AtlasDatabase {
  private readonly connection: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.connection = new DatabaseSync(filename);
    this.connection.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        document TEXT NOT NULL CHECK(json_valid(document)),
        PRIMARY KEY (collection, id)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS collection_revisions (
        collection TEXT PRIMARY KEY,
        revision INTEGER NOT NULL DEFAULT 0
      ) WITHOUT ROWID;
    `);
  }

  close() { this.connection.close(); }

  workspaceRevision(workspaceId: string): number {
    const suffix = '_' + workspaceId;
    const collections = ['managers', 'assignments', 'visits', 'trips', 'coaching', 'trainer_profiles', 'availability', 'travel_plans', 'travel_prefs', 'flight_changes', 'itinerary_updates'].map(name => 'atlas_' + name + suffix);
    const statement = this.connection.prepare('SELECT revision FROM collection_revisions WHERE collection = ?');
    return collections.reduce((sum, name) => sum + Number(statement.get(name)?.revision || 0), 0);
  }

  private changed(table: string) {
    this.connection.prepare('INSERT INTO collection_revisions(collection, revision) VALUES (?, 1) ON CONFLICT(collection) DO UPDATE SET revision = revision + 1').run(table);
  }

  async get<T = RecordData>(table: string, ids: string[], _options?: { consistent?: boolean }): Promise<(T | null)[]> {
    const statement = this.connection.prepare('SELECT document FROM records WHERE collection = ? AND id = ?');
    return ids.map(id => {
      const row = statement.get(table, id);
      return row ? JSON.parse(String(row.document)) as T : null;
    });
  }

  async list<T = RecordData>(table: string, options: { limit?: number; nextToken?: string } = {}) {
    const limit = Math.max(1, Math.min(1000, options.limit ?? 100));
    let after = '';
    if (options.nextToken) {
      try {
        const cursor = JSON.parse(Buffer.from(options.nextToken, 'base64url').toString());
        if (cursor.table !== table || typeof cursor.after !== 'string') throw new Error('Invalid cursor');
        after = cursor.after;
      } catch { throw new AppDatabaseError('AppDatabaseInvalidCursor', 'Invalid pagination cursor.'); }
    }
    const rows = this.connection.prepare(
      'SELECT id, document FROM records WHERE collection = ? AND id > ? ORDER BY id LIMIT ?',
    ).all(table, after, limit + 1);
    const page = rows.slice(0, limit);
    return {
      items: page.map(row => JSON.parse(String(row.document)) as T),
      nextToken: rows.length > limit
        ? Buffer.from(JSON.stringify({ table, after: page.at(-1)!.id })).toString('base64url')
        : undefined,
    };
  }

  write<T>(callback: () => T): T {
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.connection.exec('COMMIT');
      return result;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }

  private read(table: string, id: string): RecordData | null {
    const row = this.connection.prepare('SELECT document FROM records WHERE collection = ? AND id = ?').get(table, id);
    return row ? JSON.parse(String(row.document)) : null;
  }

  readonly tx = {
    add: <T extends object>(table: string, records: T[]): Operation<boolean[]> => new Operation(this, () => {
      const insert = this.connection.prepare('INSERT OR IGNORE INTO records (collection, id, document) VALUES (?, ?, ?)');
      return records.map(record => {
        const id = (record as { id?: unknown }).id;
        if (typeof id !== 'string' || !id) throw new AppDatabaseError('AppDatabaseInvalidRecord', 'Record ID is required.');
        const changed = insert.run(table, id, JSON.stringify(record)).changes === 1;
        if (changed) this.changed(table);
        return changed;
      });
    }),
    update: (table: string, changes: Change[], options: WriteOptions = {}): Operation<boolean[]> => new Operation(this, () => {
      const save = this.connection.prepare('INSERT OR REPLACE INTO records (collection, id, document) VALUES (?, ?, ?)');
      return changes.map(change => {
        const before = this.read(table, change.id);
        if (change.if && (!before || Object.entries(change.if).some(([key, value]) => before[key] !== value))) return false;
        if (options.patch && !before) return false;
        save.run(table, change.id, JSON.stringify({ ...(options.patch ? before : {}), ...change.record, id: change.id }));
        this.changed(table);
        return true;
      });
    }),
    delete: (table: string, ids: string[]): Operation<boolean[]> => new Operation(this, () => {
      const remove = this.connection.prepare('DELETE FROM records WHERE collection = ? AND id = ?');
      return ids.map(id => { const changed = remove.run(table, id).changes === 1; if (changed) this.changed(table); return changed; });
    }),
  };

  delete(table: string, ids: string[]) { return this.tx.delete(table, ids); }

  async transact(operations: Operation<boolean[]>[], guard?: () => void): Promise<boolean[][]> {
    if (operations.some(operation => operation.store !== this)) throw new Error('Cross-database transaction is unsupported.');
    return this.write(() => {
      guard?.();
      return operations.map(operation => {
      const result = operation.execute();
      if (result.some(success => !success)) {
        throw new AppDatabaseError('AppDatabaseConflict', 'Transaction conflicted with an existing or changed record.');
      }
      return result;
      });
    });
  }
}
