import { dbErrorMessage } from "../lib/dbError";
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
  trainingsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { verifyTeamAccess } from "../lib/teamAccess";

const router = Router();

// Team data is shared across the whole staff — any active member
// (owner/coach/assistant/analyst) may read and write it.
const verifyTeamOwnership = verifyTeamAccess;

router.get("/teams/:teamId/dashboard", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const [players, matches, goals, cards, attendance, trainings] = await Promise.all([
      db.select().from(playersTable).where(eq(playersTable.teamId, teamId)),
      db
        .select()
        .from(matchesTable)
        .where(eq(matchesTable.teamId, teamId))
        .orderBy(desc(matchesTable.date)),
      db.select().from(goalsTable).where(eq(goalsTable.teamId, teamId)),
      db.select().from(cardsTable).where(eq(cardsTable.teamId, teamId)),
      db.select().from(attendanceTable).where(eq(attendanceTable.teamId, teamId)),
      db.select().from(trainingsTable).where(eq(trainingsTable.teamId, teamId)),
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
    // Only actual scorers, and just the podium — a striker with zero
    // goals has no business on the leaderboard.
    const topScorers = scorers.filter((s) => s.goalsScored > 0).slice(0, 3);

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

    // "Today" section — driven by the client's own local date (query
    // param) rather than guessing a timezone server-side, since the
    // server and the coach's phone are very likely in different zones.
    const todayDate = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : new Date().toISOString().slice(0, 10);
    const todayTrainings = trainings
      .filter((tr) => tr.date === todayDate && tr.focus !== "rest_day")
      .map((tr) => ({ id: tr.id, date: tr.date, time: tr.time, focus: tr.focus }));
    const todayMatchesRaw = matches.filter((m) => m.date === todayDate);
    const todayMatches = todayMatchesRaw.map((m) => ({
      id: m.id,
      teamId: m.teamId,
      opponent: m.opponent,
      date: m.date,
      type: m.type,
      ourGoals: m.ourGoals,
      theirGoals: m.theirGoals,
      createdAt: m.createdAt.toISOString(),
    }));
    const attendanceMarked = attendance.some((a) => a.date === todayDate);

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
      today: {
        date: todayDate,
        trainings: todayTrainings,
        matches: todayMatches,
        attendanceMarked,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

export default router;
