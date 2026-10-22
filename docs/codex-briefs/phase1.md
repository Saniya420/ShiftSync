You are building ShiftSync. Read AGENTS.md and docs/SPEC.md first. The git repo is already initialised.

PHASE 1 GOAL: a working, tested foundation covering Weeks 5–6 of the plan.

1. Scaffolding
   - npm workspaces monorepo: root package.json with scripts `dev` (runs server+client concurrently),
     `build`, `lint`, `typecheck`, `test`, `db:migrate`, `db:seed`.
   - ESLint + Prettier shared config, `.gitignore` (node_modules, dist, .env, .pgdata, coverage),
     `.env.example` files for server and client, README.md with setup steps.
2. Server (server/)
   - Express + TS, helmet, cors (credentials, CLIENT_ORIGIN env), rate limit on /auth, pino, central error handler,
     `GET /api/health` (checks DB).
   - Prisma schema implementing the full data model in SPEC.md with indexes; initial migration; seed script creating
     a demo org "Corner Mart" with 1 owner, 1 manager, 6 employees, 1 location, availability and one week of shifts.
     Write the demo logins to `server/prisma/SEED_ACCOUNTS.md` (not in code comments).
   - Auth: POST /api/auth/signup (creates Organization + OWNER), /login, /logout, GET /api/auth/me.
     bcrypt cost 12, JWT in httpOnly cookie, `requireAuth` and `requireRole(...)` middleware, tenant scoping helper.
   - Manager invites employee: POST /api/users (manager/owner) creating employee with temp password.
   - Domain module `server/src/domain/conflicts.ts`: pure function detecting the 5 conflict types in SPEC.md,
     with thorough unit tests.
   - REST endpoints: locations (CRUD), users (list/update), availability (get/put own), shifts
     (list by week+location, create, update, delete, copy-previous-week, publish week) — create/update returns
     conflict warnings (and 409 for hard overlap unless `force=true` by manager).
   - Integration tests with Supertest against shiftsync_test DB (auth flow, tenant isolation, shift CRUD + conflicts).
3. Client (client/)
   - Vite React TS + Tailwind, React Router, TanStack Query, axios with credentials, toast notifications.
   - Pages: Landing, Signup, Login, Dashboard (role-aware), Roster Builder week grid (employees × 7 days, add/edit
     shift modal, conflict badges, weekly hours & cost per employee, prev/next week, copy last week, publish),
     My Schedule (employee), Availability editor, Team (invite employee).
   - Clean, modern, responsive UI (mobile-friendly), protected routes by role.
4. Verify: run migrations, seed, lint, typecheck, and all tests; fix until green. Start the server briefly and
   hit /api/health to confirm. Commit work in logical commits.

Finish with a short summary in `docs/PROGRESS.md`: what was built, how to run it, test results, known gaps.
Do NOT implement swaps, time-off, attendance, timesheets yet (phase 2) beyond the Prisma models.
