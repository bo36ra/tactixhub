import { dbErrorMessage } from "../lib/dbError";
import { Router } from "express";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { db, teamsTable, teamMembersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getTeamRole, verifyTeamOwner } from "../lib/teamAccess";
import { getClerkUserInfo } from "../lib/clerkUsers";
import { isSuperAdmin } from "../lib/superAdmin";
import { accessRequestsTable } from "@workspace/db";
import { notifyUser, notifyTeamMembers } from "../lib/notify";

const router = Router();

// Pending invites are stored by email with user_id null. The first time a
// signed-in user lists their teams, any invite matching their Clerk email
// is attached to their account and activated — no separate "accept" step.
async function claimPendingInvites(userId: string): Promise<void> {
  const { email, displayName } = await getClerkUserInfo(userId);
  if (!email) return;

  const claimed = await db
    .update(teamMembersTable)
    .set({
      userId,
      status: "active",
      displayName: sql`COALESCE(${teamMembersTable.displayName}, ${displayName ?? email})`,
    })
    .where(
      and(
        sql`LOWER(${teamMembersTable.email}) = ${email}`,
        isNull(teamMembersTable.userId),
      ),
    )
    .returning({ teamId: teamMembersTable.teamId, role: teamMembersTable.role });

  for (const invite of claimed) {
    const [team] = await db
      .select({ name: teamsTable.name })
      .from(teamsTable)
      .where(eq(teamsTable.id, invite.teamId));
    const teamName = team?.name ?? "";
    // Tell the new member they're in, and tell the rest of the staff.
    await notifyUser(userId, invite.teamId, {
      type: "added_to_team",
      meta: { teamName, role: invite.role },
      link: "/dashboard",
    });
    await notifyTeamMembers(invite.teamId, userId, {
      type: "member_joined",
      meta: { actorName: displayName ?? email, teamName },
      link: "/staff",
    });
  }
}

// List teams the authenticated user is a member of (any role)
router.get("/teams", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  try {
    await claimPendingInvites(userId);

    const memberships = await db
      .select({ teamId: teamMembersTable.teamId })
      .from(teamMembersTable)
      .where(and(eq(teamMembersTable.userId, userId), eq(teamMembersTable.status, "active")));

    const legacyOwned = await db
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(eq(teamsTable.userId, userId));

    const teamIds = [...new Set([...memberships.map((m) => m.teamId), ...legacyOwned.map((t) => t.id)])];
    if (teamIds.length === 0) {
      const { email, displayName } = await getClerkUserInfo(userId);
      if (!isSuperAdmin(email)) {
        const [existing] = await db
          .select({ id: accessRequestsTable.id })
          .from(accessRequestsTable)
          .where(eq(accessRequestsTable.userId, userId));
        if (!existing) {
          await db.insert(accessRequestsTable).values({ userId, email, displayName });
        }
      }
      res.json([]);
      return;
    }

    const teams = await db
      .select()
      .from(teamsTable)
      .where(inArray(teamsTable.id, teamIds))
      .orderBy(teamsTable.createdAt);
    res.json(teams.map(mapTeam));
  } catch (err) {
    req.log.error({ err }, "Failed to list teams");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Create team — creator becomes the owner member
router.post("/teams", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const { name, ageGroup, season } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const { email, displayName } = await getClerkUserInfo(userId);
  if (!isSuperAdmin(email)) {
    const [existing] = await db
      .select({ status: accessRequestsTable.status })
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.userId, userId));
    if (existing?.status !== "approved") {
      if (!existing) {
        await db.insert(accessRequestsTable).values({ userId, email, displayName });
      }
      res.status(403).json({ error: "access_pending", status: existing?.status ?? "pending" });
      return;
    }
  }
  try {
    const [team] = await db
      .insert(teamsTable)
      .values({ name, ageGroup: ageGroup || null, season: season || null, userId })
      .returning();

    await db.insert(teamMembersTable).values({
      teamId: team.id,
      userId,
      email,
      displayName,
      role: "owner",
      status: "active",
    });

    res.status(201).json(mapTeam(team));
  } catch (err) {
    req.log.error({ err }, "Failed to create team");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Get team — any active member
router.get("/teams/:teamId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  try {
    const role = await getTeamRole(userId, teamId);
    if (!role) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    res.json(mapTeam(team));
  } catch (err) {
    req.log.error({ err }, "Failed to get team");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Update team — owner or coach
router.patch("/teams/:teamId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const { name, ageGroup, season } = req.body;
  try {
    const role = await getTeamRole(userId, teamId);
    if (!role) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    if (role !== "owner" && role !== "coach") {
      res.status(403).json({ error: "Only the owner or a coach can update the team" });
      return;
    }
    const [team] = await db
      .update(teamsTable)
      .set({
        ...(name !== undefined && { name }),
        ...(ageGroup !== undefined && { ageGroup }),
        ...(season !== undefined && { season }),
      })
      .where(eq(teamsTable.id, teamId))
      .returning();
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    res.json(mapTeam(team));
  } catch (err) {
    req.log.error({ err }, "Failed to update team");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Delete team — owner only
router.delete("/teams/:teamId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  try {
    if (!(await verifyTeamOwner(userId, teamId))) {
      res.status(403).json({ error: "Only the team owner can delete the team" });
      return;
    }
    await db.delete(teamsTable).where(eq(teamsTable.id, teamId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete team");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

function mapTeam(t: typeof teamsTable.$inferSelect) {
  return {
    id: t.id,
    name: t.name,
    ageGroup: t.ageGroup,
    season: t.season,
    userId: t.userId,
    tier: t.tier,
    createdAt: t.createdAt.toISOString(),
  };
}

export default router;
