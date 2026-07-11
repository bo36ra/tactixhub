import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// The database recently moved to Neon over the HTTP driver. A brand-new Neon
// database has no tables, and `drizzle-kit push` was only ever run against
// the old database — so every insert/select 500'd with "relation does not
// exist". This creates the full schema idempotently at boot (CREATE TABLE IF
// NOT EXISTS mirrors lib/db/src/schema exactly), so a fresh database
// self-provisions with zero manual steps.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "teams" (
    "id" serial PRIMARY KEY,
    "name" text NOT NULL,
    "age_group" text,
    "season" text,
    "user_id" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "players" (
    "id" serial PRIMARY KEY,
    "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "jersey_number" integer NOT NULL,
    "position" text NOT NULL,
    "age" integer,
    "nationality" text,
    "status" text NOT NULL DEFAULT 'active',
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "matches" (
    "id" serial PRIMARY KEY,
    "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
    "opponent" text NOT NULL,
    "date" text NOT NULL,
    "type" text NOT NULL,
    "formation" text NOT NULL DEFAULT '4-3-3',
    "our_goals" integer NOT NULL DEFAULT 0,
    "their_goals" integer NOT NULL DEFAULT 0,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "attendance" (
    "id" serial PRIMARY KEY,
    "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
    "player_id" integer NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
    "date" text NOT NULL,
    "session_type" text NOT NULL,
    "present" boolean NOT NULL DEFAULT false,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "goals" (
    "id" serial PRIMARY KEY,
    "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
    "match_id" integer NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
    "type" text NOT NULL,
    "scorer_player_id" integer REFERENCES "players"("id") ON DELETE SET NULL,
    "minute" integer NOT NULL,
    "method" text NOT NULL,
    "period" text,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "cards" (
    "id" serial PRIMARY KEY,
    "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
    "match_id" integer NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
    "player_id" integer NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
    "card_type" text NOT NULL,
    "minute" integer NOT NULL,
    "period" text,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "playing_time" (
    "id" serial PRIMARY KEY,
    "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
    "match_id" integer NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
    "player_id" integer NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
    "minutes" integer NOT NULL DEFAULT 0,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "tactics" (
    "id" serial PRIMARY KEY,
    "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "kind" text NOT NULL DEFAULT 'general',
    "match_id" integer REFERENCES "matches"("id") ON DELETE SET NULL,
    "data" text NOT NULL DEFAULT '{}',
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "opponent_notes" (
    "id" serial PRIMARY KEY,
    "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
    "opponent" text NOT NULL,
    "strengths" text,
    "weaknesses" text,
    "plan" text,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "lineup_entries" (
    "id" serial PRIMARY KEY,
    "match_id" integer NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
    "player_id" integer NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
    "slot_index" integer,
    "is_captain" boolean NOT NULL DEFAULT false,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "trainings" (
    "id" serial PRIMARY KEY,
    "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
    "date" text NOT NULL, "time" text, "focus" text NOT NULL,
    "drills" text, "notes" text,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "injuries" (
    "id" serial PRIMARY KEY,
    "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
    "player_id" integer NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
    "type" text NOT NULL, "date" text NOT NULL, "expected_return" text,
    "status" text NOT NULL DEFAULT 'out', "notes" text,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "ratings" (
    "id" serial PRIMARY KEY,
    "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
    "match_id" integer NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
    "player_id" integer NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
    "rating" integer NOT NULL, "note" text,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'present'`,
  `ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "note" text`,
  `ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "photo" text`,
  `ALTER TABLE "trainings" ADD COLUMN IF NOT EXISTS "intensity" text`,
  `ALTER TABLE "trainings" ADD COLUMN IF NOT EXISTS "duration_minutes" integer`,
  // Legacy rows only had a boolean; new writes always set both fields
  // consistently, so present=false with status='present' can only be a
  // pre-status row. Idempotent.
  `UPDATE "attendance" SET "status" = 'absent' WHERE "present" = false AND "status" = 'present'`,
  `CREATE TABLE IF NOT EXISTS "team_members" (
    "id" serial PRIMARY KEY,
    "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
    "user_id" text,
    "email" text,
    "display_name" text,
    "role" text NOT NULL DEFAULT 'assistant',
    "status" text NOT NULL DEFAULT 'pending',
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  // One active membership per user per team; pending invites (user_id null)
  // are excluded from the constraint.
  `CREATE UNIQUE INDEX IF NOT EXISTS "team_members_team_user_uq"
    ON "team_members" ("team_id", "user_id") WHERE "user_id" IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "notes" (
    "id" serial PRIMARY KEY,
    "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
    "author_user_id" text NOT NULL,
    "author_name" text NOT NULL,
    "title" text,
    "content" text NOT NULL,
    "pinned" boolean NOT NULL DEFAULT false,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "notifications" (
    "id" serial PRIMARY KEY,
    "user_id" text NOT NULL,
    "team_id" integer REFERENCES "teams"("id") ON DELETE CASCADE,
    "type" text NOT NULL,
    "meta" text,
    "link" text,
    "read" boolean NOT NULL DEFAULT false,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" ("user_id", "read")`,
  // Backfill: every team created before team_members existed gets its
  // legacy owner (teams.user_id) as an active 'owner' member. Idempotent.
  `INSERT INTO "team_members" ("team_id", "user_id", "role", "status")
    SELECT t."id", t."user_id", 'owner', 'active' FROM "teams" t
    WHERE NOT EXISTS (
      SELECT 1 FROM "team_members" m
      WHERE m."team_id" = t."id" AND m."user_id" = t."user_id"
    )`,
];

export async function ensureSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    await db.execute(sql.raw(statement));
  }
  logger.info("Database schema ensured (all tables exist)");
}
