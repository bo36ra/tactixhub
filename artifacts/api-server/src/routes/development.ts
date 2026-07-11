import { dbErrorMessage } from "../lib/dbError";
import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, trainingsTable, injuriesTable, ratingsTable, playersTable, teamsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

async function owns(userId: string, teamId: number): Promise<boolean> {
  const [team] = await db.select().from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.userId, userId)));
  return !!team;
}

// helper to wrap the repetitive guard + error handling
function guarded(handler: (req: any, res: any, teamId: number) => Promise<void>) {
  return async (req: any, res: any) => {
    const teamId = parseInt(req.params.teamId as string);
    if (!(await owns(req.userId as string, teamId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    try {
      await handler(req, res, teamId);
    } catch (err) {
      req.log.error({ err }, "development route failed");
      res.status(500).json({ error: dbErrorMessage(err) });
    }
  };
}

// ---------- Trainings ----------
router.get("/teams/:teamId/trainings", requireAuth, guarded(async (_req, res, teamId) => {
  res.json(await db.select().from(trainingsTable)
    .where(eq(trainingsTable.teamId, teamId)).orderBy(desc(trainingsTable.date)));
}));
router.post("/teams/:teamId/trainings", requireAuth, guarded(async (req, res, teamId) => {
  const { date, time, focus, drills, notes } = req.body;
  if (!date || !focus) { res.status(400).json({ error: "date and focus are required" }); return; }
  const [row] = await db.insert(trainingsTable)
    .values({ teamId, date, time: time || null, focus, drills: drills || null, notes: notes || null })
    .returning();
  res.status(201).json(row);
}));
router.delete("/teams/:teamId/trainings/:id", requireAuth, guarded(async (req, res, teamId) => {
  await db.delete(trainingsTable)
    .where(and(eq(trainingsTable.id, parseInt(req.params.id)), eq(trainingsTable.teamId, teamId)));
  res.status(204).end();
}));

// ---------- Injuries ----------
router.get("/teams/:teamId/injuries", requireAuth, guarded(async (_req, res, teamId) => {
  const rows = await db.select({ injury: injuriesTable, playerName: playersTable.name })
    .from(injuriesTable)
    .leftJoin(playersTable, eq(injuriesTable.playerId, playersTable.id))
    .where(eq(injuriesTable.teamId, teamId))
    .orderBy(desc(injuriesTable.createdAt));
  res.json(rows.map(({ injury, playerName }) => ({ ...injury, playerName })));
}));
router.post("/teams/:teamId/injuries", requireAuth, guarded(async (req, res, teamId) => {
  const { playerId, type, date, expectedReturn, notes } = req.body;
  if (!playerId || !type || !date) { res.status(400).json({ error: "playerId, type and date are required" }); return; }
  const [row] = await db.insert(injuriesTable)
    .values({ teamId, playerId, type, date, expectedReturn: expectedReturn || null, notes: notes || null })
    .returning();
  res.status(201).json(row);
}));
router.patch("/teams/:teamId/injuries/:id", requireAuth, guarded(async (req, res, teamId) => {
  const { status, expectedReturn, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (expectedReturn !== undefined) updates.expectedReturn = expectedReturn;
  if (notes !== undefined) updates.notes = notes;
  const [row] = await db.update(injuriesTable).set(updates)
    .where(and(eq(injuriesTable.id, parseInt(req.params.id)), eq(injuriesTable.teamId, teamId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Injury not found" }); return; }
  res.json(row);
}));
router.delete("/teams/:teamId/injuries/:id", requireAuth, guarded(async (req, res, teamId) => {
  await db.delete(injuriesTable)
    .where(and(eq(injuriesTable.id, parseInt(req.params.id)), eq(injuriesTable.teamId, teamId)));
  res.status(204).end();
}));

// ---------- Ratings (upsert per match+player) ----------
router.get("/teams/:teamId/matches/:matchId/ratings", requireAuth, guarded(async (req, res, teamId) => {
  res.json(await db.select().from(ratingsTable)
    .where(and(eq(ratingsTable.teamId, teamId), eq(ratingsTable.matchId, parseInt(req.params.matchId)))));
}));
router.post("/teams/:teamId/matches/:matchId/ratings", requireAuth, guarded(async (req, res, teamId) => {
  const matchId = parseInt(req.params.matchId);
  const { playerId, rating, note } = req.body;
  if (!playerId || !rating) { res.status(400).json({ error: "playerId and rating are required" }); return; }
  const [existing] = await db.select().from(ratingsTable)
    .where(and(eq(ratingsTable.teamId, teamId), eq(ratingsTable.matchId, matchId), eq(ratingsTable.playerId, playerId)));
  const row = existing
    ? (await db.update(ratingsTable).set({ rating, note: note || null })
        .where(eq(ratingsTable.id, existing.id)).returning())[0]
    : (await db.insert(ratingsTable)
        .values({ teamId, matchId, playerId, rating, note: note || null }).returning())[0];
  res.status(existing ? 200 : 201).json(row);
}));

export default router;
