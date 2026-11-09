import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  jsonb,
  pgTable,
  text,
  primaryKey,
} from "drizzle-orm/pg-core";

// Keep these models aligned with runtime/postgres.ts. Declaring them here keeps
// Replit's schema tooling aware of the runtime tables during a reviewed publish.
export const atlasRecords = pgTable(
  "atlas_records",
  {
    collection: text("collection").notNull(),
    id: text("id").notNull(),
    document: jsonb("document").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.collection, table.id] }),
    check(
      "atlas_records_document_check",
      sql`jsonb_typeof(${table.document}) = 'object'`,
    ),
  ],
);

export const atlasCollectionRevisions = pgTable(
  "atlas_collection_revisions",
  {
    collection: text("collection").primaryKey(),
    revision: bigint("revision", { mode: "number" }).notNull().default(0),
  },
  (table) => [
    check(
      "atlas_collection_revisions_revision_check",
      sql`${table.revision} >= 0`,
    ),
  ],
);
