import { pgTable, serial, integer, boolean, timestamp, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matchesTable } from "./matches";
import { playersTable } from "./players";

// One row per player assigned to a match. slotIndex places a starter on the
// pitch (0 = goalkeeper, 1..10 = outfield slots in formation order, matching
// the frontend's formation layout definitions). slotIndex = null means the
// player is on the bench for that match.
//
// playerId is nullable to support a "guest" entry — a player who isn't in
// the team's roster at all, e.g. someone temporarily promoted up from a
// younger age group just for matchday. Which specific player that is
// typically changes every match, so permanently registering them in the
// roster just to assign a single lineup slot would be more overhead than
// it's worth; guestName/guestJerseyNumber stand in for the real player
// fields instead. Exactly one of playerId or guestName should be set —
// enforced at the application layer (see lineups.ts), not a DB constraint,
// since Drizzle doesn't have a clean way to express "at least one of these
// two columns" as a check constraint here.
export const lineupEntriesTable = pgTable("lineup_entries", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").references(() => playersTable.id, { onDelete: "cascade" }),
  guestName: text("guest_name"),
  guestJerseyNumber: integer("guest_jersey_number"),
  slotIndex: integer("slot_index"), // 0-10 for starters, null for bench
  isCaptain: boolean("is_captain").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLineupEntrySchema = createInsertSchema(lineupEntriesTable).omit({ id: true, createdAt: true });
export type InsertLineupEntry = z.infer<typeof insertLineupEntrySchema>;
export type LineupEntry = typeof lineupEntriesTable.$inferSelect;
