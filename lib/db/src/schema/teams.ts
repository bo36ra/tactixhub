import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const teamsTable = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ageGroup: text("age_group"),
  season: text("season"),
  userId: text("user_id").notNull(),
  // Plumbing for future paid tiers — not enforced anywhere yet. The site
  // owner can bump a team to a higher tier from /admin once a manual or
  // gateway payment lands; feature code can then gate on it via the
  // useIsPro()/FeatureGate helpers whenever a specific feature is chosen.
  tier: text("tier").notNull().default("free"),
  // 0 = Sunday ... 6 = Saturday (date-fns's own convention, matching what
  // startOfWeek/endOfWeek expect directly with no translation needed).
  // Defaults to Monday since that's what the calendar/week-cycle pages
  // were hardcoded to before this existed. Configurable because a coach's
  // week doesn't necessarily start on a fixed calendar day — it starts
  // the day after whatever day their match falls on, which shifts
  // fixture to fixture rather than landing on the same weekday every time.
  weekStartDay: integer("week_start_day").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamSchema = createInsertSchema(teamsTable).omit({ id: true, createdAt: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teamsTable.$inferSelect;
