import { Router } from "express";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { db, bodyWeightEntriesTable, oneRepMaxEntriesTable, playersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { verifyProTeam } from "../lib/teamAccess";
import { dbErrorMessage } from "../lib/dbError";

const router = Router();

// Same Pro-tier server-side enforcement as rpe.ts/wellness.ts/exercise-library.ts.
function guarded(handler: (req: any, res: any, teamId: number) => Promise<void>) {
  return async (req: any, res: any) => {
    const teamId = parseInt(req.params.teamId as string);
    if (!(await verifyProTeam(req.userId as string, teamId))) {
      res.status(403).json({ error: "pro_required" });
      return;
    }
    try {
      await handler(req, res, teamId);
    } catch (err) {
      req.log.error({ err }, "gym route failed");
      res.status(500).json({ error: dbErrorMessage(err) });
    }
  };
}

function cleanWeight(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 400 ? Math.round(n * 10) / 10 : null;
}

// ---- Body weight ----

router.get("/teams/:teamId/body-weight-entries", requireAuth, guarded(async (req, res, teamId) => {
  const { playerId, from, to } = req.query as { playerId?: string; from?: string; to?: string };
  const conditions = [eq(bodyWeightEntriesTable.teamId, teamId)];
  if (playerId) conditions.push(eq(bodyWeightEntriesTable.playerId, parseInt(playerId)));
  if (from) conditions.push(gte(bodyWeightEntriesTable.date, from));
  if (to) conditions.push(lte(bodyWeightEntriesTable.date, to));
  const rows = await db.select().from(bodyWeightEntriesTable).where(and(...conditions)).orderBy(bodyWeightEntriesTable.date);
  res.json(rows);
}));

// Batch upsert: one weigh-in per player per day, same pattern as
// wellness — resubmitting the same date overwrites that player's row.
router.post("/teams/:teamId/body-weight-entries/batch", requireAuth, guarded(async (req, res, teamId) => {
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
      weightKg: cleanWeight(e.weightKg),
      notes: typeof e.notes === "string" && e.notes.trim() ? e.notes.trim() : null,
    }))
    .filter((e: any): e is { playerId: number; weightKg: number; notes: string | null } => validIds.has(e.playerId) && e.weightKg !== null);

  if (clean.length === 0) {
    res.status(400).json({ error: "No valid entries to save" });
    return;
  }

  const rows = [];
  for (const e of clean) {
    const [row] = await db
      .insert(bodyWeightEntriesTable)
      .values({ teamId, playerId: e.playerId, date, weightKg: e.weightKg, notes: e.notes })
      .onConflictDoUpdate({
        target: [bodyWeightEntriesTable.playerId, bodyWeightEntriesTable.date],
        set: { weightKg: e.weightKg, notes: e.notes },
      })
      .returning();
    rows.push(row);
  }
  res.status(201).json(rows);
}));

router.delete("/teams/:teamId/body-weight-entries/:id", requireAuth, guarded(async (req, res, teamId) => {
  const id = parseInt(req.params.id);
  await db.delete(bodyWeightEntriesTable).where(and(eq(bodyWeightEntriesTable.id, id), eq(bodyWeightEntriesTable.teamId, teamId)));
  res.status(204).send();
}));

// ---- One-rep max ----

router.get("/teams/:teamId/one-rep-max-entries", requireAuth, guarded(async (req, res, teamId) => {
  const { playerId, lift } = req.query as { playerId?: string; lift?: string };
  const conditions = [eq(oneRepMaxEntriesTable.teamId, teamId)];
  if (playerId) conditions.push(eq(oneRepMaxEntriesTable.playerId, parseInt(playerId)));
  if (lift) conditions.push(eq(oneRepMaxEntriesTable.lift, lift));
  const rows = await db.select().from(oneRepMaxEntriesTable).where(and(...conditions)).orderBy(oneRepMaxEntriesTable.date);
  res.json(rows);
}));

// Individual create — unlike body weight, a 1RM test isn't a
// whole-squad-at-once event, it's tested per player per lift as it
// happens, so this is a single insert rather than a batch endpoint.
router.post("/teams/:teamId/one-rep-max-entries", requireAuth, guarded(async (req, res, teamId) => {
  const { playerId, lift, date, weightKg, notes } = req.body ?? {};
  const pid = parseInt(playerId);
  const w = cleanWeight(weightKg);
  if (!Number.isFinite(pid) || typeof lift !== "string" || !lift.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date) || w === null) {
    res.status(400).json({ error: "playerId, lift, date, and a valid weightKg are required" });
    return;
  }
  const [player] = await db.select({ id: playersTable.id }).from(playersTable).where(and(eq(playersTable.id, pid), eq(playersTable.teamId, teamId)));
  if (!player) {
    res.status(400).json({ error: "Player not found on this team" });
    return;
  }
  const [row] = await db
    .insert(oneRepMaxEntriesTable)
    .values({ teamId, playerId: pid, lift: lift.trim(), date, weightKg: w, notes: typeof notes === "string" && notes.trim() ? notes.trim() : null })
    .returning();
  res.status(201).json(row);
}));

router.delete("/teams/:teamId/one-rep-max-entries/:id", requireAuth, guarded(async (req, res, teamId) => {
  const id = parseInt(req.params.id);
  await db.delete(oneRepMaxEntriesTable).where(and(eq(oneRepMaxEntriesTable.id, id), eq(oneRepMaxEntriesTable.teamId, teamId)));
  res.status(204).send();
}));

export default router;
