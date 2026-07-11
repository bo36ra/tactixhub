import { clerkClient } from "@clerk/express";
import { logger } from "./logger";

export interface ClerkUserInfo {
  email: string | null;
  displayName: string | null;
}

// Clerk's session token doesn't carry the user's email or name by default,
// but invites are matched by email and notes are stamped with the author's
// name — so we look those up via the Clerk backend API. Cached in-process
// for 10 minutes so the lookup doesn't hit Clerk on every request.
const cache = new Map<string, { info: ClerkUserInfo; expires: number }>();
const TTL_MS = 10 * 60 * 1000;

export async function getClerkUserInfo(userId: string): Promise<ClerkUserInfo> {
  const cached = cache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.info;

  let info: ClerkUserInfo = { email: null, displayName: null };
  try {
    const user = await clerkClient.users.getUser(userId);
    const primaryEmail =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null;
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      user.username ||
      primaryEmail ||
      null;
    info = { email: primaryEmail ? primaryEmail.toLowerCase() : null, displayName: name };
  } catch (err) {
    logger.warn({ err, userId }, "Failed to fetch Clerk user info");
  }

  cache.set(userId, { info, expires: Date.now() + TTL_MS });
  return info;
}
