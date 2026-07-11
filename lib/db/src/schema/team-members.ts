import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";

// Staff membership: one row per person per team. Members are invited by
// email; the row starts as a pending invite (userId null) and becomes
// active the first time that email signs in and loads their teams.
export const TEAM_ROLES = [
  "owner",
  "technical_director",
  "coach",
  "assistant",
  "fitness_coach",
  "admin",
  "analyst",
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const teamMembersTable = pgTable("team_members", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teamsTable.id, { onDelete: "cascade" }),
  // Clerk user id — null while the invite is still pending
  userId: text("user_id"),
  // Invite email (lowercased). Also kept for active members for display.
  email: text("email"),
  displayName: text("display_name"),
  role: text("role").notNull().default("assistant"),
  status: text("status").notNull().default("pending"), // pending | active
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamMemberSchema = createInsertSchema(teamMembersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembersTable.$inferSelect;
