import { Router } from "express";
import { and, eq, ilike, or } from "drizzle-orm";
import { db, playersTable, matchesTable, notesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { verifyTeamAccess } from "../lib/teamAccess";
import { dbErrorMessage } from "../lib/dbError";

const router = Router();

// One combined endpoint rather than three separate ones — a quick
// search box wants everything back in a single round trip, not three
// requests it has to merge client-side.
router.get("/teams/:teamId/search", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamAccess(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 2) {
    res.json({ players: [], matches: [], notes: [] });
    return;
  }
  const like = `%${q}%`;
  try {
    const [players, matches, notes] = await Promise.all([
      db
        .select({ id: playersTable.id, name: playersTable.name, nameAlt: playersTable.nameAlt, jerseyNumber: playersTable.jerseyNumber, photo: playersTable.photo })
        .from(playersTable)
        .where(and(eq(playersTable.teamId, teamId), or(ilike(playersTable.name, like), ilike(playersTable.nameAlt, like))))
        .limit(6),
      db
        .select({ id: matchesTable.id, opponent: matchesTable.opponent, date: matchesTable.date, ourGoals: matchesTable.ourGoals, theirGoals: matchesTable.theirGoals })
        .from(matchesTable)
        .where(and(eq(matchesTable.teamId, teamId), ilike(matchesTable.opponent, like)))
        .limit(6),
      db
        .select({ id: notesTable.id, title: notesTable.title, content: notesTable.content })
        .from(notesTable)
        .where(and(eq(notesTable.teamId, teamId), or(ilike(notesTable.title, like), ilike(notesTable.content, like))))
        .limit(6),
    ]);
    res.json({ players, matches, notes });
  } catch (err) {
    req.log.error({ err }, "search failed");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

export default router;
