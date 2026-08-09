import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matchesTable } from "./matches";
import { playersTable } from "./players";

// Manually-marked moments within a match's video — "the 23rd minute had
// a good press, tag it" — not automatic detection of anything. A coach
// adds these while reviewing footage (or ahead of time from memory) so
// specific moments can be jumped back to directly instead of scrubbing
// through the whole match again.
export const matchVideoTagsTable = pgTable("match_video_tags", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  timestampSeconds: integer("timestamp_seconds").notNull(),
  label: text("label").notNull(),
  category: text("category"), // attacking, defensive, set_piece, individual, general
  playerId: integer("player_id").references(() => playersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMatchVideoTagSchema = createInsertSchema(matchVideoTagsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMatchVideoTag = z.infer<typeof insertMatchVideoTagSchema>;
export type MatchVideoTag = typeof matchVideoTagsTable.$inferSelect;
