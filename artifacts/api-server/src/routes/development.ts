import { dbErrorMessage } from "../lib/dbError";
import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, trainingsTable, injuriesTable, ratingsTable, playersTable, teamsTable, matchesTable, matchPlansTable, weekCyclesTable, monthPlansTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { verifyTeamAccess } from "../lib/teamAccess";

const router = Router();

// Shared staff access: any active team member may read/write.
const owns = verifyTeamAccess;

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
  const { date, time, focus, drills, notes, intensity, durationMinutes } = req.body;
  const cleanIntensity = ["light", "medium", "high"].includes(intensity) ? intensity : null;
  const cleanDuration =
    Number.isFinite(Number(durationMinutes)) && Number(durationMinutes) > 0
      ? Math.min(Math.round(Number(durationMinutes)), 600)
      : null;
  if (!date || !focus) { res.status(400).json({ error: "date and focus are required" }); return; }
  const [row] = await db.insert(trainingsTable)
    .values({ teamId, date, time: time || null, focus, drills: drills || null, notes: notes || null, intensity: cleanIntensity, durationMinutes: cleanDuration })
    .returning();
  res.status(201).json(row);
}));
router.delete("/teams/:teamId/trainings/:id", requireAuth, guarded(async (req, res, teamId) => {
  await db.delete(trainingsTable)
    .where(and(eq(trainingsTable.id, parseInt(req.params.id)), eq(trainingsTable.teamId, teamId)));
  res.status(204).end();
}));

// ---------- Injuries ----------
// All ratings for one player across matches — powers the development
// curve on the player profile.
router.get("/teams/:teamId/players/:playerId/ratings", requireAuth, guarded(async (req, res, teamId) => {
  const playerId = parseInt(req.params.playerId as string);
  const rows = await db
    .select({
      id: ratingsTable.id,
      matchId: ratingsTable.matchId,
      rating: ratingsTable.rating,
      note: ratingsTable.note,
      date: matchesTable.date,
      opponent: matchesTable.opponent,
    })
    .from(ratingsTable)
    .innerJoin(matchesTable, eq(ratingsTable.matchId, matchesTable.id))
    .where(and(eq(ratingsTable.teamId, teamId), eq(ratingsTable.playerId, playerId)))
    .orderBy(matchesTable.date);
  res.json(rows);
}));

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

// ---- Match plans ----
router.get("/teams/:teamId/matches/:matchId/plan", requireAuth, guarded(async (req, res, teamId) => {
  const matchId = parseInt(req.params.matchId as string);
  const [plan] = await db
    .select()
    .from(matchPlansTable)
    .where(and(eq(matchPlansTable.teamId, teamId), eq(matchPlansTable.matchId, matchId)));
  res.json(plan ?? null);
}));

router.put("/teams/:teamId/matches/:matchId/plan", requireAuth, guarded(async (req, res, teamId) => {
  const matchId = parseInt(req.params.matchId as string);
  const { opponentNotes, instructions } = req.body ?? {};
  // Make sure the match actually belongs to this team before upserting.
  const [match] = await db
    .select({ id: matchesTable.id })
    .from(matchesTable)
    .where(and(eq(matchesTable.id, matchId), eq(matchesTable.teamId, teamId)));
  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  const values = {
    teamId,
    matchId,
    opponentNotes: typeof opponentNotes === "string" && opponentNotes.trim() ? opponentNotes.trim() : null,
    instructions: typeof instructions === "string" && instructions.trim() ? instructions.trim() : null,
    updatedAt: new Date(),
  };
  const [plan] = await db
    .insert(matchPlansTable)
    .values(values)
    .onConflictDoUpdate({ target: matchPlansTable.matchId, set: values })
    .returning();
  res.json(plan);
}));

// ---- Weekly cycle (microcycle) ----
router.get("/teams/:teamId/cycle", requireAuth, guarded(async (_req, res, teamId) => {
  const rows = await db
    .select()
    .from(weekCyclesTable)
    .where(eq(weekCyclesTable.teamId, teamId))
    .orderBy(weekCyclesTable.dayOfWeek);
  res.json(rows);
}));

// Replace the whole 7-day template in one shot (rest days are simply absent)
router.put("/teams/:teamId/cycle", requireAuth, guarded(async (req, res, teamId) => {
  const days = Array.isArray(req.body?.days) ? req.body.days : [];
  const clean = days
    .filter((d: any) => Number.isInteger(d?.dayOfWeek) && d.dayOfWeek >= 0 && d.dayOfWeek <= 6 && typeof d.focus === "string" && d.focus)
    .map((d: any) => ({
      teamId,
      dayOfWeek: d.dayOfWeek,
      focus: String(d.focus),
      intensity: ["light", "medium", "high"].includes(d.intensity) ? d.intensity : null,
      durationMinutes:
        Number.isFinite(Number(d.durationMinutes)) && Number(d.durationMinutes) > 0
          ? Math.min(Math.round(Number(d.durationMinutes)), 600)
          : null,
      time: typeof d.time === "string" && d.time ? d.time : null,
    }));
  await db.delete(weekCyclesTable).where(eq(weekCyclesTable.teamId, teamId));
  const rows = clean.length ? await db.insert(weekCyclesTable).values(clean).returning() : [];
  res.json(rows);
}));

// Apply the cycle over a date range: create planned trainings on matching
// weekdays, skipping days that already have a training or a match.
router.post("/teams/:teamId/cycle/apply", requireAuth, guarded(async (req, res, teamId) => {
  const { from, to } = req.body ?? {};
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    res.status(400).json({ error: "from/to must be valid dates (YYYY-MM-DD)" });
    return;
  }
  if ((end.getTime() - start.getTime()) / 86400000 > 92) {
    res.status(400).json({ error: "Range too large (max ~3 months)" });
    return;
  }
  const cycle = await db.select().from(weekCyclesTable).where(eq(weekCyclesTable.teamId, teamId));
  if (cycle.length === 0) {
    res.status(400).json({ error: "No weekly cycle defined" });
    return;
  }
  const byDow = new Map(cycle.map((c) => [c.dayOfWeek, c]));
  const existingTrainings = await db
    .select({ date: trainingsTable.date })
    .from(trainingsTable)
    .where(eq(trainingsTable.teamId, teamId));
  const existingMatches = await db
    .select({ date: matchesTable.date })
    .from(matchesTable)
    .where(eq(matchesTable.teamId, teamId));
  const taken = new Set([...existingTrainings, ...existingMatches].map((r) => r.date));

  const values: any[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getDay() + 6) % 7; // JS Sunday=0 → ISO Monday=0
    const tpl = byDow.get(dow);
    if (!tpl || taken.has(iso)) continue;
    values.push({
      teamId,
      date: iso,
      time: tpl.time,
      focus: tpl.focus,
      intensity: tpl.intensity,
      durationMinutes: tpl.durationMinutes,
      drills: null,
      notes: null,
    });
  }
  const created = values.length ? await db.insert(trainingsTable).values(values).returning() : [];
  res.json({ created: created.length });
}));

// ---- Month plan (mesocycle) ----
router.get("/teams/:teamId/month-plan/:month", requireAuth, guarded(async (req, res, teamId) => {
  const month = String(req.params.month);
  const [plan] = await db
    .select()
    .from(monthPlansTable)
    .where(and(eq(monthPlansTable.teamId, teamId), eq(monthPlansTable.month, month)));
  res.json(plan ?? null);
}));

router.put("/teams/:teamId/month-plan/:month", requireAuth, guarded(async (req, res, teamId) => {
  const month = String(req.params.month);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "month must be YYYY-MM" });
    return;
  }
  const { goal, notes } = req.body ?? {};
  const values = {
    teamId,
    month,
    goal: typeof goal === "string" && goal.trim() ? goal.trim() : null,
    notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    updatedAt: new Date(),
  };
  const [existing] = await db
    .select({ id: monthPlansTable.id })
    .from(monthPlansTable)
    .where(and(eq(monthPlansTable.teamId, teamId), eq(monthPlansTable.month, month)));
  const [plan] = existing
    ? await db.update(monthPlansTable).set(values).where(eq(monthPlansTable.id, existing.id)).returning()
    : await db.insert(monthPlansTable).values(values).returning();
  res.json(plan);
}));

export default router;
