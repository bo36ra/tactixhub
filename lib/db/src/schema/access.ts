import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Gate for self-service signup: when someone with no team memberships
// hits the app, a pending row is created here automatically. The site
// owner (identified by SUPER_ADMIN_EMAILS) reviews and approves/rejects
// from /admin before that person can create their own team. Invited
// members (added by an existing team's owner) never touch this table —
// the inviting owner has already vouched for them.
export const accessRequestsTable = pgTable("access_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  email: text("email"),
  displayName: text("display_name"),
  note: text("note"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
});

export type AccessRequest = typeof accessRequestsTable.$inferSelect;
