// Include the underlying database error message in 500 responses so the
// frontend toast can show the real cause (e.g. `relation "teams" does not
// exist`) instead of an opaque "Internal server error" that gives the user
// nothing to act on.
export function dbErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `Database error: ${msg}`;
}
