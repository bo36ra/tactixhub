import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";
import { matchesTable } from "./matches";
import { playersTable } from "./players";

export const playingTimeTable = pgTable("playing_time", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  matchId: integer("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  minutes: integer("minutes").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPlayingTimeSchema = createInsertSchema(playingTimeTable).omit({ id: true, createdAt: true });
export type InsertPlayingTime = z.infer<typeof insertPlayingTimeSchema>;
export type PlayingTime = typeof playingTimeTable.$inferSelect;
