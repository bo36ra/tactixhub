import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A personal reference library — scoped to userId, not teamId, since
// it's the individual coach's own collection, not shared with the
// rest of the coaching staff (unlike everything else in this schema,
// which is team-wide by design).
//
// fileData is the PDF itself, base64-encoded, stored inline — same
// pattern already used for player photos elsewhere in this schema.
// That's fine at the size a personal reference library actually needs
// (a coach's own handful of guides/manuals), capped server-side well
// short of where storing large binaries in a text column would
// actually become a real problem.
export const libraryDocumentsTable = pgTable("library_documents", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"), // endurance, speed, speed_endurance, strength, tactical, general, ...
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(), // bytes, of the original file (pre-base64)
  fileData: text("file_data").notNull(), // base64
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLibraryDocumentSchema = createInsertSchema(libraryDocumentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLibraryDocument = z.infer<typeof insertLibraryDocumentSchema>;
export type LibraryDocument = typeof libraryDocumentsTable.$inferSelect;
