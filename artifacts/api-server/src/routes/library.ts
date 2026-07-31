import { dbErrorMessage } from "../lib/dbError";
import { Router, json } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, libraryDocumentsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// A personal library, not a team one — every route here is scoped to
// req.userId directly, no team/role check needed since nobody but the
// owning account should ever see or touch these rows.

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB — generous for a reference PDF, short of where storing it inline becomes a real problem
// Base64 adds ~33% overhead, plus JSON/title/description overhead —
// give the body parser enough headroom for a 20MB file specifically on
// this route, without raising the 1MB global default used everywhere
// else (sized for compressed player photos, and no other route needs
// more than that).
const uploadBodyParser = json({ limit: "28mb" });

function mapDoc(d: typeof libraryDocumentsTable.$inferSelect, includeData: boolean) {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    category: d.category,
    fileName: d.fileName,
    fileSize: d.fileSize,
    createdAt: d.createdAt.toISOString(),
    ...(includeData ? { fileData: d.fileData } : {}),
  };
}

// List — metadata only, not the file data (keeps the list fast/light;
// the file downloads separately when actually opened).
router.get("/library/documents", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  try {
    const rows = await db
      .select()
      .from(libraryDocumentsTable)
      .where(eq(libraryDocumentsTable.userId, userId))
      .orderBy(desc(libraryDocumentsTable.createdAt));
    res.json(rows.map((d) => mapDoc(d, false)));
  } catch (err) {
    req.log.error({ err }, "Failed to list library documents");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Fetch one, including the file data — used when actually opening/downloading it.
router.get("/library/documents/:id", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id as string);
  try {
    const [row] = await db
      .select()
      .from(libraryDocumentsTable)
      .where(and(eq(libraryDocumentsTable.id, id), eq(libraryDocumentsTable.userId, userId)));
    if (!row) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(mapDoc(row, true));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch library document");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

router.post("/library/documents", requireAuth, uploadBodyParser, async (req, res) => {
  const userId = (req as any).userId as string;
  const { title, description, category, fileName, fileData } = req.body ?? {};
  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (!fileName || typeof fileName !== "string") {
    res.status(400).json({ error: "fileName is required" });
    return;
  }
  if (!fileData || typeof fileData !== "string") {
    res.status(400).json({ error: "fileData is required" });
    return;
  }
  // Rough byte size from the base64 payload, checked before insert —
  // the body parser limit above already guards the raw request, this
  // catches an oversized file with a clearer error message.
  const approxBytes = Math.floor((fileData.length * 3) / 4);
  if (approxBytes > MAX_FILE_BYTES) {
    res.status(413).json({ error: `File too large (max ${MAX_FILE_BYTES / (1024 * 1024)}MB)` });
    return;
  }
  try {
    const [row] = await db
      .insert(libraryDocumentsTable)
      .values({
        userId,
        title: title.trim().slice(0, 300),
        description: typeof description === "string" ? description.trim().slice(0, 2000) || null : null,
        category: typeof category === "string" ? category.trim().slice(0, 100) || null : null,
        fileName: fileName.slice(0, 300),
        fileSize: approxBytes,
        fileData,
      })
      .returning();
    res.status(201).json(mapDoc(row, false));
  } catch (err) {
    req.log.error({ err }, "Failed to save library document");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

router.delete("/library/documents/:id", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id as string);
  try {
    const [row] = await db
      .delete(libraryDocumentsTable)
      .where(and(eq(libraryDocumentsTable.id, id), eq(libraryDocumentsTable.userId, userId)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete library document");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

export default router;
