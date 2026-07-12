import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";
import { playersTable } from "./players";

export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  sessionType: text("session_type").notNull(), // training, match
  present: boolean("present").notNull().default(false),
  // Rich status. Training: present | late_excused | late_unexcused | absent.
  // Match day: starter | substitute | not_called.
  // `present` is kept in sync (derived) so existing stats keep working.
  status: text("status").notNull().default("present"),
  // Free-text note per record — e.g. the excuse type for an excused
  // absence or lateness ("موعد طبي", "ظرف عائلي" …).
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({ id: true, createdAt: true });
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendanceTable.$inferSelect;
