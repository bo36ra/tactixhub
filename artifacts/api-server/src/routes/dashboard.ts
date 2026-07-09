import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  playersTable,
  matchesTable,
  goalsTable,
  cardsTable,
  teamsTable,
  attendanceTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

async function verifyTeamOwnership(userId: string, teamId: number): Promise<boolean> {
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.userId, userId)));
  return !!team;
}

router.get("/teams/:teamId/dashboard", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const [players, matches, goals, cards, attendance] = await Promise.all([
      db.select().from(playersTable).where(eq(playersTable.teamId, teamId)),
      db
        .select()
        .from(matchesTable)
        .where(eq(matchesTable.teamId, teamId))
        .orderBy(desc(matchesTable.date)),
      db.select().from(goalsTable).where(eq(goalsTable.teamId, teamId)),
      db.select().from(cardsTable).where(eq(cardsTable.teamId, teamId)),
      db.select().from(attendanceTable).where(eq(attendanceTable.teamId, teamId)),
    ]);

    const totalPlayers = players.length;
    const totalMatches = matches.length;
    const wins = matches.filter((m) => m.ourGoals > m.theirGoals).length;
    const draws = matches.filter((m) => m.ourGoals === m.theirGoals).length;
    const losses = matches.filter((m) => m.ourGoals < m.theirGoals).length;
    const goalsScored = goals.filter((g) => g.type === "scored").length;
    const goalsConceded = goals.filter((g) => g.type === "conceded").length;
    const cleanSheets = matches.filter((m) => m.theirGoals === 0).length;
    const goalDifference = goalsScored - goalsConceded;
    const avgAttendanceRate =
      attendance.length > 0
        ? Math.round((attendance.filter((a) => a.present).length / attendance.length) * 100)
        : 0;

    // Top scorers
    const scorers = players.map((p) => {
      const goalsScored = goals.filter(
        (g) => g.type === "scored" && g.scorerPlayerId === p.id,
      ).length;
      const gc =
        p.position === "goalkeeper"
          ? goals.filter((g) => g.type === "conceded").length
          : 0;
      return {
        playerId: p.id,
        playerName: p.name,
        jerseyNumber: p.jerseyNumber,
        position: p.position,
        goalsScored,
        goalsConceded: gc,
      };
    });
    scorers.sort((a, b) => b.goalsScored - a.goalsScored);
    const topScorers = scorers.slice(0, 5);

    // Card warnings
    const cardWarnings = players
      .map((p) => {
        const playerCards = cards.filter((c) => c.playerId === p.id);
        const yellowCards = playerCards.filter((c) => c.cardType === "yellow").length;
        const redCards = playerCards.filter((c) => c.cardType === "red").length;
        let status: "clean" | "caution" | "warning" | "suspended";
        if (redCards > 0) status = "suspended";
        else if (yellowCards >= 3) status = "warning";
        else if (yellowCards >= 1) status = "caution";
        else status = "clean";
        return { playerId: p.id, playerName: p.name, jerseyNumber: p.jerseyNumber, yellowCards, redCards, status };
      })
      .filter((p) => p.yellowCards >= 2 || p.redCards > 0);

    const recentMatches = matches.slice(0, 3).map((m) => ({
      id: m.id,
      teamId: m.teamId,
      opponent: m.opponent,
      date: m.date,
      type: m.type,
      ourGoals: m.ourGoals,
      theirGoals: m.theirGoals,
      createdAt: m.createdAt.toISOString(),
    }));

    res.json({
      totalPlayers,
      totalMatches,
      wins,
      draws,
      losses,
      goalsScored,
      goalsConceded,
      cleanSheets,
      goalDifference,
      avgAttendanceRate,
      recentMatches,
      topScorers,
      cardWarnings,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
