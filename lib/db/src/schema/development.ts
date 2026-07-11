import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";
import { playersTable } from "./players";
import { matchesTable } from "./matches";

export const trainingsTable = pgTable("trainings", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  time: text("time"),
  focus: text("focus").notNull(), // e.g. tactics / fitness / finishing
  drills: text("drills"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const injuriesTable = pgTable("injuries", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  date: text("date").notNull(),
  expectedReturn: text("expected_return"),
  status: text("status").notNull().default("out"), // out | recovering | recovered
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ratingsTable = pgTable("ratings", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  matchId: integer("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(), // 1..10
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
