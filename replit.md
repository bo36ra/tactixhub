# Coach Planner

A bilingual (Arabic/English) football team management web app for coaches. Manage your squad's players, attendance, matches, goals, disciplinary cards, and playing time — all in one place with full RTL/LTR language switching.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/coach-planner run dev` — run the frontend (port assigned via env)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` — auto-provisioned by Clerk

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS v4, shadcn/ui, wouter, TanStack Query
- Auth: Clerk (Replit-managed, email/password)
- API: Express 5 + Clerk Express middleware
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- i18n: custom LanguageContext (React context, localStorage persistence)
- Fonts: Inter (English/LTR) + Tajawal (Arabic/RTL)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all API contracts)
- `lib/db/src/schema/` — Drizzle schema (teams, players, matches, attendance, goals, cards, playing-time)
- `artifacts/api-server/src/routes/` — Express route handlers per domain
- `artifacts/api-server/src/middlewares/requireAuth.ts` — Clerk auth middleware
- `artifacts/coach-planner/src/` — React frontend
- `artifacts/coach-planner/src/lib/i18n.tsx` — Language context + all translation keys (AR/EN)
- `artifacts/coach-planner/src/pages/` — 7 app pages + landing

## Architecture decisions

- **Bilingual RTL/LTR**: Language stored in localStorage, applied to `document.documentElement.dir` and `lang` on change. All text goes through the `useLanguage()` hook — no hardcoded strings in components.
- **Team ownership scoping**: Every API route verifies the team belongs to the authenticated user via `verifyTeamOwnership()` before any query.
- **Clerk cookie auth**: Browser uses session cookies; no Bearer token handling needed in frontend API calls.
- **OpenAPI-first**: All API contracts defined in `openapi.yaml` → codegen → typed React Query hooks + Zod schemas.
- **DB cascade deletes**: All child tables cascade delete from `teams`, so deleting a team cleans up all related data.

## Product

7 pages accessible after sign-in:
- **Dashboard** — squad stats, recent matches, top scorers, card warnings
- **Players** — roster management with jersey number, position, age, status
- **Attendance** — session recording (training/match) with per-player present/absent toggle + summary stats
- **Matches** — match log with score, result pills, type (league/friendly/cup)
- **Goals** — top scorers table + goals conceded log + goal entry modal
- **Cards** — disciplinary card tracking with caution/warning/suspended status
- **Playing Time** — minutes per match, participation % progress bars

## User preferences

_Populate as you build._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml` — it regenerates both the React Query hooks and Zod server schemas.
- After codegen, run `pnpm run typecheck:libs` before checking artifact typechecks.
- `req.params` in Express 5 is typed as `string | string[]` — always cast: `req.params.teamId as string`.
- Clerk `pk_test` keys in dev console are expected and normal.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `clerk-auth` skill for auth customization
