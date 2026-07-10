import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Some hosts (e.g. Render's free tier) restrict outbound connections on
// raw Postgres port 5432, which causes ETIMEDOUT/ENETUNREACH errors no
// matter how long you wait for the database to "wake up." Neon's HTTP
// driver connects over regular HTTPS (443) through Neon's own proxy
// instead, sidestepping that restriction entirely — this is Neon's own
// recommended approach for serverless/edge-style hosts.
const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });

export * from "./schema";
