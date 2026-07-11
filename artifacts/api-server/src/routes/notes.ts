import { dbErrorMessage } from "../lib/dbError";
import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notesTable, teamMembersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getTeamRole, verifyTeamAccess } from "../lib/teamAccess";
import { getClerkUserInfo } from "../lib/clerkUsers";
import { notifyTeamMembers } from "../lib/notify";

const router = Router();

// Resolve the display name to stamp on a note: prefer the member row's
// displayName (which the owner may have set on invite), fall back to Clerk.
async function resolveAuthorName(userId: string, teamId: number): Promise<string> {
  const [member] = await db
    .select({ displayName: teamMembersTable.displayName })
    .from(teamMembersTable)
    .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.userId, userId)));
  if (member?.displayName) return member.displayName;
  const { displayName, email } = await getClerkUserInfo(userId);
  return displayName ?? email ?? "Coach";
}

// List notes — pinned first, then newest
router.get("/teams/:teamId/notes", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamAccess(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const notes = await db
      .select()
      .from(notesTable)
      .where(eq(notesTable.teamId, teamId))
      .orderBy(desc(notesTable.pinned), desc(notesTable.createdAt));
    res.json(notes.map(mapNote));
  } catch (err) {
    req.log.error({ err }, "Failed to list notes");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Create note — any member; the rest of the staff gets notified
router.post("/teams/:teamId/notes", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const { title, content, pinned } = req.body ?? {};
  if (!(await verifyTeamAccess(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  try {
    const authorName = await resolveAuthorName(userId, teamId);
    const [note] = await db
      .insert(notesTable)
      .values({
        teamId,
        authorUserId: userId,
        authorName,
        title: title?.trim() || null,
        content: content.trim(),
        pinned: !!pinned,
      })
      .returning();

    await notifyTeamMembers(teamId, userId, {
      type: "note_created",
      meta: { actorName: authorName, noteTitle: note.title ?? "" },
      link: "/notes",
    });

    res.status(201).json(mapNote(note));
  } catch (err) {
    req.log.error({ err }, "Failed to create note");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Update note — the author or the team owner
router.patch("/teams/:teamId/notes/:noteId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const noteId = parseInt(req.params.noteId as string);
  const { title, content, pinned } = req.body ?? {};
  try {
    const role = await getTeamRole(userId, teamId);
    if (!role) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const [note] = await db
      .select()
      .from(notesTable)
      .where(and(eq(notesTable.id, noteId), eq(notesTable.teamId, teamId)));
    if (!note) {
      res.status(404).json({ error: "Note not found" });
      return;
    }
    if (note.authorUserId !== userId && role !== "owner") {
      res.status(403).json({ error: "Only the author or the team owner can edit this note" });
      return;
    }
    const [updated] = await db
      .update(notesTable)
      .set({
        ...(title !== undefined && { title: title?.trim() || null }),
        ...(content !== undefined && { content: String(content).trim() }),
        ...(pinned !== undefined && { pinned: !!pinned }),
        updatedAt: new Date(),
      })
      .where(eq(notesTable.id, noteId))
      .returning();
    res.json(mapNote(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update note");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Delete note — the author or the team owner
router.delete("/teams/:teamId/notes/:noteId", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  const noteId = parseInt(req.params.noteId as string);
  try {
    const role = await getTeamRole(userId, teamId);
    if (!role) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const [note] = await db
      .select()
      .from(notesTable)
      .where(and(eq(notesTable.id, noteId), eq(notesTable.teamId, teamId)));
    if (!note) {
      res.status(404).json({ error: "Note not found" });
      return;
    }
    if (note.authorUserId !== userId && role !== "owner") {
      res.status(403).json({ error: "Only the author or the team owner can delete this note" });
      return;
    }
    await db.delete(notesTable).where(eq(notesTable.id, noteId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete note");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

function mapNote(n: typeof notesTable.$inferSelect) {
  return {
    id: n.id,
    teamId: n.teamId,
    authorUserId: n.authorUserId,
    authorName: n.authorName,
    title: n.title,
    content: n.content,
    pinned: n.pinned,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

export default router;
