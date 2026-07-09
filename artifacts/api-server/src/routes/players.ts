import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, playersTable, teamsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router({ mergeParams: true });

async function verifyTeamOwnership(userId: string, teamId: number): Promise<boolean> {
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.userId, userId)));
  return !!team;
}

// List players
router.get("/teams/:teamId/players", requireAuth, async (req, res) => {
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
      .where(eq(playersTable.teamId, teamId))
      .orderBy(playersTable.jerseyNumber);
    res.json(players.map(mapPlayer));
  } catch (err) {
    req.log.error({ err }, "Failed to list players");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create player
router.post("/teams/:teamId/players", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, jerseyNumber, position, age, nationality, status } = req.body;
  if (!name || !jerseyNumber || !position) {
    res.status(400).json({ error: "name, jerseyNumber, and position are required" });
    return;
  }
  try {
    const [player] = await db
      .insert(playersTable)
      .values({ teamId, name, jerseyNumber, position, age: age || null, nationality: nationality || null, status: status || "active" })
      .returning();
    res.status(201).json(mapPlayer(player));
  } catch (err) {
    req.log.error({ err }, "Failed to create player");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update player
router.patch("/teams/:teamId/players/:playerId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const playerId = parseInt(req.params.playerId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, jerseyNumber, position, age, nationality, status } = req.body;
  try {
    const [player] = await db
      .update(playersTable)
      .set({
        ...(name !== undefined && { name }),
        ...(jerseyNumber !== undefined && { jerseyNumber }),
        ...(position !== undefined && { position }),
        ...(age !== undefined && { age }),
        ...(nationality !== undefined && { nationality }),
        ...(status !== undefined && { status }),
      })
      .where(and(eq(playersTable.id, playerId), eq(playersTable.teamId, teamId)))
      .returning();
    if (!player) {
      res.status(404).json({ error: "Player not found" });
      return;
    }
    res.json(mapPlayer(player));
  } catch (err) {
    req.log.error({ err }, "Failed to update player");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete player
router.delete("/teams/:teamId/players/:playerId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const playerId = parseInt(req.params.playerId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    await db
      .delete(playersTable)
      .where(and(eq(playersTable.id, playerId), eq(playersTable.teamId, teamId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete player");
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapPlayer(p: typeof playersTable.$inferSelect) {
  return {
    id: p.id,
    teamId: p.teamId,
    name: p.name,
    jerseyNumber: p.jerseyNumber,
    position: p.position,
    age: p.age,
    nationality: p.nationality,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  };
}

export default router;
