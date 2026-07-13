import { dbErrorMessage } from "../lib/dbError";
import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, matchesTable, teamsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { verifyTeamAccess } from "../lib/teamAccess";

const router = Router();

// Team data is shared across the whole staff — any active member
// (owner/coach/assistant/analyst) may read and write it.
const verifyTeamOwnership = verifyTeamAccess;

// List matches
router.get("/teams/:teamId/matches", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const matches = await db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.teamId, teamId))
      .orderBy(desc(matchesTable.date));
    res.json(matches.map(mapMatch));
  } catch (err) {
    req.log.error({ err }, "Failed to list matches");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Create match
router.post("/teams/:teamId/matches", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { opponent, date, type, ourGoals, theirGoals } = req.body;
  if (!opponent || !date || !type) {
    res.status(400).json({ error: "opponent, date, and type are required" });
    return;
  }
  try {
    const [match] = await db
      .insert(matchesTable)
      .values({
        teamId,
        opponent,
        date,
        type,
        ourGoals: ourGoals ?? 0,
        theirGoals: theirGoals ?? 0,
      })
      .returning();
    res.status(201).json(mapMatch(match));
  } catch (err) {
    req.log.error({ err }, "Failed to create match");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Delete match
// Update a match (opponent, date, type, score)
router.patch("/teams/:teamId/matches/:matchId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const matchId = parseInt(req.params.matchId as string);
  const { opponent, date, type, ourGoals, theirGoals } = req.body ?? {};
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const [match] = await db
      .update(matchesTable)
      .set({
        ...(typeof opponent === "string" && opponent.trim() && { opponent: opponent.trim() }),
        ...(typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && { date }),
        ...(["league", "friendly", "cup"].includes(type) && { type }),
        ...(Number.isInteger(ourGoals) && ourGoals >= 0 && { ourGoals }),
        ...(Number.isInteger(theirGoals) && theirGoals >= 0 && { theirGoals }),
      })
      .where(and(eq(matchesTable.id, matchId), eq(matchesTable.teamId, teamId)))
      .returning();
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    res.json(mapMatch(match));
  } catch (err) {
    req.log.error({ err }, "Failed to update match");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

router.delete("/teams/:teamId/matches/:matchId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const matchId = parseInt(req.params.matchId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    await db
      .delete(matchesTable)
      .where(and(eq(matchesTable.id, matchId), eq(matchesTable.teamId, teamId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete match");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

function mapMatch(m: typeof matchesTable.$inferSelect) {
  return {
    id: m.id,
    teamId: m.teamId,
    opponent: m.opponent,
    date: m.date,
    type: m.type,
    formation: m.formation,
    ourGoals: m.ourGoals,
    theirGoals: m.theirGoals,
    createdAt: m.createdAt.toISOString(),
  };
}

export default router;
