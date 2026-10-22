# Agent instructions for ShiftSync

Read `docs/SPEC.md` first; it is the source of truth for scope, roles, data model and stack.

- Monorepo, npm workspaces: `client/` (React+Vite+TS+Tailwind), `server/` (Express+TS+Prisma+Postgres).
- Local Postgres: `postgresql://shiftsync@localhost:5433/shiftsync` (test DB `shiftsync_test`). Don't touch `.pgdata/`.
- Every DB query must be scoped by the authenticated user's `organizationId`. Never trust org/role from the client.
- Validate all request bodies/params with Zod; return errors as `{ error: { code, message, details? } }`.
- Keep domain logic (conflict detection, swap approval, attendance status) in pure functions under
  `server/src/domain/` with unit tests; route handlers stay thin.
- Use TypeScript strict mode. No `any` unless unavoidable.
- After changes run: `npm run lint`, `npm run typecheck`, `npm test` from repo root; all must pass.
- Commit in small logical commits with clear messages. Never commit `.env` or `.pgdata/`.
- Windows machine: write npm scripts that work in PowerShell (use cross-env if needed).
