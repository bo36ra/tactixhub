import { Router } from "express";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { db, wellnessEntriesTable, playersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { verifyTeamAccess } from "../lib/teamAccess";
import { dbErrorMessage } from "../lib/dbError";

const router = Router();

function guarded(handler: (req: any, res: any, teamId: number) => Promise<void>) {
  return async (req: any, res: any) => {
    const teamId = parseInt(req.params.teamId as string);
    if (!(await verifyTeamAccess(req.userId as string, teamId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    try {
      await handler(req, res, teamId);
    } catch (err) {
      req.log.error({ err }, "wellness route failed");
      res.status(500).json({ error: dbErrorMessage(err) });
    }
  };
}

function clean1to5(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : null;
}

router.get("/teams/:teamId/wellness-entries", requireAuth, guarded(async (req, res, teamId) => {
  const { playerId, from, to } = req.query as { playerId?: string; from?: string; to?: string };
  const conditions = [eq(wellnessEntriesTable.teamId, teamId)];
  if (playerId) conditions.push(eq(wellnessEntriesTable.playerId, parseInt(playerId)));
  if (from) conditions.push(gte(wellnessEntriesTable.date, from));
  if (to) conditions.push(lte(wellnessEntriesTable.date, to));
  const rows = await db.select().from(wellnessEntriesTable).where(and(...conditions)).orderBy(wellnessEntriesTable.date);
  res.json(rows);
}));

// Batch upsert: one check-in per player per day. Re-submitting the same
// date overwrites that player's row (via ON CONFLICT) instead of
// stacking duplicates. Looping one upsert per player keeps each row's
// SET values correct — a single multi-row upsert can't express
// "different values per conflicting row" cleanly.
router.post("/teams/:teamId/wellness-entries/batch", requireAuth, guarded(async (req, res, teamId) => {
  const { date, entries } = req.body ?? {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(entries)) {
    res.status(400).json({ error: "date and entries[] are required" });
    return;
  }

  const playerIds = entries.map((e: any) => parseInt(e.playerId)).filter(Number.isFinite);
  const validPlayers = playerIds.length
    ? await db.select({ id: playersTable.id }).from(playersTable).where(and(eq(playersTable.teamId, teamId), inArray(playersTable.id, playerIds)))
    : [];
  const validIds = new Set(validPlayers.map((p) => p.id));

  const clean = entries
    .map((e: any) => ({
      playerId: parseInt(e.playerId),
      sleepQuality: clean1to5(e.sleepQuality),
      fatigue: clean1to5(e.fatigue),
      soreness: clean1to5(e.soreness),
      mood: clean1to5(e.mood),
      notes: typeof e.notes === "string" && e.notes.trim() ? e.notes.trim() : null,
    }))
    .filter(
      (e: any): e is { playerId: number; sleepQuality: number; fatigue: number; soreness: number; mood: number; notes: string | null } =>
        validIds.has(e.playerId) && e.sleepQuality !== null && e.fatigue !== null && e.soreness !== null && e.mood !== null,
    );

  if (clean.length === 0) {
    res.status(400).json({ error: "No valid entries to save" });
    return;
  }

  const rows = [];
  for (const e of clean) {
    const values = {
      teamId,
      playerId: e.playerId,
      date,
      sleepQuality: e.sleepQuality,
      fatigue: e.fatigue,
      soreness: e.soreness,
      mood: e.mood,
      notes: e.notes,
    };
    const [row] = await db
      .insert(wellnessEntriesTable)
      .values(values)
      .onConflictDoUpdate({
        target: [wellnessEntriesTable.playerId, wellnessEntriesTable.date],
        set: {
          sleepQuality: e.sleepQuality,
          fatigue: e.fatigue,
          soreness: e.soreness,
          mood: e.mood,
          notes: e.notes,
        },
      })
      .returning();
    rows.push(row);
  }
  res.status(201).json(rows);
}));

export default router;
