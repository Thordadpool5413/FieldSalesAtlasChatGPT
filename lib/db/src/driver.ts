import pg from "pg";
import type { PoolConfig } from "pg";

// Importing the driver does not initialize Drizzle or open a connection.
export const createPostgresPool = (config: PoolConfig) => new pg.Pool(config);
export type { Pool, PoolClient, QueryResultRow } from "pg";
