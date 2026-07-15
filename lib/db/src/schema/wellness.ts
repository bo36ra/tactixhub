import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";
import { playersTable } from "./players";

// Daily wellness check-in (Hooper-index style): sleep quality, fatigue,
// muscle soreness (DOMS), and mood, each on a 1 (worst) - 5 (best) scale.
// One row per player per day — a second submission the same day
// overwrites the first (see the upsert in routes/wellness.ts) rather
// than creating a duplicate, since this models "how do you feel today",
// not a repeatable event like a training session.
export const wellnessEntriesTable = pgTable("wellness_entries", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  sleepQuality: integer("sleep_quality").notNull(),
  fatigue: integer("fatigue").notNull(),
  soreness: integer("soreness").notNull(),
  mood: integer("mood").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  onePerPlayerPerDay: unique().on(t.playerId, t.date),
}));

export type WellnessEntry = typeof wellnessEntriesTable.$inferSelect;
