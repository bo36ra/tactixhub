import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";
import { playersTable } from "./players";

// Session-RPE training-load entries (Foster's method): one row per
// player per session. Session Load = durationMinutes * rpe is derived
// on read, never stored, so editing either field never leaves stale
// data around. Daily/Weekly/Monotony/Strain are all computed from these
// raw rows too — see lib/rpe.ts on the frontend.
export const rpeEntriesTable = pgTable("rpe_entries", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  sessionType: text("session_type").notNull().default("training"), // training | match | other
  durationMinutes: integer("duration_minutes").notNull(),
  rpe: integer("rpe").notNull(), // 0-10 CR-10 scale
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type RpeEntry = typeof rpeEntriesTable.$inferSelect;
