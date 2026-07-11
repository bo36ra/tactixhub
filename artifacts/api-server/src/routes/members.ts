import { dbErrorMessage } from "../lib/dbError";
import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, teamMembersTable, teamsTable, TEAM_ROLES } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getTeamRole, verifyTeamAccess } from "../lib/teamAccess";
import { notifyUser } from "../lib/notify";

const router = Router();

const INVITABLE_ROLES = TEAM_ROLES.filter((r) => r !== "owner");

// List staff members — any active member can see the roster
router.get("/teams/:teamId/members", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamAccess(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const members = await db
      .select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.teamId, teamId))
      .orderBy(teamMembersTable.createdAt);
    res.json(members.map(mapMember));
  } catch (err) {
    req.log.error({ err }, "Failed to list team members");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Invite a staff member by email — owner only. The invite sits as
// `pending` until that email signs in; then it's claimed automatically.
router.post("/teams/:teamId/members", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const { email, role, displayName } = req.body ?? {};

  if ((await getTeamRole(userId, teamId)) !== "owner") {
    res.status(403).json({ error: "Only the team owner can invite members" });
    return;
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }
  if (!role || !INVITABLE_ROLES.includes(role)) {
    res.status(400).json({ error: `role must be one of: ${INVITABLE_ROLES.join(", ")}` });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  try {
    const existing = await db
      .select({ id: teamMembersTable.id })
      .from(teamMembersTable)
      .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.email, normalizedEmail)));
    if (existing.length > 0) {
      res.status(409).json({ error: "This email is already invited or a member" });
      return;
    }

    const [member] = await db
      .insert(teamMembersTable)
      .values({
        teamId,
        email: normalizedEmail,
        displayName: displayName?.trim() || null,
        role,
        status: "pending",
      })
      .returning();
    res.status(201).json(mapMember(member));
  } catch (err) {
    req.log.error({ err }, "Failed to invite team member");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Change a member's role — owner only; the owner row itself is immutable
router.patch("/teams/:teamId/members/:memberId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const memberId = parseInt(req.params.memberId as string);
  const { role } = req.body ?? {};

  if ((await getTeamRole(userId, teamId)) !== "owner") {
    res.status(403).json({ error: "Only the team owner can change roles" });
    return;
  }
  if (!role || !INVITABLE_ROLES.includes(role)) {
    res.status(400).json({ error: `role must be one of: ${INVITABLE_ROLES.join(", ")}` });
    return;
  }
  try {
    const [target] = await db
      .select()
      .from(teamMembersTable)
      .where(and(eq(teamMembersTable.id, memberId), eq(teamMembersTable.teamId, teamId)));
    if (!target) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (target.role === "owner") {
      res.status(400).json({ error: "The owner's role cannot be changed" });
      return;
    }

    const [updated] = await db
      .update(teamMembersTable)
      .set({ role })
      .where(eq(teamMembersTable.id, memberId))
      .returning();

    if (updated.userId) {
      const [team] = await db
        .select({ name: teamsTable.name })
        .from(teamsTable)
        .where(eq(teamsTable.id, teamId));
      await notifyUser(updated.userId, teamId, {
        type: "role_changed",
        meta: { teamName: team?.name ?? "", role },
        link: "/staff",
      });
    }
    res.json(mapMember(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update team member");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Remove a member (or cancel a pending invite) — owner only
router.delete("/teams/:teamId/members/:memberId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const memberId = parseInt(req.params.memberId as string);

  if ((await getTeamRole(userId, teamId)) !== "owner") {
    res.status(403).json({ error: "Only the team owner can remove members" });
    return;
  }
  try {
    const [target] = await db
      .select()
      .from(teamMembersTable)
      .where(and(eq(teamMembersTable.id, memberId), eq(teamMembersTable.teamId, teamId)));
    if (!target) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (target.role === "owner") {
      res.status(400).json({ error: "The owner cannot be removed" });
      return;
    }
    await db.delete(teamMembersTable).where(eq(teamMembersTable.id, memberId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to remove team member");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

function mapMember(m: typeof teamMembersTable.$inferSelect) {
  return {
    id: m.id,
    teamId: m.teamId,
    userId: m.userId,
    email: m.email,
    displayName: m.displayName,
    role: m.role,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  };
}

export default router;
