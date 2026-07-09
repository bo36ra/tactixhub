import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, matchesTable, teamsTable, playersTable, lineupEntriesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { buildPlayerTimeline } from "../lib/playerTimeline";

const router = Router();

// A player belongs to a team belongs to a user — walk that chain to confirm
// the requesting user actually owns the player they're viewing.
async function verifyPlayerOwnership(userId: string, playerId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .innerJoin(teamsTable, eq(teamsTable.id, playersTable.teamId))
    .where(and(eq(playersTable.id, playerId), eq(teamsTable.userId, userId)));
  return !!row;
}

// Player profile timeline — every match and training day this player has
// a record for, connecting attendance + playing time + goals + cards.
router.get("/players/:playerId/timeline", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const playerId = parseInt(req.params.playerId as string);
  if (!(await verifyPlayerOwnership(userId, playerId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const result = await buildPlayerTimeline(playerId);
    if (!result) {
      res.status(404).json({ error: "Player not found" });
      return;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to build player timeline");
    res.status(500).json({ error: "Internal server error" });
  }
});

// A match belongs to a team belongs to a user — walk that chain to confirm
// the requesting user actually owns the match they're touching.
async function verifyMatchOwnership(userId: string, matchId: number): Promise<{ teamId: number } | null> {
  const [row] = await db
    .select({ teamId: matchesTable.teamId })
    .from(matchesTable)
    .innerJoin(teamsTable, eq(teamsTable.id, matchesTable.teamId))
    .where(and(eq(matchesTable.id, matchId), eq(teamsTable.userId, userId)));
  return row ?? null;
}

// Get lineup — formation + every assigned player (starters with a slot,
// substitutes with slotIndex null), joined with player name/jersey/position.
router.get("/matches/:matchId/lineup", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const matchId = parseInt(req.params.matchId as string);
  const ownedMatch = await verifyMatchOwnership(userId, matchId);
  if (!ownedMatch) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
    const entries = await db
      .select({
        id: lineupEntriesTable.id,
        playerId: lineupEntriesTable.playerId,
        slotIndex: lineupEntriesTable.slotIndex,
        isCaptain: lineupEntriesTable.isCaptain,
        playerName: playersTable.name,
        jerseyNumber: playersTable.jerseyNumber,
        position: playersTable.position,
      })
      .from(lineupEntriesTable)
      .innerJoin(playersTable, eq(playersTable.id, lineupEntriesTable.playerId))
      .where(eq(lineupEntriesTable.matchId, matchId));

    res.json({
      matchId,
      formation: match?.formation ?? "4-3-3",
      entries,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get lineup");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Replace lineup — wholesale upsert. The coach picks a formation and
// assigns players to slots on the frontend pitch; this saves the whole
// thing in one call rather than one request per slot.
router.put("/matches/:matchId/lineup", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const matchId = parseInt(req.params.matchId as string);
  const ownedMatch = await verifyMatchOwnership(userId, matchId);
  if (!ownedMatch) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { formation, entries } = req.body as {
    formation: string;
    entries: { playerId: number; slotIndex: number | null; isCaptain?: boolean }[];
  };
  if (!formation || !Array.isArray(entries)) {
    res.status(400).json({ error: "formation and entries are required" });
    return;
  }

  try {
    await db.update(matchesTable).set({ formation }).where(eq(matchesTable.id, matchId));
    await db.delete(lineupEntriesTable).where(eq(lineupEntriesTable.matchId, matchId));
    if (entries.length > 0) {
      await db.insert(lineupEntriesTable).values(
        entries.map((e) => ({
          matchId,
          playerId: e.playerId,
          slotIndex: e.slotIndex,
          isCaptain: e.isCaptain ?? false,
        })),
      );
    }
    res.status(200).json({ matchId, formation, saved: entries.length });
  } catch (err) {
    req.log.error({ err }, "Failed to save lineup");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
