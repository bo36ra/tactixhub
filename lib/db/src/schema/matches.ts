import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";

export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  opponent: text("opponent").notNull(),
  date: text("date").notNull(),
  type: text("type").notNull(), // league, friendly, cup
  formation: text("formation").notNull().default("4-3-3"),
  ourGoals: integer("our_goals").notNull().default(0),
  theirGoals: integer("their_goals").notNull().default(0),
  // A link to match footage (YouTube, Google Drive, or Dropbox) rather
  // than the file itself — the file storage layer here caps uploads at
  // 1MB (sized for compressed player photos), miles short of even a
  // short video clip, and a dedicated file-storage service is a much
  // bigger undertaking than this needs. Linking out to wherever the
  // coach already keeps the footage is the practical path.
  videoUrl: text("video_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMatchSchema = createInsertSchema(matchesTable).omit({ id: true, createdAt: true });
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matchesTable.$inferSelect;
