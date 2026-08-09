import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matchesTable } from "./matches";
import { playersTable } from "./players";

// Short highlight clips a coach uploads directly (a few seconds to
// roughly a minute), stored inline the same way library PDFs are —
// fine at this size, but deliberately NOT how a full match recording
// is handled (that stays a link to YouTube/Drive/Dropbox — a 90-minute
// video is two to three orders of magnitude bigger than what storing
// inline can reasonably support, in the same way the video-link
// feature already draws that line).
export const matchHighlightClipsTable = pgTable("match_highlight_clips", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category"), // attacking, defensive, set_piece, individual, general
  playerId: integer("player_id").references(() => playersTable.id, { onDelete: "set null" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(), // bytes, of the original file (pre-base64)
  mimeType: text("mime_type").notNull(),
  fileData: text("file_data").notNull(), // base64
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMatchHighlightClipSchema = createInsertSchema(matchHighlightClipsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMatchHighlightClip = z.infer<typeof insertMatchHighlightClipSchema>;
export type MatchHighlightClip = typeof matchHighlightClipsTable.$inferSelect;
