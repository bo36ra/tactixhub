import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";
import { matchesTable } from "./matches";

// Pre-match plan: scouting notes about the opponent plus the coach's
// instructions. One plan per match; resurfaces automatically in the
// head-to-head view the next time the same opponent comes around.
export const matchPlansTable = pgTable("match_plans", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teamsTable.id, { onDelete: "cascade" }),
  matchId: integer("match_id")
    .notNull()
    .references(() => matchesTable.id, { onDelete: "cascade" })
    .unique(),
  opponentNotes: text("opponent_notes"),
  instructions: text("instructions"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MatchPlan = typeof matchPlansTable.$inferSelect;
