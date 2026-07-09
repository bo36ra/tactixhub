import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, cardsTable, playersTable, teamsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

async function verifyTeamOwnership(userId: string, teamId: number): Promise<boolean> {
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.userId, userId)));
  return !!team;
}

// List cards
router.get("/teams/:teamId/cards", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const cards = await db
      .select({
        card: cardsTable,
        playerName: playersTable.name,
      })
      .from(cardsTable)
      .leftJoin(playersTable, eq(cardsTable.playerId, playersTable.id))
      .where(eq(cardsTable.teamId, teamId))
      .orderBy(desc(cardsTable.createdAt));
    res.json(cards.map(({ card, playerName }) => mapCard(card, playerName)));
  } catch (err) {
    req.log.error({ err }, "Failed to list cards");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create card
router.post("/teams/:teamId/cards", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { matchId, playerId, cardType, minute, period } = req.body;
  if (!matchId || !playerId || !cardType || minute === undefined) {
    res.status(400).json({ error: "matchId, playerId, cardType, and minute are required" });
    return;
  }
  try {
    const [card] = await db
      .insert(cardsTable)
      .values({ teamId, matchId, playerId, cardType, minute, period: period || null })
      .returning();

    const [player] = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.id, card.playerId));

    res.status(201).json(mapCard(card, player?.name || null));
  } catch (err) {
    req.log.error({ err }, "Failed to create card");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete card
router.delete("/teams/:teamId/cards/:cardId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const cardId = parseInt(req.params.cardId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    await db
      .delete(cardsTable)
      .where(and(eq(cardsTable.id, cardId), eq(cardsTable.teamId, teamId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete card");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Cards summary per player
router.get("/teams/:teamId/cards/summary", requireAuth, async (req, res) => {
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

    const cards = await db
      .select()
      .from(cardsTable)
      .where(eq(cardsTable.teamId, teamId));

    const summary = players.map((p) => {
      const playerCards = cards.filter((c) => c.playerId === p.id);
      const yellowCards = playerCards.filter((c) => c.cardType === "yellow").length;
      const redCards = playerCards.filter((c) => c.cardType === "red").length;

      let status: "clean" | "caution" | "warning" | "suspended";
      if (redCards > 0) {
        status = "suspended";
      } else if (yellowCards >= 3) {
        status = "warning";
      } else if (yellowCards >= 1) {
        status = "caution";
      } else {
        status = "clean";
      }

      return {
        playerId: p.id,
        playerName: p.name,
        jerseyNumber: p.jerseyNumber,
        yellowCards,
        redCards,
        status,
      };
    });

    res.json(summary);
  } catch (err) {
    req.log.error({ err }, "Failed to get cards summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapCard(c: typeof cardsTable.$inferSelect, playerName: string | null | undefined) {
  return {
    id: c.id,
    teamId: c.teamId,
    matchId: c.matchId,
    playerId: c.playerId,
    playerName: playerName || null,
    cardType: c.cardType,
    minute: c.minute,
    period: c.period || null,
    createdAt: c.createdAt.toISOString(),
  };
}

export default router;
