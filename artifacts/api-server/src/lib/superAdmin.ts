// Site-owner identification for the access-approval gate and the /admin
// panel. Deliberately simple: a fixed, comma-separated email allowlist
// via env var — no roles table, no UI to manage it. This keeps the
// blast radius of a mistake small (it's read-only unless explicitly
// redeployed) and matches a single-owner-reviewing-signups reality.
export function isSuperAdmin(email: string | null): boolean {
  if (!email) return false;
  const list = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
