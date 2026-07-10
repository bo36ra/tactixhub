import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Neon's free tier suspends the database compute after a period of
// inactivity. The first connection after that takes several seconds to
// wake it back up — the default pg timeout is too short and fails that
// first request with ETIMEDOUT. Give it enough room to wake up instead.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 20_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
