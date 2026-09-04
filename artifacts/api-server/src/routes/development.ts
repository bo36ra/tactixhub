import { dbErrorMessage } from "../lib/dbError";
import { Router } from "express";
import { eq, and, desc, or, isNull, gte, lte, sql } from "drizzle-orm";
import { db, trainingsTable, injuriesTable, ratingsTable, playersTable, teamsTable, matchesTable, matchPlansTable, weekCyclesTable, monthPlansTable, playerAvailabilityTable, trainingBlocksTable } from "@workspace/db";
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
  const { date, time, focus, drills, notes, intensity, durationMinutes, mdLabel } = req.body;
  const cleanIntensity = ["very_light", "light", "medium", "high", "very_high"].includes(intensity) ? intensity : null;
  const cleanDuration =
    Number.isFinite(Number(durationMinutes)) && Number(durationMinutes) > 0
      ? Math.min(Math.round(Number(durationMinutes)), 600)
      : null;
  if (!date || !focus) { res.status(400).json({ error: "date and focus are required" }); return; }
  const [row] = await db.insert(trainingsTable)
    .values({ teamId, date, time: time || null, focus, drills: drills || null, notes: notes || null, intensity: cleanIntensity, durationMinutes: cleanDuration, mdLabel: mdLabel || null })
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
// Season-wide summary — average rating and how many times each player
// was rated, across every match, computed here in one grouped query
// rather than the frontend fetching per-match or per-player and
// averaging client-side.
router.get("/teams/:teamId/ratings/summary", requireAuth, guarded(async (_req, res, teamId) => {
  const rows = await db
    .select({
      playerId: ratingsTable.playerId,
      avgRating: sql<string>`round(avg(${ratingsTable.rating})::numeric, 2)`,
      count: sql<number>`count(*)::int`,
    })
    .from(ratingsTable)
    .where(eq(ratingsTable.teamId, teamId))
    .groupBy(ratingsTable.playerId);
  res.json(rows.map((r) => ({ playerId: r.playerId, avgRating: Number(r.avgRating), count: r.count })));
}));
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

router.patch("/teams/:teamId/trainings/:trainingId", requireAuth, guarded(async (req, res, teamId) => {
  const trainingId = parseInt(req.params.trainingId as string);
  const {
    date, time, focus, intensity, durationMinutes, drills, notes,
    place, playersTotal, playersUnavailable, material,
    mainObjectiveOffense, mainObjectiveDefense, complementaryObjective,
    mesocycleLabel, microcycleLabel, mdLabel, planNumber,
  } = req.body ?? {};
  const cleanIntensity = intensity === null ? null : ["very_light", "light", "medium", "high", "very_high"].includes(intensity) ? intensity : undefined;
  const cleanDuration =
    durationMinutes === null
      ? null
      : Number.isFinite(Number(durationMinutes)) && Number(durationMinutes) > 0
        ? Math.min(Math.round(Number(durationMinutes)), 600)
        : undefined;
  const cleanCount = (v: unknown) =>
    v === null ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : undefined;
  const [row] = await db
    .update(trainingsTable)
    .set({
      ...(typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && { date }),
      ...(time !== undefined && { time: time || null }),
      ...(typeof focus === "string" && focus && { focus }),
      ...(cleanIntensity !== undefined && { intensity: cleanIntensity }),
      ...(cleanDuration !== undefined && { durationMinutes: cleanDuration }),
      ...(drills !== undefined && { drills: drills || null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(place !== undefined && { place: place || null }),
      ...(cleanCount(playersTotal) !== undefined && { playersTotal: cleanCount(playersTotal) }),
      ...(cleanCount(playersUnavailable) !== undefined && { playersUnavailable: cleanCount(playersUnavailable) }),
      ...(material !== undefined && { material: material || null }),
      ...(mainObjectiveOffense !== undefined && { mainObjectiveOffense: mainObjectiveOffense || null }),
      ...(mainObjectiveDefense !== undefined && { mainObjectiveDefense: mainObjectiveDefense || null }),
      ...(complementaryObjective !== undefined && { complementaryObjective: complementaryObjective || null }),
      ...(mesocycleLabel !== undefined && { mesocycleLabel: mesocycleLabel || null }),
      ...(microcycleLabel !== undefined && { microcycleLabel: microcycleLabel || null }),
      ...(mdLabel !== undefined && { mdLabel: mdLabel || null }),
      ...(planNumber !== undefined && { planNumber: planNumber || null }),
    })
    .where(and(eq(trainingsTable.id, trainingId), eq(trainingsTable.teamId, teamId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Training not found" });
    return;
  }
  res.json(row);

}));

// ---- Session-plan exercise blocks ----
// Diagram images are bigger than player thumbnails (they're tactical
// sketches, not headshots) but still capped well under the body limit.
const MAX_BLOCK_IMAGE_LENGTH = 900_000;
function sanitizeBlockImage(image: unknown): string | null {
  if (typeof image !== "string" || !image) return null;
  if (!image.startsWith("data:image/") || image.length > MAX_BLOCK_IMAGE_LENGTH) return null;
  return image;
}

router.get("/teams/:teamId/trainings/:trainingId/blocks", requireAuth, guarded(async (req, res, teamId) => {
  const trainingId = parseInt(req.params.trainingId as string);
  const rows = await db
    .select()
    .from(trainingBlocksTable)
    .where(and(eq(trainingBlocksTable.trainingId, trainingId), eq(trainingBlocksTable.teamId, teamId)))
    .orderBy(trainingBlocksTable.position);
  res.json(rows);
}));

// Replace the whole ordered block list in one shot — the session-plan
// editor is one big form the coach fills and saves together, not a
// per-block API dance.
router.put("/teams/:teamId/trainings/:trainingId/blocks", requireAuth, guarded(async (req, res, teamId) => {
  const trainingId = parseInt(req.params.trainingId as string);
  const [training] = await db
    .select({ id: trainingsTable.id })
    .from(trainingsTable)
    .where(and(eq(trainingsTable.id, trainingId), eq(trainingsTable.teamId, teamId)));
  if (!training) {
    res.status(404).json({ error: "Training not found" });
    return;
  }
  const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
  const clean = blocks
    .filter((b: any) => typeof b?.title === "string" && b.title.trim())
    .slice(0, 30)
    .map((b: any, i: number) => ({
      trainingId,
      teamId,
      position: i,
      title: String(b.title).trim(),
      objectiveOffense: typeof b.objectiveOffense === "string" && b.objectiveOffense.trim() ? b.objectiveOffense.trim() : null,
      objectiveDefense: typeof b.objectiveDefense === "string" && b.objectiveDefense.trim() ? b.objectiveDefense.trim() : null,
      space: typeof b.space === "string" && b.space.trim() ? b.space.trim() : null,
      playersFormat: typeof b.playersFormat === "string" && b.playersFormat.trim() ? b.playersFormat.trim() : null,
      minutes: Number.isFinite(Number(b.minutes)) && Number(b.minutes) > 0 ? Math.min(Math.round(Number(b.minutes)), 300) : null,
      explanation: typeof b.explanation === "string" && b.explanation.trim() ? b.explanation.trim() : null,
      image: sanitizeBlockImage(b.image),
    }));
  await db.delete(trainingBlocksTable).where(and(eq(trainingBlocksTable.trainingId, trainingId), eq(trainingBlocksTable.teamId, teamId)));
  const rows = clean.length ? await db.insert(trainingBlocksTable).values(clean).returning() : [];
  res.json(rows);
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

// ---- Weekly cycle (microcycle) — one per month, not one for the whole team ----

// Shared by GET /cycle and POST /cycle/apply: the cycle actually in
// effect for a given month — that month's own explicit rows first,
// falling back to the legacy team-wide rows (month IS NULL, predating
// this column) for any weekday the month hasn't customized itself,
// then filling any day still unset with a computed match entry if the
// team has a real match on that weekday within that specific month.
async function getEffectiveCycle(teamId: number, month: string) {
  const rows = await db
    .select()
    .from(weekCyclesTable)
    .where(and(eq(weekCyclesTable.teamId, teamId), or(eq(weekCyclesTable.month, month), isNull(weekCyclesTable.month))));
  const byDow = new Map<number, typeof rows[number]>();
  for (const r of rows) {
    const existing = byDow.get(r.dayOfWeek);
    if (!existing || (existing.month === null && r.month === month)) byDow.set(r.dayOfWeek, r);
  }
  const missingDows = [0, 1, 2, 3, 4, 5, 6].filter((d) => !byDow.has(d));
  if (missingDows.length > 0) {
    const [y, m] = month.split("-").map(Number);
    const monthStart = `${month}-01`;
    const monthEnd = new Date(y, m, 0).toISOString().slice(0, 10); // last day of that month
    const monthMatches = await db
      .select()
      .from(matchesTable)
      .where(and(eq(matchesTable.teamId, teamId), gte(matchesTable.date, monthStart), lte(matchesTable.date, monthEnd)));
    const matchDows = new Set(monthMatches.map((mm) => (new Date(mm.date + "T00:00:00").getDay() + 6) % 7));
    for (const dow of missingDows) {
      if (matchDows.has(dow)) {
        byDow.set(dow, { id: -1, teamId, month, dayOfWeek: dow, focus: "match", intensity: null, durationMinutes: null, time: null });
      }
    }
  }
  return Array.from(byDow.values()).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

router.get("/teams/:teamId/cycle", requireAuth, guarded(async (req, res, teamId) => {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : defaultMonth;
  res.json(await getEffectiveCycle(teamId, month));
}));

// Replace one month's 7-day template in one shot (rest days are simply
// absent) — never touches other months' rows or the legacy fallback.
router.put("/teams/:teamId/cycle", requireAuth, guarded(async (req, res, teamId) => {
  const month = req.body?.month;
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "month (YYYY-MM) is required" });
    return;
  }
  const days = Array.isArray(req.body?.days) ? req.body.days : [];
  const clean = days
    .filter((d: any) => Number.isInteger(d?.dayOfWeek) && d.dayOfWeek >= 0 && d.dayOfWeek <= 6 && typeof d.focus === "string" && d.focus)
    .map((d: any) => ({
      teamId,
      month,
      dayOfWeek: d.dayOfWeek,
      focus: String(d.focus),
      intensity: ["very_light", "light", "medium", "high", "very_high"].includes(d.intensity) ? d.intensity : null,
      durationMinutes:
        Number.isFinite(Number(d.durationMinutes)) && Number(d.durationMinutes) > 0
          ? Math.min(Math.round(Number(d.durationMinutes)), 600)
          : null,
      time: typeof d.time === "string" && d.time ? d.time : null,
    }));
  await db.delete(weekCyclesTable).where(and(eq(weekCyclesTable.teamId, teamId), eq(weekCyclesTable.month, month)));
  const rows = clean.length ? await db.insert(weekCyclesTable).values(clean).returning() : [];
  res.json(rows);
}));

// Apply the cycle over a date range: create planned trainings on matching
// weekdays, skipping days that already have a training or a match. A
// range spanning more than one month uses each date's own month's cycle.
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
  const cyclesByMonth = new Map<string, Awaited<ReturnType<typeof getEffectiveCycle>>>();
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
    const monthKey = iso.slice(0, 7);
    if (!cyclesByMonth.has(monthKey)) cyclesByMonth.set(monthKey, await getEffectiveCycle(teamId, monthKey));
    const cycle = cyclesByMonth.get(monthKey)!;
    const dow = (d.getDay() + 6) % 7; // JS Sunday=0 → ISO Monday=0
    const tpl = cycle.find((c) => c.dayOfWeek === dow);
    if (!tpl || tpl.focus === "match" || taken.has(iso)) continue;
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

// ---- Planned player availability (travel / national team / study) ----
const AVAILABILITY_TYPES = ["travel", "national_team", "study", "other"];

router.get("/teams/:teamId/availability", requireAuth, guarded(async (_req, res, teamId) => {
  const rows = await db
    .select()
    .from(playerAvailabilityTable)
    .where(eq(playerAvailabilityTable.teamId, teamId))
    .orderBy(playerAvailabilityTable.startDate);
  res.json(rows);
}));

router.post("/teams/:teamId/availability", requireAuth, guarded(async (req, res, teamId) => {
  const { playerId, type, startDate, endDate, note } = req.body ?? {};
  if (!Number.isInteger(playerId)) {
    res.status(400).json({ error: "playerId is required" });
    return;
  }
  if (!AVAILABILITY_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${AVAILABILITY_TYPES.join(", ")}` });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate))) {
    res.status(400).json({ error: "startDate must be YYYY-MM-DD" });
    return;
  }
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) {
    res.status(400).json({ error: "endDate must be YYYY-MM-DD" });
    return;
  }
  // The player must belong to this team
  const [player] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(and(eq(playersTable.id, playerId), eq(playersTable.teamId, teamId)));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  const [row] = await db
    .insert(playerAvailabilityTable)
    .values({
      teamId,
      playerId,
      type,
      startDate,
      endDate: endDate || null,
      note: typeof note === "string" && note.trim() ? note.trim() : null,
    })
    .returning();
  res.status(201).json(row);
}));

router.delete("/teams/:teamId/availability/:availabilityId", requireAuth, guarded(async (req, res, teamId) => {
  const availabilityId = parseInt(req.params.availabilityId as string);
  await db
    .delete(playerAvailabilityTable)
    .where(and(eq(playerAvailabilityTable.id, availabilityId), eq(playerAvailabilityTable.teamId, teamId)));
  res.status(204).send();
}));

export default router;
