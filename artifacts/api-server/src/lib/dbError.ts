// Include the underlying database error message in 500 responses so the
// frontend toast can show the real cause (e.g. `relation "teams" does not
// exist`) instead of an opaque "Internal server error" that gives the user
// nothing to act on.
export function dbErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Drizzle/postgres-js wrap the actual Postgres error as `.cause` on the
  // thrown error — `err.message` alone is often just "Failed query: <sql>",
  // the real reason (constraint violation, type mismatch, missing column,
  // ...) lives one level deeper and was previously silently dropped here.
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : null;
  return `Database error: ${msg}${cause ? ` — ${cause}` : ""}`;
}
