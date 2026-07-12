import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";

// Periodization support.
// week_cycles = the microcycle: one row per weekday describing the team's
// default training rhythm (focus/intensity/duration, or absent = rest day).
export const weekCyclesTable = pgTable("week_cycles", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teamsTable.id, { onDelete: "cascade" }),
  // 0 = Monday … 6 = Sunday (ISO)
  dayOfWeek: integer("day_of_week").notNull(),
  focus: text("focus").notNull(),
  intensity: text("intensity"),
  durationMinutes: integer("duration_minutes"),
  time: text("time"),
});

// month_plans = the mesocycle: a goal + notes per calendar month.
export const monthPlansTable = pgTable("month_plans", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teamsTable.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // YYYY-MM
  goal: text("goal"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type WeekCycle = typeof weekCyclesTable.$inferSelect;
export type MonthPlan = typeof monthPlansTable.$inferSelect;
