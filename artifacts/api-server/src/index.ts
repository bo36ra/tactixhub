import app from "./app";
import { logger } from "./lib/logger";
import { ensureSchema } from "./lib/ensureSchema";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Confirms the database is reachable right at boot (and surfaces a clear
// error immediately if not), rather than letting a user's first request
// be the one that discovers a connectivity problem.
async function warmDatabase() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await db.execute(sql`select 1`);
      logger.info({ attempt }, "Database warmed up");
      // Create any missing tables (safe no-op when they already exist).
      // Without this, a freshly provisioned database 500s on every request.
      await ensureSchema();
      return;
    } catch (err) {
      logger.warn({ err, attempt }, "Database warm-up attempt failed, retrying");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  logger.error("Database warm-up failed after 5 attempts — first request may be slow");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  warmDatabase();
});
