import { pgTable, serial, integer, text, real, timestamp, unique } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";
import { playersTable } from "./players";

// One body-weight reading per player per day — same "daily check-in,
// re-submitting overwrites" model as wellness_entries, since this
// tracks a trend over time rather than logging a repeatable event.
export const bodyWeightEntriesTable = pgTable("body_weight_entries", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  weightKg: real("weight_kg").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  onePerPlayerPerDay: unique().on(t.playerId, t.date),
}));

export type BodyWeightEntry = typeof bodyWeightEntriesTable.$inferSelect;

// A tested one-rep-max for a given lift on a given day. One row per
// player+lift+day (a batch re-save of the same lift/date upserts,
// correcting a mistake, rather than piling up duplicates) — but a
// player can test the same lift again on a *different* day, and both
// records stay. This is a progression log (every test is a data
// point), not a single current value, so a coach can see "squat 1RM:
// 80kg in Jan, 95kg in July" rather than only the latest number.
export const oneRepMaxEntriesTable = pgTable("one_rep_max_entries", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  lift: text("lift").notNull(), // preset key (back_squat, bench_press, ...) or free text for a custom lift
  date: text("date").notNull(), // YYYY-MM-DD
  weightKg: real("weight_kg").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  onePerPlayerPerLiftPerDay: unique().on(t.playerId, t.lift, t.date),
}));

export type OneRepMaxEntry = typeof oneRepMaxEntriesTable.$inferSelect;
