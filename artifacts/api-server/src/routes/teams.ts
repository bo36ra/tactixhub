import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, teamsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// List teams for authenticated user
router.get("/teams", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  try {
    const teams = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.userId, userId))
      .orderBy(teamsTable.createdAt);
    res.json(teams.map(mapTeam));
  } catch (err) {
    req.log.error({ err }, "Failed to list teams");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create team
router.post("/teams", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const { name, ageGroup, season } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  try {
    const [team] = await db
      .insert(teamsTable)
      .values({ name, ageGroup: ageGroup || null, season: season || null, userId })
      .returning();
    res.status(201).json(mapTeam(team));
  } catch (err) {
    req.log.error({ err }, "Failed to create team");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get team
router.get("/teams/:teamId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  try {
    const [team] = await db
      .select()
      .from(teamsTable)
      .where(and(eq(teamsTable.id, teamId), eq(teamsTable.userId, userId)));
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    res.json(mapTeam(team));
  } catch (err) {
    req.log.error({ err }, "Failed to get team");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update team
router.patch("/teams/:teamId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const { name, ageGroup, season } = req.body;
  try {
    const [team] = await db
      .update(teamsTable)
      .set({
        ...(name !== undefined && { name }),
        ...(ageGroup !== undefined && { ageGroup }),
        ...(season !== undefined && { season }),
      })
      .where(and(eq(teamsTable.id, teamId), eq(teamsTable.userId, userId)))
      .returning();
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    res.json(mapTeam(team));
  } catch (err) {
    req.log.error({ err }, "Failed to update team");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete team
router.delete("/teams/:teamId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  try {
    await db
      .delete(teamsTable)
      .where(and(eq(teamsTable.id, teamId), eq(teamsTable.userId, userId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete team");
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapTeam(t: typeof teamsTable.$inferSelect) {
  return {
    id: t.id,
    name: t.name,
    ageGroup: t.ageGroup,
    season: t.season,
    userId: t.userId,
    createdAt: t.createdAt.toISOString(),
  };
}

export default router;
