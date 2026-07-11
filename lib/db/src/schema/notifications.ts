import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";

// In-app notifications. One row per recipient. The message itself is NOT
// stored as prose — the app is bilingual, so we store a `type` plus a JSON
// `meta` payload (actor name, team name, note title, …) and the frontend
// renders the localized sentence from those parts.
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  // Clerk user id of the recipient
  userId: text("user_id").notNull(),
  teamId: integer("team_id").references(() => teamsTable.id, { onDelete: "cascade" }),
  // note_created | added_to_team | member_joined | role_changed
  type: text("type").notNull(),
  // JSON string with interpolation values for the localized message
  meta: text("meta"),
  // In-app route to open when the notification is clicked
  link: text("link"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
