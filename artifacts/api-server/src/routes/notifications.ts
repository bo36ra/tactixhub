import { dbErrorMessage } from "../lib/dbError";
import { Router } from "express";
import { eq, and, desc, count } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// List the current user's notifications, newest first (capped at 50)
router.get("/notifications", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  try {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50);
    res.json(rows.map(mapNotification));
  } catch (err) {
    req.log.error({ err }, "Failed to list notifications");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Lightweight unread counter — polled by the bell in the app header
router.get("/notifications/unread-count", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  try {
    const [row] = await db
      .select({ value: count() })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.read, false)));
    res.json({ count: row?.value ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to count unread notifications");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Mark everything read (opening the bell dropdown)
router.post("/notifications/mark-all-read", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.read, false)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to mark notifications read");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Mark a single notification read
router.post("/notifications/:notificationId/read", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const notificationId = parseInt(req.params.notificationId as string);
  try {
    const [updated] = await db
      .update(notificationsTable)
      .set({ read: true })
      .where(
        and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, userId)),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json(mapNotification(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to mark notification read");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

function mapNotification(n: typeof notificationsTable.$inferSelect) {
  return {
    id: n.id,
    teamId: n.teamId,
    type: n.type,
    meta: n.meta,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

export default router;
