import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";

// Periodization support.
// week_cycles = the microcycle: one row per weekday describing the team's
// training rhythm for a specific month (focus/intensity/duration, or
// absent = rest day). Each month has its own cycle rather than one
// fixed pattern for the whole team — a pre-season week looks nothing
// like a mid-season one. `month` is nullable purely for the rows that
// existed before this column did: those act as a fallback default for
// any month that hasn't been given its own cycle yet, so nothing a
// coach already configured just disappears — every explicit save from
// here on always writes a real month value.
export const weekCyclesTable = pgTable("week_cycles", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teamsTable.id, { onDelete: "cascade" }),
  month: text("month"), // YYYY-MM, null = legacy fallback default
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
