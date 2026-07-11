import { and, eq } from "drizzle-orm";
import { db, teamsTable, teamMembersTable, type TeamRole } from "@workspace/db";

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

// Owner-only actions: deleting the team, managing members.
export async function verifyTeamOwner(userId: string, teamId: number): Promise<boolean> {
  return (await getTeamRole(userId, teamId)) === "owner";
}
