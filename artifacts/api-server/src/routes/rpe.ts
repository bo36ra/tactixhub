import { Router } from "express";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { db, rpeEntriesTable, playersTable } from "@workspace/db";
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
      req.log.error({ err }, "rpe route failed");
      res.status(500).json({ error: dbErrorMessage(err) });
    }
  };
}

function cleanRpe(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? Math.round(n) : null;
}
function cleanMinutes(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 300) : null;
}
const VALID_SESSION_TYPES = ["training", "match", "other"];

router.get("/teams/:teamId/rpe-entries", requireAuth, guarded(async (req, res, teamId) => {
  const { playerId, from, to } = req.query as { playerId?: string; from?: string; to?: string };
  const conditions = [eq(rpeEntriesTable.teamId, teamId)];
  if (playerId) conditions.push(eq(rpeEntriesTable.playerId, parseInt(playerId)));
  if (from) conditions.push(gte(rpeEntriesTable.date, from));
  if (to) conditions.push(lte(rpeEntriesTable.date, to));
  const rows = await db.select().from(rpeEntriesTable).where(and(...conditions)).orderBy(rpeEntriesTable.date);
  res.json(rows);
}));

router.post("/teams/:teamId/rpe-entries", requireAuth, guarded(async (req, res, teamId) => {
  const { playerId, date, sessionType, durationMinutes, rpe, notes } = req.body ?? {};
  const minutes = cleanMinutes(durationMinutes);
  const rpeVal = cleanRpe(rpe);
  if (!playerId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || minutes === null || rpeVal === null) {
    res.status(400).json({ error: "playerId, date, durationMinutes (1-300) and rpe (0-10) are required" });
    return;
  }
  const [row] = await db
    .insert(rpeEntriesTable)
    .values({
      teamId,
      playerId: parseInt(playerId),
      date,
      sessionType: VALID_SESSION_TYPES.includes(sessionType) ? sessionType : "training",
      durationMinutes: minutes,
      rpe: rpeVal,
      notes: notes || null,
    })
    .returning();
  res.status(201).json(row);
}));

router.post("/teams/:teamId/rpe-entries/batch", requireAuth, guarded(async (req, res, teamId) => {
  const { date, sessionType, entries } = req.body ?? {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(entries)) {
    res.status(400).json({ error: "date and entries[] are required" });
    return;
  }
  const type = VALID_SESSION_TYPES.includes(sessionType) ? sessionType : "training";

  const playerIds = entries.map((e: any) => parseInt(e.playerId)).filter(Number.isFinite);
  const validPlayers = playerIds.length
    ? await db.select({ id: playersTable.id }).from(playersTable).where(and(eq(playersTable.teamId, teamId), inArray(playersTable.id, playerIds)))
    : [];
  const validIds = new Set(validPlayers.map((p) => p.id));

  const clean = entries
    .map((e: any) => ({
      teamId,
      playerId: parseInt(e.playerId),
      date,
      sessionType: type,
      durationMinutes: cleanMinutes(e.durationMinutes),
      rpe: cleanRpe(e.rpe),
      notes: typeof e.notes === "string" && e.notes.trim() ? e.notes.trim() : null,
    }))
    .filter((e: any): e is { teamId: number; playerId: number; date: string; sessionType: string; durationMinutes: number; rpe: number; notes: string | null } =>
      validIds.has(e.playerId) && e.durationMinutes !== null && e.rpe !== null);

  if (clean.length === 0) {
    res.status(400).json({ error: "No valid entries to save" });
    return;
  }
  const rows = await db.insert(rpeEntriesTable).values(clean).returning();
  res.status(201).json(rows);
}));

router.delete("/teams/:teamId/rpe-entries/:id", requireAuth, guarded(async (req, res, teamId) => {
  const id = parseInt(req.params.id);
  const [row] = await db
    .delete(rpeEntriesTable)
    .where(and(eq(rpeEntriesTable.id, id), eq(rpeEntriesTable.teamId, teamId)))
    .returning({ id: rpeEntriesTable.id });
  if (!row) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.status(204).end();
}));

export default router;
