import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";
import { matchesTable } from "./matches";

// Saved tactical boards. `kind` distinguishes the three tactical artifacts
// that share the same board format: general tactics, set pieces (corners /
// free kicks), and per-match plans (optionally linked to a match).
export const tacticsTable = pgTable("tactics", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("general"),
  matchId: integer("match_id").references(() => matchesTable.id, { onDelete: "set null" }),
  // JSON string: { markers: [{id,x,y,label,side}], arrows: [{x1,y1,x2,y2}], notes: string }
  data: text("data").notNull().default("{}"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const opponentNotesTable = pgTable("opponent_notes", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  opponent: text("opponent").notNull(),
  strengths: text("strengths"),
  weaknesses: text("weaknesses"),
  plan: text("plan"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
