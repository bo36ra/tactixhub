import { dbErrorMessage } from "../lib/dbError";
import { Router } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, matchVideoTagsTable, matchesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { verifyTeamAccess } from "../lib/teamAccess";

const router = Router();

const verifyTeamOwnership = verifyTeamAccess;

function mapTag(t: typeof matchVideoTagsTable.$inferSelect) {
  return {
    id: t.id,
    matchId: t.matchId,
    timestampSeconds: t.timestampSeconds,
    label: t.label,
    category: t.category,
    playerId: t.playerId,
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/teams/:teamId/matches/:matchId/video-tags", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const matchId = parseInt(req.params.matchId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(matchVideoTagsTable)
      .where(eq(matchVideoTagsTable.matchId, matchId))
      .orderBy(asc(matchVideoTagsTable.timestampSeconds));
    res.json(rows.map(mapTag));
  } catch (err) {
    req.log.error({ err }, "Failed to list video tags");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

router.post("/teams/:teamId/matches/:matchId/video-tags", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const matchId = parseInt(req.params.matchId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { timestampSeconds, label, category, playerId } = req.body ?? {};
  if (!Number.isInteger(timestampSeconds) || timestampSeconds < 0) {
    res.status(400).json({ error: "timestampSeconds must be a non-negative integer" });
    return;
  }
  if (!label || typeof label !== "string" || !label.trim()) {
    res.status(400).json({ error: "label is required" });
    return;
  }
  try {
    // Make sure the match actually belongs to this team before attaching a
    // tag to it — the team-membership check above only proves the caller
    // belongs to teamId, not that matchId is really one of its matches.
    const [match] = await db
      .select({ id: matchesTable.id })
      .from(matchesTable)
      .where(and(eq(matchesTable.id, matchId), eq(matchesTable.teamId, teamId)));
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    const [row] = await db
      .insert(matchVideoTagsTable)
      .values({
        matchId,
        timestampSeconds,
        label: label.trim().slice(0, 200),
        category: typeof category === "string" ? category.trim().slice(0, 100) || null : null,
        playerId: Number.isInteger(playerId) ? playerId : null,
      })
      .returning();
    res.status(201).json(mapTag(row));
  } catch (err) {
    req.log.error({ err }, "Failed to create video tag");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

router.delete("/teams/:teamId/matches/:matchId/video-tags/:tagId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const matchId = parseInt(req.params.matchId as string);
  const tagId = parseInt(req.params.tagId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const [row] = await db
      .delete(matchVideoTagsTable)
      .where(and(eq(matchVideoTagsTable.id, tagId), eq(matchVideoTagsTable.matchId, matchId)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete video tag");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

export default router;
