import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, accessRequestsTable, teamsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getClerkUserInfo } from "../lib/clerkUsers";
import { isSuperAdmin } from "../lib/superAdmin";
import { dbErrorMessage } from "../lib/dbError";

const router = Router();

async function requireSuperAdmin(req: any, res: any, next: any) {
  const userId = req.userId as string;
  const { email } = await getClerkUserInfo(userId);
  if (!isSuperAdmin(email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

// The signed-in user's own access status — used by the frontend to
// decide whether to show the "create your team" CTA, a pending-review
// state, or the admin panel link. Super admins are always implicitly
// approved (bootstrap: the owner never has to approve themselves).
router.get("/access-requests/me", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const { email } = await getClerkUserInfo(userId);
  if (isSuperAdmin(email)) {
    res.json({ status: "approved", isAdmin: true });
    return;
  }
  const [row] = await db.select().from(accessRequestsTable).where(eq(accessRequestsTable.userId, userId));
  res.json({ status: row?.status ?? "none", isAdmin: false });
});

// ---- Admin ----
router.get("/admin/access-requests", requireAuth, requireSuperAdmin, async (_req, res) => {
  const rows = await db.select().from(accessRequestsTable).orderBy(accessRequestsTable.createdAt);
  res.json(rows);
});

router.post("/admin/access-requests/:id/approve", requireAuth, requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const [row] = await db
    .update(accessRequestsTable)
    .set({ status: "approved", decidedAt: new Date() })
    .where(eq(accessRequestsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  res.json(row);
});

router.post("/admin/access-requests/:id/reject", requireAuth, requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const [row] = await db
    .update(accessRequestsTable)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(eq(accessRequestsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  res.json(row);
});

// All teams with their tier — lets the owner manually bump a team to a
// paid tier once they've settled payment out-of-band, ahead of any
// payment gateway integration.
router.get("/admin/teams", requireAuth, requireSuperAdmin, async (_req, res) => {
  const rows = await db.select().from(teamsTable).orderBy(teamsTable.createdAt);
  res.json(rows);
});

router.patch("/admin/teams/:teamId", requireAuth, requireSuperAdmin, async (req, res) => {
  const teamId = parseInt(req.params.teamId as string);
  const { tier } = req.body ?? {};
  if (!["free", "pro"].includes(tier)) {
    res.status(400).json({ error: "tier must be 'free' or 'pro'" });
    return;
  }
  try {
    const [row] = await db.update(teamsTable).set({ tier }).where(eq(teamsTable.id, teamId)).returning();
    if (!row) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update team tier");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

export default router;
export { requireSuperAdmin };
