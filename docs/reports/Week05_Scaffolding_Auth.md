# ShiftSync — Week 5 Progress Report

**Project Scaffolding & Core Authentication Layer**

| Field | Detail |
|---|---|
| Project ID | PTUT-PRJ-039 |
| Project Title | ShiftSync – Automated Employee Shift Scheduling & Attendance App |
| Track | 4. Local Commerce, SMB & Retail Operations |
| Student | Saniya |
| Roll Number | 24-ST-045 |
| Email | 24-st-045@students.ptut.edu.pk |
| Supervisor | Dr. Zaigham Mushtaq |
| Reporting Week | Week 5 of 12 |
| Repository | https://github.com/Saniya420/ShiftSync |

---

## Week 5 Summary of Work Completed

- Initialised the Git repository, published it to GitHub and enabled **branch protection** on `main`.
- Scaffolded a TypeScript **monorepo** (npm workspaces) with separate `client/` and `server/` packages and shared lint/format/type-check tooling.
- Configured **PostgreSQL** with Prisma ORM, versioned migrations and a demo seed; verified the connection through a `/api/health` endpoint.
- Implemented **secure multi-tenant authentication**: sign-up (creates an organisation + Owner), login, logout, session restore, bcrypt password hashing (cost 12) and JWT sessions in httpOnly cookies.
- Implemented **role-based authorisation** (Owner / Manager / Employee) and **tenant isolation** enforced both in the API and in the database schema.
- Wrote automated tests for the authentication flow and cross-tenant isolation; all pass.

---

## 1. Repository & Branch Protection

| Item | Configuration |
|---|---|
| Hosting | GitHub — `Saniya420/ShiftSync` (public) |
| Default branch | `main` |
| Branch protection rule on `main` | Pull request required before merging · Conversations must be resolved · Linear history required (no merge commits) · Force-pushes blocked · Branch deletion blocked |
| Workflow | Feature work on a branch (e.g. `phase-3`) → pull request → squash merge into `main` (PR #1 merged this way) |
| Secrets | `.env` files and the local database folder are git-ignored; only `.env.example` placeholders are committed |

## 2. Directory Scaffolding

```
ShiftSync/
├── package.json            # npm workspaces + root scripts (dev, build, lint, typecheck, test, smoke)
├── eslint.config.mjs       # shared ESLint (typescript-eslint, react-hooks)
├── tsconfig.base.json      # shared strict TypeScript settings
├── docs/                   # SPEC, API contract, weekly reports
├── server/                 # Node.js + Express REST API
│   ├── prisma/
│   │   ├── schema.prisma   # data model (11 entities)
│   │   ├── migrations/     # versioned SQL migrations
│   │   └── seed.ts         # "Corner Mart" demo organisation
│   ├── src/
│   │   ├── app.ts          # Express app: security middleware, routers, error handler
│   │   ├── auth.ts         # signup/login/logout/me, requireAuth, requireRole
│   │   ├── config.ts       # Zod-validated environment variables
│   │   ├── db.ts           # Prisma client + tenant() scoping helper
│   │   ├── http.ts         # AppError, central error handler, logger
│   │   ├── domain/         # pure business rules (+ unit tests)
│   │   ├── services/       # database workflows (transactions)
│   │   └── routes/         # thin REST route handlers
│   └── tests/              # Supertest integration tests (real test database)
└── client/                 # React + Vite single-page app
    └── src/
        ├── api.ts          # axios instance (cookies, /api proxy)
        ├── auth.tsx        # AuthProvider, Protected route guard
        ├── Layout.tsx      # role-aware navigation
        └── pages/          # screens (Auth, Roster, Team, ...)
```

| Tool | Purpose |
|---|---|
| TypeScript (strict) | Type safety on client and server |
| ESLint + Prettier | Consistent code style; `--max-warnings 0` |
| Vitest + Supertest | Unit and API integration tests |
| Prisma | Schema, migrations, type-safe queries |
| concurrently | `npm run dev` starts API (port 3001) and client (port 5173) together |

## 3. Database Connection Verification

- Local development uses a dedicated PostgreSQL 18 instance (port 5433) with separate `shiftsync` (development) and `shiftsync_test` (automated tests) databases.
- `npm run db:migrate` applies the Prisma migrations; `npm run db:seed` creates the demo organisation "Corner Mart" (1 owner, 1 manager, 6 employees, 1 location).
- `GET /api/health` runs a live query and returns:

```json
{ "status": "ok", "database": "connected" }
```

If the database is unreachable the endpoint returns `503 DATABASE_UNAVAILABLE`, which will be used by the production health check in Week 11.

## 4. Authentication Design

### 4.1 Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant API as Express API
    participant DB as PostgreSQL

    B->>API: POST /api/auth/signup {organizationName, name, email, password}
    API->>API: Zod validation (email format, password 12–72 bytes)
    API->>API: bcrypt.hash(password, 12)
    API->>DB: INSERT Organization + User(role=OWNER) in one transaction
    API-->>B: 201 {user} + Set-Cookie: shiftsync=<JWT>; HttpOnly; SameSite=Lax
    B->>API: GET /api/shifts (cookie sent automatically)
    API->>API: verify JWT (HS256, issuer, audience, expiry)
    API->>DB: load user WHERE organizationId = token.org AND id = token.sub AND active
    API->>API: requireRole(...) if route is restricted
    API-->>B: 200 data scoped to user's organisation
```

### 4.2 Security Controls Implemented

| Control | Implementation |
|---|---|
| Password hashing | bcrypt, cost factor **12**; plaintext never stored or logged |
| Password policy | 12–72 characters (72-byte bcrypt limit enforced explicitly) |
| Session token | JWT signed **HS256** with a ≥32-character secret; `issuer`, `audience` and **7-day** expiry verified on every request |
| Cookie | `httpOnly` (not readable by JavaScript), `SameSite=Lax`, `Secure` in production |
| Session freshness | Every request re-loads the user from the database, so deactivated users and role changes take effect immediately |
| Generic login errors | "Email or password is incorrect" — does not reveal which part was wrong |
| Brute-force protection | Auth endpoints limited to 60 requests / 15 min / IP (HTTP 429) |
| CSRF defence | `SameSite` cookie + server-side **origin check** rejecting state-changing requests from unknown origins |
| Security headers | Helmet (HSTS, X-Content-Type-Options, frame protection, etc.); `x-powered-by` disabled |
| Temporary passwords | Invited employees receive a one-time random password and **must change it on first login** before any other API access |

### 4.3 Multi-Tenancy & Role-Based Access

- Every table carries `organizationId`. The organisation always comes from the verified session token — **never from the request body**.
- A `tenant(organizationId)` helper is applied to every Prisma query.
- **Composite foreign keys** `(organizationId, id)` make cross-tenant references impossible at the database level.
- Requests for another organisation's records return **404**, so attackers cannot even confirm the record exists.
- `requireRole('OWNER', 'MANAGER')` guards management endpoints; only the Owner can promote employees to Manager.

| Role | Can do |
|---|---|
| Owner | Everything, including role changes and user management |
| Manager | Locations, team invites, rosters, approvals, attendance, timesheets |
| Employee | Own schedule, availability, time-off, swaps, clock-in/out, profile |

## 5. Endpoints Delivered This Week

| Method | Path | Access |
|---|---|---|
| GET | /api/health | Public |
| POST | /api/auth/signup | Public (rate-limited) |
| POST | /api/auth/login | Public (rate-limited) |
| POST | /api/auth/logout | Authenticated |
| GET | /api/auth/me | Authenticated |
| GET/POST/PUT/DELETE | /api/locations | Read: all · Write: Manager/Owner |
| GET/POST/PUT | /api/users | Manager/Owner |

## 6. Testing & Verification

| Test | Result |
|---|---|
| Sign-up → session cookie → `/auth/me` returns the Owner | Pass |
| Wrong password → 401 with generic message | Pass |
| Requests without a cookie → 401 `UNAUTHENTICATED` | Pass |
| Employee calling a manager endpoint → 403 `FORBIDDEN` | Pass |
| Organisation A cannot read/update Organisation B's locations, users or shifts → 404 | Pass |
| Invited employee with temporary password is forced to change it (403 `PASSWORD_CHANGE_REQUIRED`) | Pass |
| Logout clears cookie → next request 401 | Pass |
| Lint, strict type-check | 0 errors, 0 warnings |

**Manual check in the browser:** the demo manager signs in and lands on the role-aware dashboard; the employee account sees only employee navigation.

## 7. Challenges & Resolutions

| Challenge | Resolution |
|---|---|
| After a successful login the app returned to the login page | The client was clearing its whole data cache, which detached the session query; fixed by clearing all data except the session and writing the new user into it. |
| API server sometimes started on the wrong port in the dev environment | Added an `API_PORT` setting that takes priority over the generic `PORT` variable. |
| Browser rejected requests when the site was opened via `127.0.0.1` instead of `localhost` | `CLIENT_ORIGIN` now accepts a comma-separated list of allowed origins. |
| bcrypt silently ignores characters beyond 72 bytes | Password validation rejects passwords over 72 bytes so users are never surprised. |

## Plan for Week 6

- Implement the core business engine (roster conflict detection) with unit tests.
- Add server-side validation and consistent error handling across all endpoints.
- Complete the end-to-end vertical slice: Roster Builder UI ↔ REST API ↔ database.

---

*Submitted by Saniya (24-ST-045) to Dr. Zaigham Mushtaq — Week 5, PTUT-PRJ-039.*
