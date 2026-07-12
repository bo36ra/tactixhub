import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";
import { playersTable } from "./players";

// Planned absences the coach knows about in advance — travel, national
// team call-up, study/exams — so upcoming sessions can be planned around
// them. endDate null = open-ended until cleared.
export const playerAvailabilityTable = pgTable("player_availability", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teamsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // travel | national_team | study | other
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  endDate: text("end_date"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PlayerAvailability = typeof playerAvailabilityTable.$inferSelect;
