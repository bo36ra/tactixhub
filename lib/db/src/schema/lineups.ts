import { pgTable, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matchesTable } from "./matches";
import { playersTable } from "./players";

// One row per player assigned to a match. slotIndex places a starter on the
// pitch (0 = goalkeeper, 1..10 = outfield slots in formation order, matching
// the frontend's formation layout definitions). slotIndex = null means the
// player is on the bench for that match.
export const lineupEntriesTable = pgTable("lineup_entries", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  slotIndex: integer("slot_index"), // 0-10 for starters, null for bench
  isCaptain: boolean("is_captain").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLineupEntrySchema = createInsertSchema(lineupEntriesTable).omit({ id: true, createdAt: true });
export type InsertLineupEntry = z.infer<typeof insertLineupEntrySchema>;
export type LineupEntry = typeof lineupEntriesTable.$inferSelect;
