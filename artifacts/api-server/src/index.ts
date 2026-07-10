import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

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

// Neon's free tier suspends its compute when idle, so the very first real
// request after a deploy/restart can hit a cold database and time out.
// Ping it a few times right at boot so it's already awake before traffic
// arrives, instead of making a user's first request eat that delay.
async function warmDatabase() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await pool.query("select 1");
      logger.info({ attempt }, "Database warmed up");
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
