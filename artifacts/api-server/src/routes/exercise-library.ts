import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, exerciseLibraryTable } from "@workspace/db";
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
      req.log.error({ err }, "exercise library route failed");
      res.status(500).json({ error: dbErrorMessage(err) });
    }
  };
}

const CATEGORIES = ["warm_up", "possession", "finishing", "defending", "set_piece", "conditioning", "small_sided_game", "cool_down", "other"];
const MAX_IMAGE_LENGTH = 900_000;

function sanitizeImage(image: unknown): string | null {
  if (typeof image !== "string" || !image) return null;
  if (!image.startsWith("data:image/") || image.length > MAX_IMAGE_LENGTH) return null;
  return image;
}
function cleanMinutes(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 300) : null;
}

router.get("/teams/:teamId/exercise-library", requireAuth, guarded(async (_req, res, teamId) => {
  const rows = await db
    .select()
    .from(exerciseLibraryTable)
    .where(eq(exerciseLibraryTable.teamId, teamId))
    .orderBy(exerciseLibraryTable.createdAt);
  res.json(rows);
}));

router.post("/teams/:teamId/exercise-library", requireAuth, guarded(async (req, res, teamId) => {
  const { title, category, objectiveOffense, objectiveDefense, space, playersFormat, minutes, explanation, image } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const [row] = await db
    .insert(exerciseLibraryTable)
    .values({
      teamId,
      title: title.trim(),
      category: CATEGORIES.includes(category) ? category : "other",
      objectiveOffense: typeof objectiveOffense === "string" && objectiveOffense.trim() ? objectiveOffense.trim() : null,
      objectiveDefense: typeof objectiveDefense === "string" && objectiveDefense.trim() ? objectiveDefense.trim() : null,
      space: typeof space === "string" && space.trim() ? space.trim() : null,
      playersFormat: typeof playersFormat === "string" && playersFormat.trim() ? playersFormat.trim() : null,
      minutes: cleanMinutes(minutes),
      explanation: typeof explanation === "string" && explanation.trim() ? explanation.trim() : null,
      image: sanitizeImage(image),
    })
    .returning();
  res.status(201).json(row);
}));

router.patch("/teams/:teamId/exercise-library/:id", requireAuth, guarded(async (req, res, teamId) => {
  const id = parseInt(req.params.id as string);
  const { title, category, objectiveOffense, objectiveDefense, space, playersFormat, minutes, explanation, image } = req.body ?? {};
  const [row] = await db
    .update(exerciseLibraryTable)
    .set({
      ...(typeof title === "string" && title.trim() && { title: title.trim() }),
      ...(CATEGORIES.includes(category) && { category }),
      ...(objectiveOffense !== undefined && { objectiveOffense: typeof objectiveOffense === "string" && objectiveOffense.trim() ? objectiveOffense.trim() : null }),
      ...(objectiveDefense !== undefined && { objectiveDefense: typeof objectiveDefense === "string" && objectiveDefense.trim() ? objectiveDefense.trim() : null }),
      ...(space !== undefined && { space: typeof space === "string" && space.trim() ? space.trim() : null }),
      ...(playersFormat !== undefined && { playersFormat: typeof playersFormat === "string" && playersFormat.trim() ? playersFormat.trim() : null }),
      ...(minutes !== undefined && { minutes: cleanMinutes(minutes) }),
      ...(explanation !== undefined && { explanation: typeof explanation === "string" && explanation.trim() ? explanation.trim() : null }),
      ...(image !== undefined && { image: sanitizeImage(image) }),
    })
    .where(and(eq(exerciseLibraryTable.id, id), eq(exerciseLibraryTable.teamId, teamId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }
  res.json(row);
}));

router.delete("/teams/:teamId/exercise-library/:id", requireAuth, guarded(async (req, res, teamId) => {
  const id = parseInt(req.params.id as string);
  const [row] = await db
    .delete(exerciseLibraryTable)
    .where(and(eq(exerciseLibraryTable.id, id), eq(exerciseLibraryTable.teamId, teamId)))
    .returning({ id: exerciseLibraryTable.id });
  if (!row) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }
  res.status(204).end();
}));

export default router;
