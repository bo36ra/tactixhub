import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db, notificationsTable, teamMembersTable } from "@workspace/db";
import { logger } from "./logger";

export interface NotifyPayload {
  type: string; // note_created | added_to_team | member_joined | role_changed
  meta?: Record<string, string | number | null>;
  link?: string;
}

// Insert one notification row for a single user. Never throws — a failed
// notification must not fail the action that triggered it.
export async function notifyUser(userId: string, teamId: number | null, payload: NotifyPayload) {
  try {
    await db.insert(notificationsTable).values({
      userId,
      teamId,
      type: payload.type,
      meta: payload.meta ? JSON.stringify(payload.meta) : null,
      link: payload.link ?? null,
    });
  } catch (err) {
    logger.warn({ err, userId, type: payload.type }, "Failed to insert notification");
  }
}

// Fan out to every active member of a team except the actor themselves.
export async function notifyTeamMembers(
  teamId: number,
  exceptUserId: string,
  payload: NotifyPayload,
) {
  try {
    const members = await db
      .select({ userId: teamMembersTable.userId })
      .from(teamMembersTable)
      .where(
        and(
          eq(teamMembersTable.teamId, teamId),
          eq(teamMembersTable.status, "active"),
          isNotNull(teamMembersTable.userId),
          ne(teamMembersTable.userId, exceptUserId),
        ),
      );
    if (members.length === 0) return;
    await db.insert(notificationsTable).values(
      members.map((m) => ({
        userId: m.userId!,
        teamId,
        type: payload.type,
        meta: payload.meta ? JSON.stringify(payload.meta) : null,
        link: payload.link ?? null,
      })),
    );
  } catch (err) {
    logger.warn({ err, teamId, type: payload.type }, "Failed to fan out notifications");
  }
}
