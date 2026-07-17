import { dbErrorMessage } from "../lib/dbError";
import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, attendanceTable, playersTable, teamsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { verifyTeamAccess } from "../lib/teamAccess";
import { buildAttendanceSchedule } from "../lib/attendanceSchedule";

const router = Router();

// Training statuses + match-day statuses. A player who wasn't called up
// for a match is neither present nor absent — not_called rows are
// excluded from attendance-rate math entirely.
const VALID_STATUSES = [
  "present",
  "late_excused",
  "late_unexcused",
  "absent",
  "starter",
  "substitute",
  "bench",
  "not_called",
  "called_up",
  "national_duty",
  "injured",
  "excused_absence",
  "other",
];
const PRESENT_STATUSES = ["present", "late_excused", "late_unexcused", "starter", "substitute", "bench"];

// Team data is shared across the whole staff — any active member
// (owner/coach/assistant/analyst) may read and write it.
const verifyTeamOwnership = verifyTeamAccess;

router.delete("/teams/:teamId/attendance", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { date, sessionType } = req.query as { date?: string; sessionType?: string };
  if (!date || !sessionType) {
    res.status(400).json({ error: "date and sessionType query params are required" });
    return;
  }
  try {
    await db
      .delete(attendanceTable)
      .where(
        and(
          eq(attendanceTable.teamId, teamId),
          eq(attendanceTable.date, date),
          eq(attendanceTable.sessionType, sessionType),
        ),
      );
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete attendance day");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// List attendance
router.get("/teams/:teamId/attendance", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const records = await db
      .select()
      .from(attendanceTable)
      .where(eq(attendanceTable.teamId, teamId))
      .orderBy(attendanceTable.date);
    res.json(records.map(mapAttendance));
  } catch (err) {
    req.log.error({ err }, "Failed to list attendance");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Create/update attendance records for a session
router.post("/teams/:teamId/attendance", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { date, sessionType, records } = req.body;
  if (!date || !sessionType || !Array.isArray(records)) {
    res.status(400).json({ error: "date, sessionType, and records are required" });
    return;
  }
  try {
    // Delete existing records for this date+sessionType
    await db
      .delete(attendanceTable)
      .where(
        and(
          eq(attendanceTable.teamId, teamId),
          eq(attendanceTable.date, date),
          eq(attendanceTable.sessionType, sessionType),
        ),
      );

    if (records.length > 0) {
      const inserted = await db
        .insert(attendanceTable)
        .values(
          records.map((r: { playerId: number; present?: boolean; status?: string; note?: string }) => {
            // Prefer the rich status; fall back to the legacy boolean so
            // older clients keep working. `present` stays derived so all
            // existing rate calculations remain valid.
            const status =
              r.status && VALID_STATUSES.includes(r.status)
                ? r.status
                : r.present === false
                  ? "absent"
                  : "present";
            return {
              teamId,
              playerId: r.playerId,
              date,
              sessionType,
              status,
              present: PRESENT_STATUSES.includes(status),
              note: typeof r.note === "string" && r.note.trim() ? r.note.trim() : null,
            };
          }),
        )
        .returning();
      res.status(201).json(inserted.map(mapAttendance)[0]);
    } else {
      res.status(201).json({ teamId, date, sessionType, records: [] });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to create attendance");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Attendance summary per player
router.get("/teams/:teamId/attendance/summary", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const players = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.teamId, teamId));

    const summary = await Promise.all(
      players.map(async (p) => {
        const records = await db
          .select()
          .from(attendanceTable)
          .where(
            and(
              eq(attendanceTable.teamId, teamId),
              eq(attendanceTable.playerId, p.id),
            ),
          );
        const counted = records.filter((r) => r.status !== "not_called");
        const totalPresent = counted.filter((r) => r.present).length;
        const totalAbsent = counted.filter((r) => !r.present).length;
        const total = totalPresent + totalAbsent;
        const attendanceRate = total > 0 ? (totalPresent / total) * 100 : 0;
        return {
          playerId: p.id,
          playerName: p.name,
          jerseyNumber: p.jerseyNumber,
          totalPresent,
          totalAbsent,
          attendanceRate: Math.round(attendanceRate * 10) / 10,
        };
      }),
    );

    res.json(summary);
  } catch (err) {
    req.log.error({ err }, "Failed to get attendance summary");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

// Attendance schedule — every training/match day, connecting raw
// per-player rows into a day-by-day view (who was present/absent each day).
router.get("/teams/:teamId/attendance/schedule", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const teamId = parseInt(req.params.teamId as string);
  if (!(await verifyTeamOwnership(userId, teamId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const daysParam = req.query.days ? parseInt(req.query.days as string) : undefined;
    const schedule = await buildAttendanceSchedule(teamId, Number.isFinite(daysParam) ? daysParam : undefined);
    res.json(schedule);
  } catch (err) {
    req.log.error({ err }, "Failed to build attendance schedule");
    res.status(500).json({ error: dbErrorMessage(err) });
  }
});

function mapAttendance(a: typeof attendanceTable.$inferSelect) {
  return {
    id: a.id,
    teamId: a.teamId,
    playerId: a.playerId,
    date: a.date,
    sessionType: a.sessionType,
    present: a.present,
    status: a.status,
    note: a.note,
    createdAt: a.createdAt.toISOString(),
  };
}

export default router;
