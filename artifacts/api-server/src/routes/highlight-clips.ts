import { dbErrorMessage } from "../lib/dbError";
import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, matchHighlightClipsTable, matchesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { verifyTeamAccess } from "../lib/teamAccess";

const router = Router();

const verifyTeamOwnership = verifyTeamAccess;

// Short clips only — a few seconds up to roughly a minute. A full
// match recording belongs as a video link (YouTube/Drive/Dropbox),
// not stored inline; this cap keeps that boundary real rather than
// just a suggestion.
const MAX_FILE_BYTES = 50 * 1024 * 1024;

function mapClip(c: typeof matchHighlightClipsTable.$inferSelect, includeData: boolean) {
  return {
    id: c.id,
    matchId: c.matchId,
    title: c.title,
    category: c.category,
    playerId: c.playerId,
    fileName: c.fileName,
    fileSize: c.fileSize,
    mimeType: c.mimeType,
    createdAt: c.createdAt.toISOString(),
    ...(includeData ? { fileData: c.fileData } : {}),
  };
}

router.get("/teams/:teamId/matches/:matchId/highlight-clips", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const matchId = parseInt(req.params.matchId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(matchHighlightClipsTable)
      .where(eq(matchHighlightClipsTable.matchId, matchId))
      .orderBy(desc(matchHighlightClipsTable.createdAt));
    res.json(rows.map((c) => mapClip(c, false)));
  } catch (err) {
    req.log.error({ err }, "Failed to list highlight clips");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

router.get("/teams/:teamId/matches/:matchId/highlight-clips/:clipId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const clipId = parseInt(req.params.clipId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const [row] = await db
      .select()
      .from(matchHighlightClipsTable)
      .where(eq(matchHighlightClipsTable.id, clipId));
    if (!row) {
      res.status(404).json({ error: "Clip not found" });
      return;
    }
    res.json(mapClip(row, true));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch highlight clip");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

router.post("/teams/:teamId/matches/:matchId/highlight-clips", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const matchId = parseInt(req.params.matchId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { title, category, playerId, fileName, mimeType, fileData } = req.body ?? {};
  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (!fileName || typeof fileName !== "string" || !fileData || typeof fileData !== "string") {
    res.status(400).json({ error: "fileName and fileData are required" });
    return;
  }
  if (!mimeType || typeof mimeType !== "string" || !mimeType.startsWith("video/")) {
    res.status(400).json({ error: "A video file is required" });
    return;
  }
  const approxBytes = Math.floor((fileData.length * 3) / 4);
  if (approxBytes > MAX_FILE_BYTES) {
    res.status(413).json({ error: `Clip too large (max ${MAX_FILE_BYTES / (1024 * 1024)}MB — short highlight clips only, a full match should be a video link instead)` });
    return;
  }
  try {
    const [match] = await db
      .select({ id: matchesTable.id })
      .from(matchesTable)
      .where(and(eq(matchesTable.id, matchId), eq(matchesTable.teamId, teamId)));
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    const [row] = await db
      .insert(matchHighlightClipsTable)
      .values({
        matchId,
        title: title.trim().slice(0, 200),
        category: typeof category === "string" ? category.trim().slice(0, 100) || null : null,
        playerId: Number.isInteger(playerId) ? playerId : null,
        fileName: fileName.slice(0, 300),
        fileSize: approxBytes,
        mimeType,
        fileData,
      })
      .returning();
    res.status(201).json(mapClip(row, false));
  } catch (err) {
    req.log.error({ err }, "Failed to save highlight clip");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

router.delete("/teams/:teamId/matches/:matchId/highlight-clips/:clipId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const matchId = parseInt(req.params.matchId as string);
  const clipId = parseInt(req.params.clipId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const [row] = await db
      .delete(matchHighlightClipsTable)
      .where(and(eq(matchHighlightClipsTable.id, clipId), eq(matchHighlightClipsTable.matchId, matchId)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Clip not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete highlight clip");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

export default router;
