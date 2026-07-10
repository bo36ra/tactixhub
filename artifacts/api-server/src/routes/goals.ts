import { dbErrorMessage } from "../lib/dbError";
import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, goalsTable, playersTable, teamsTable, matchesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

async function verifyTeamOwnership(userId: string, teamId: number): Promise<boolean> {
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.userId, userId)));
  return !!team;
}

// List goals
router.get("/teams/:teamId/goals", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const goals = await db
      .select({
        goal: goalsTable,
        scorerName: playersTable.name,
      })
      .from(goalsTable)
      .leftJoin(playersTable, eq(goalsTable.scorerPlayerId, playersTable.id))
      .where(eq(goalsTable.teamId, teamId))
      .orderBy(desc(goalsTable.createdAt));
    res.json(goals.map(({ goal, scorerName }) => mapGoal(goal, scorerName)));
  } catch (err) {
    req.log.error({ err }, "Failed to list goals");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Create goal
router.post("/teams/:teamId/goals", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { matchId, type, scorerPlayerId, minute, method, period } = req.body;
  if (!matchId || !type || minute === undefined || !method) {
    res.status(400).json({ error: "matchId, type, minute, and method are required" });
    return;
  }
  try {
    // Validate goal count against the match score
    const [match] = await db
      .select()
      .from(matchesTable)
      .where(and(eq(matchesTable.id, matchId), eq(matchesTable.teamId, teamId)));
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    const existingGoals = await db
      .select()
      .from(goalsTable)
      .where(and(eq(goalsTable.matchId, matchId), eq(goalsTable.teamId, teamId)));
    const existingOfType = existingGoals.filter((g) => g.type === type).length;
    const limit = type === "scored" ? match.ourGoals : match.theirGoals;
    if (existingOfType >= limit) {
      res.status(409).json({
        error: `Goal limit reached. Match score allows ${limit} ${type} goal(s) but ${existingOfType} already recorded.`,
      });
      return;
    }
    const [goal] = await db
      .insert(goalsTable)
      .values({
        teamId,
        matchId,
        type,
        scorerPlayerId: scorerPlayerId || null,
        minute,
        method,
        period: period || null,
      })
      .returning();

    let scorerName: string | null = null;
    if (goal.scorerPlayerId) {
      const [player] = await db
        .select()
        .from(playersTable)
        .where(eq(playersTable.id, goal.scorerPlayerId));
      scorerName = player?.name || null;
    }
    res.status(201).json(mapGoal(goal, scorerName));
  } catch (err) {
    req.log.error({ err }, "Failed to create goal");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Delete goal
router.delete("/teams/:teamId/goals/:goalId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const goalId = parseInt(req.params.goalId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    await db
      .delete(goalsTable)
      .where(and(eq(goalsTable.id, goalId), eq(goalsTable.teamId, teamId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete goal");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Top scorers
router.get("/teams/:teamId/goals/scorers", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const players = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.teamId, teamId));

    const goals = await db
      .select()
      .from(goalsTable)
      .where(eq(goalsTable.teamId, teamId));

    const scorers = players.map((p) => {
      const goalsScored = goals.filter(
        (g) => g.type === "scored" && g.scorerPlayerId === p.id,
      ).length;
      const goalsConceded = p.position === "goalkeeper"
        ? goals.filter((g) => g.type === "conceded").length
        : 0;
      return {
        playerId: p.id,
        playerName: p.name,
        jerseyNumber: p.jerseyNumber,
        position: p.position,
        goalsScored,
        goalsConceded,
      };
    });

    scorers.sort((a, b) => b.goalsScored - a.goalsScored);
    res.json(scorers);
  } catch (err) {
    req.log.error({ err }, "Failed to get top scorers");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

function mapGoal(g: typeof goalsTable.$inferSelect, scorerName: string | null | undefined) {
  return {
    id: g.id,
    teamId: g.teamId,
    matchId: g.matchId,
    type: g.type,
    scorerPlayerId: g.scorerPlayerId,
    scorerName: scorerName || null,
    minute: g.minute,
    method: g.method,
    period: g.period || null,
    createdAt: g.createdAt.toISOString(),
  };
}

export default router;
