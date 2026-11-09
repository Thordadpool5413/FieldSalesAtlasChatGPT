export type RecordData = { id: string; [key: string]: unknown };
export type Change = {
  id: string;
  record: Record<string, unknown>;
  if?: Record<string, unknown>;
};
export type WriteOptions = { patch?: boolean };
export type RevisionGuard = {
  kind: "workspace-revision";
  workspaceId: string;
  revision: number;
  message: string;
};
export const workspaceGuard = (
  workspaceId: string,
  revision: number | undefined,
  message = "Workspace changed. Refresh before retrying.",
): RevisionGuard => ({
  kind: "workspace-revision",
  workspaceId,
  revision: revision ?? -1,
  message,
});
export type TransactionGuard = RevisionGuard | (() => void);
export interface DatabaseOperation extends PromiseLike<boolean[]> {
  readonly store: object;
}
export const revisionCollections = (workspaceId: string) =>
  [
    "managers",
    "assignments",
    "visits",
    "trips",
    "coaching",
    "trainer_profiles",
    "availability",
    "travel_plans",
    "travel_prefs",
    "flight_changes",
    "itinerary_updates",
  ].map((name) => "atlas_" + name + "_" + workspaceId);
export interface RecordStore {
  readonly kind: "sqlite" | "postgres";
  ready(): Promise<void>;
  close(): void | Promise<void>;
  workspaceRevision(workspaceId: string): number | Promise<number>;
  get<T = RecordData>(
    table: string,
    ids: string[],
    options?: { consistent?: boolean },
  ): Promise<(T | null)[]>;
  list<T = RecordData>(
    table: string,
    options?: { limit?: number; nextToken?: string },
  ): Promise<{ items: T[]; nextToken?: string }>;
  readonly tx: {
    add<T extends object>(table: string, records: T[]): DatabaseOperation;
    update(
      table: string,
      changes: Change[],
      options?: WriteOptions,
    ): DatabaseOperation;
    delete(table: string, ids: string[]): DatabaseOperation;
  };
  delete(table: string, ids: string[]): DatabaseOperation;
  transact(
    operations: DatabaseOperation[],
    guard?: TransactionGuard,
  ): Promise<boolean[][]>;
}
