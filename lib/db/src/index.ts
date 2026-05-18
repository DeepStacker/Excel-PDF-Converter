import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                        // max concurrent connections
  min: 2,                         // keep 2 warm connections ready
  idleTimeoutMillis: 30_000,      // release idle connections after 30 s
  connectionTimeoutMillis: 5_000, // fail fast if pool exhausted
});

export const db = drizzle(pool, { schema });

export * from "./schema";
