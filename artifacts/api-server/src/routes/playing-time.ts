import { dbErrorMessage } from "../lib/dbError";
import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, playingTimeTable, playersTable, matchesTable, teamsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

async function verifyTeamOwnership(userId: string, teamId: number): Promise<boolean> {
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.userId, userId)));
  return !!team;
}

// List playing time records
router.get("/teams/:teamId/playing-time", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const records = await db
      .select()
      .from(playingTimeTable)
      .where(eq(playingTimeTable.teamId, teamId));
    res.json(records.map(mapPlayingTime));
  } catch (err) {
    req.log.error({ err }, "Failed to list playing time");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Record playing time for a match (batch)
router.post("/teams/:teamId/playing-time", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { matchId, entries } = req.body;
  if (!matchId || !Array.isArray(entries)) {
    res.status(400).json({ error: "matchId and entries array are required" });
    return;
  }
  try {
    // Delete existing records for this match
    await db
      .delete(playingTimeTable)
      .where(
        and(
          eq(playingTimeTable.teamId, teamId),
          eq(playingTimeTable.matchId, matchId),
        ),
      );

    if (entries.length === 0) {
      res.status(201).json([]);
      return;
    }

    const inserted = await db
      .insert(playingTimeTable)
      .values(
        entries.map((e: { playerId: number; minutes: number }) => ({
          teamId,
          matchId,
          playerId: e.playerId,
          minutes: e.minutes,
        })),
      )
      .returning();

    res.status(201).json(inserted.map(mapPlayingTime));
  } catch (err) {
    req.log.error({ err }, "Failed to record playing time");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Playing time summary per player
router.get("/teams/:teamId/playing-time/summary", requireAuth, async (req, res) => {
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

    const records = await db
      .select()
      .from(playingTimeTable)
      .where(eq(playingTimeTable.teamId, teamId));

    const matchCount = await db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.teamId, teamId));

    const totalMatchCount = matchCount.length;

    const summary = players.map((p) => {
      const playerRecords = records.filter((r) => r.playerId === p.id);
      const totalMinutes = playerRecords.reduce((sum, r) => sum + r.minutes, 0);
      const matchesPlayed = playerRecords.filter((r) => r.minutes > 0).length;
      const avgPerMatch = matchesPlayed > 0 ? totalMinutes / matchesPlayed : 0;
      const participationPct =
        totalMatchCount > 0 ? (totalMinutes / (totalMatchCount * 90)) * 100 : 0;

      return {
        playerId: p.id,
        playerName: p.name,
        jerseyNumber: p.jerseyNumber,
        totalMinutes,
        matchesPlayed,
        avgPerMatch: Math.round(avgPerMatch * 10) / 10,
        participationPct: Math.min(Math.round(participationPct * 10) / 10, 100),
      };
    });

    summary.sort((a, b) => b.totalMinutes - a.totalMinutes);
    res.json(summary);
  } catch (err) {
    req.log.error({ err }, "Failed to get playing time summary");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

function mapPlayingTime(p: typeof playingTimeTable.$inferSelect) {
  return {
    id: p.id,
    teamId: p.teamId,
    matchId: p.matchId,
    playerId: p.playerId,
    minutes: p.minutes,
    createdAt: p.createdAt.toISOString(),
  };
}

export default router;
