import { and, eq } from "drizzle-orm";
import { db, teamsTable, teamMembersTable, type TeamRole } from "@workspace/db";
import { getClerkUserInfo } from "./clerkUsers";
import { isSuperAdmin } from "./superAdmin";

// The app moved from "one team = one user" to shared staff access via
// team_members. Every route guard now asks "is this user a member of this
// team?" instead of "does this user own this team?". The legacy
// teams.user_id column is kept as a fallback so nothing breaks if the
// backfill in ensureSchema hasn't run yet against an old database.

export async function getTeamRole(userId: string, teamId: number): Promise<TeamRole | null> {
  const [member] = await db
    .select({ role: teamMembersTable.role })
    .from(teamMembersTable)
    .where(
      and(
        eq(teamMembersTable.teamId, teamId),
        eq(teamMembersTable.userId, userId),
        eq(teamMembersTable.status, "active"),
      ),
    );
  if (member) return member.role as TeamRole;

  const [team] = await db
    .select({ id: teamsTable.id })
    .from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.userId, userId)));
  return team ? "owner" : null;
}

// Any active member (any role) can read and write team data.
export async function verifyTeamAccess(userId: string, teamId: number): Promise<boolean> {
  return (await getTeamRole(userId, teamId)) !== null;
}

// Pro-gated feature access: team membership AND (the team is on the
// Pro tier OR the caller is the site's super admin, who always sees
// every feature to support/demo the platform). This is the real
// enforcement — the frontend's ProRoute/ProPage is only a UX nicety
// that hides the button; without this, a free-tier user could still
// hit a Pro API directly.
export async function verifyProTeam(userId: string, teamId: number): Promise<boolean> {
  const hasAccess = await verifyTeamAccess(userId, teamId);
  if (!hasAccess) return false;
  const { email } = await getClerkUserInfo(userId);
  if (isSuperAdmin(email)) return true;
  const [team] = await db.select({ tier: teamsTable.tier }).from(teamsTable).where(eq(teamsTable.id, teamId));
  return team?.tier === "pro";
}

// Owner-only actions: deleting the team, managing members.
export async function verifyTeamOwner(userId: string, teamId: number): Promise<boolean> {
  return (await getTeamRole(userId, teamId)) === "owner";
}
