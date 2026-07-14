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
  intensity: text("intensity"), // light | medium | high — for load management
  durationMinutes: integer("duration_minutes"),
  drills: text("drills"),
  notes: text("notes"),
  // Detailed session-plan header (optional — a coach can fill a training
  // as a quick one-liner, or expand it into a full printable session
  // sheet like the paper templates clubs use: place, headcount, main
  // objectives, and free labels for meso/microcycle bookkeeping).
  place: text("place"),
  playersTotal: integer("players_total"),
  playersUnavailable: integer("players_unavailable"),
  material: text("material"),
  mainObjectiveOffense: text("main_objective_offense"),
  mainObjectiveDefense: text("main_objective_defense"),
  complementaryObjective: text("complementary_objective"),
  mesocycleLabel: text("mesocycle_label"),
  microcycleLabel: text("microcycle_label"),
  planNumber: text("plan_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Ordered exercise blocks within a training's detailed session plan —
// mirrors the "Image / Exercise / V.E / V.T.A" table coaches fill on
// paper: each block has its own space, player count, duration, and a
// diagram image, and the UI derives the running (V.T.A) cumulative time.
export const trainingBlocksTable = pgTable("training_blocks", {
  id: serial("id").primaryKey(),
  trainingId: integer("training_id").notNull().references(() => trainingsTable.id, { onDelete: "cascade" }),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  title: text("title").notNull(),
  objectiveOffense: text("objective_offense"),
  objectiveDefense: text("objective_defense"),
  space: text("space"), // free text, e.g. "20x20" or "70x68"
  playersFormat: text("players_format"), // free text, e.g. "gk+11x11+gk"
  minutes: integer("minutes"),
  explanation: text("explanation"),
  image: text("image"), // compressed data URL, same pattern as player photos
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
