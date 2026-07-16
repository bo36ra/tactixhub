import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";

// A coach's reusable exercise/drill library — the same rich shape as a
// training_blocks row (image, objectives, space, format, duration,
// explanation), but standalone: not tied to any one session. The coach
// builds this up once, then pulls exercises into any future session
// plan instead of re-drawing/re-typing them from scratch each time.
// Session plans still copy the fields into their own training_blocks
// row when inserted — the library entry is never referenced by id from
// a session, so editing or deleting a library exercise later can't
// silently change a session someone already ran.
export const exerciseLibraryTable = pgTable("exercise_library", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category").notNull().default("other"),
  objectiveOffense: text("objective_offense"),
  objectiveDefense: text("objective_defense"),
  space: text("space"),
  playersFormat: text("players_format"),
  minutes: integer("minutes"),
  explanation: text("explanation"),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ExerciseLibraryItem = typeof exerciseLibraryTable.$inferSelect;
