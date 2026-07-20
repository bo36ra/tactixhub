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

// A weight×reps entry for a given lift on a given day — a true 1RM
// test (reps = 1) or any working set (e.g. 80kg x 5). One row per
// player+lift+day (a batch re-save of the same lift/date upserts,
// correcting a mistake, rather than piling up duplicates) — but a
// player can test the same lift again on a *different* day, and both
// records stay. This is a progression log (every entry is a data
// point), not a single current value, so a coach can see "squat: 80kg
// x5 in Jan, 95kg x1 in July" rather than only the latest number. When
// reps > 1, the estimated 1RM (Epley formula) is computed on the fly
// in the UI rather than stored, so it always reflects the current
// formula rather than freezing a calculation at write time.
export const oneRepMaxEntriesTable = pgTable("one_rep_max_entries", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  lift: text("lift").notNull(), // preset key (back_squat, bench_press, ...) or free text for a custom lift
  date: text("date").notNull(), // YYYY-MM-DD
  weightKg: real("weight_kg").notNull(),
  reps: integer("reps").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  onePerPlayerPerLiftPerDay: unique().on(t.playerId, t.lift, t.date),
}));

export type OneRepMaxEntry = typeof oneRepMaxEntriesTable.$inferSelect;
