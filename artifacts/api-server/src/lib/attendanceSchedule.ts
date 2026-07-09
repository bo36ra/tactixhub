import { eq } from "drizzle-orm";
import { db, attendanceTable, playersTable } from "@workspace/db";

export interface AttendanceScheduleEntry {
  date: string;
  sessionType: string;
  totalPlayers: number;
  presentCount: number;
  absentCount: number;
  attendanceRate: number;
  presentPlayerNames: string[];
  absentPlayerNames: string[];
}

/**
 * Connects two things that live separately in the database:
 *   - attendanceTable: one row per (player, date, sessionType)
 *   - playersTable: player id -> name
 *
 * and turns them into a day-by-day schedule: for every training/match day
 * that ever had attendance taken, who showed up and who didn't — instead
 * of the per-player totals that /attendance/summary returns.
 *
 * This is the "single source of truth" for the Reports > Schedule tab.
 *
 * @param daysBack optional window — only include days within the last N
 *   days (based on today's date). Omit to return the full history.
 */
export async function buildAttendanceSchedule(
  teamId: number,
  daysBack?: number,
): Promise<AttendanceScheduleEntry[]> {
  const [records, players] = await Promise.all([
    db.select().from(attendanceTable).where(eq(attendanceTable.teamId, teamId)),
    db.select().from(playersTable).where(eq(playersTable.teamId, teamId)),
  ]);

  const cutoff = daysBack
    ? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;
  const filteredRecords = cutoff ? records.filter((r) => r.date >= cutoff) : records;

  const playerNameById = new Map(players.map((p) => [p.id, p.name] as const));

  // Group raw rows by (date, sessionType)
  const groups = new Map<string, typeof records>();
  for (const record of filteredRecords) {
    const key = `${record.date}__${record.sessionType}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  const schedule: AttendanceScheduleEntry[] = Array.from(groups.entries()).map(([key, group]) => {
    const [date, sessionType] = key.split("__");
    const present = group.filter((r) => r.present);
    const absent = group.filter((r) => !r.present);
    const total = group.length;

    return {
      date,
      sessionType,
      totalPlayers: total,
      presentCount: present.length,
      absentCount: absent.length,
      attendanceRate: total > 0 ? Math.round((present.length / total) * 1000) / 10 : 0,
      presentPlayerNames: present.map((r) => playerNameById.get(r.playerId) ?? "—"),
      absentPlayerNames: absent.map((r) => playerNameById.get(r.playerId) ?? "—"),
    };
  });

  // Oldest -> newest, so a printed report reads like a season timeline
  schedule.sort((a, b) => a.date.localeCompare(b.date));
  return schedule;
}
