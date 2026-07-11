import { dbErrorMessage } from "../lib/dbError";
import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, tacticsTable, opponentNotesTable, teamsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { verifyTeamAccess } from "../lib/teamAccess";

const router = Router();

// Team data is shared across the whole staff — any active member
// (owner/coach/assistant/analyst) may read and write it.
const verifyTeamOwnership = verifyTeamAccess;

// ---------- Tactics boards (general / set pieces / match plans) ----------

router.get("/teams/:teamId/tactics", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(tacticsTable)
      .where(eq(tacticsTable.teamId, teamId))
      .orderBy(desc(tacticsTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list tactics");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

router.post("/teams/:teamId/tactics", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, kind, matchId, data } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  try {
    const [row] = await db
      .insert(tacticsTable)
      .values({
        teamId,
        name,
        kind: kind || "general",
        matchId: matchId ?? null,
        data: typeof data === "string" ? data : JSON.stringify(data ?? {}),
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create tactic");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

router.patch("/teams/:teamId/tactics/:tacticId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const tacticId = parseInt(req.params.tacticId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, kind, matchId, data } = req.body;
  try {
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (kind !== undefined) updates.kind = kind;
    if (matchId !== undefined) updates.matchId = matchId;
    if (data !== undefined) updates.data = typeof data === "string" ? data : JSON.stringify(data);
    const [row] = await db
      .update(tacticsTable)
      .set(updates)
      .where(and(eq(tacticsTable.id, tacticId), eq(tacticsTable.teamId, teamId)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Tactic not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update tactic");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

router.delete("/teams/:teamId/tactics/:tacticId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const tacticId = parseInt(req.params.tacticId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    await db
      .delete(tacticsTable)
      .where(and(eq(tacticsTable.id, tacticId), eq(tacticsTable.teamId, teamId)));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to delete tactic");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// ---------- Opponent notes ----------

router.get("/teams/:teamId/opponent-notes", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(opponentNotesTable)
      .where(eq(opponentNotesTable.teamId, teamId))
      .orderBy(desc(opponentNotesTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list opponent notes");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

router.post("/teams/:teamId/opponent-notes", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { opponent, strengths, weaknesses, plan } = req.body;
  if (!opponent) {
    res.status(400).json({ error: "opponent is required" });
    return;
  }
  try {
    const [row] = await db
      .insert(opponentNotesTable)
      .values({ teamId, opponent, strengths: strengths || null, weaknesses: weaknesses || null, plan: plan || null })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create opponent note");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

router.patch("/teams/:teamId/opponent-notes/:noteId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const noteId = parseInt(req.params.noteId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { opponent, strengths, weaknesses, plan } = req.body;
  try {
    const updates: Record<string, unknown> = {};
    if (opponent !== undefined) updates.opponent = opponent;
    if (strengths !== undefined) updates.strengths = strengths;
    if (weaknesses !== undefined) updates.weaknesses = weaknesses;
    if (plan !== undefined) updates.plan = plan;
    const [row] = await db
      .update(opponentNotesTable)
      .set(updates)
      .where(and(eq(opponentNotesTable.id, noteId), eq(opponentNotesTable.teamId, teamId)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Note not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update opponent note");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

router.delete("/teams/:teamId/opponent-notes/:noteId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const noteId = parseInt(req.params.noteId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    await db
      .delete(opponentNotesTable)
      .where(and(eq(opponentNotesTable.id, noteId), eq(opponentNotesTable.teamId, teamId)));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to delete opponent note");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

export default router;
