import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";
import { matchesTable } from "./matches";
import { playersTable } from "./players";

export const goalsTable = pgTable("goals", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  matchId: integer("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // scored, conceded
  scorerPlayerId: integer("scorer_player_id").references(() => playersTable.id, { onDelete: "set null" }),
  minute: integer("minute").notNull(),
  method: text("method").notNull(), // open_play, free_kick, header, counter_attack, cross, penalty, own_goal
  period: text("period"), // first_half, second_half, extra_time (nullable, derived from minute)
  // Free-text coach note about the goal (how it happened, who assisted, …)
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGoalSchema = createInsertSchema(goalsTable).omit({ id: true, createdAt: true });
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goalsTable.$inferSelect;
