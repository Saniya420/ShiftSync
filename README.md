# ShiftSync

A scheduling workspace for small retail and food-service teams. Phase 1 covers
authentication, tenant isolation, teams, locations, recurring availability and weekly rosters.

## Requirements

- Node.js **20.19+** (or **22.12+**); Node 22 LTS is a convenient choice.
  See [Vite’s Node requirements](https://vite.dev/guide/).
- npm with workspace support.
- PostgreSQL on localhost:5433, user `shiftsync`, databases `shiftsync` and
  `shiftsync_test`. The existing local cluster is managed separately; these scripts
  never start, reset or modify `.pgdata/`.

## Local setup (PowerShell)

```powershell
npm.cmd install
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
# Set JWT_SECRET in server/.env to a random value of at least 32 characters:
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

Open **http://localhost:5173**. Use localhost consistently: the API allows credentials
from `CLIENT_ORIGIN=http://localhost:5173`, and Vite proxies `/api` to port 3001.
Use the `npm.cmd` spelling if PowerShell execution policy blocks `npm.ps1`;
`npm` works normally in other shells.

The seed adds Corner Mart, Main Street (Asia/Karachi), one owner, one manager,
six employees, recurring availability and 30 published shifts in the current week.
It is additive and can be rerun without resetting existing passwords or roster edits.
[Demo accounts](server/prisma/SEED_ACCOUNTS.md).

For a new workspace: sign up, open **Team**, add a location, invite employees and
assign them to that location, then open **Roster builder**. Share each generated
password directly; invitations do not send email.

## Commands

| Command                   | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `npm run dev`             | Watch and run server and client concurrently              |
| `npm run build`           | Generate Prisma client, compile server, bundle client     |
| `npm run lint`            | ESLint, zero warnings allowed                             |
| `npm run typecheck`       | Strict TypeScript checks in both workspaces               |
| `npm test`                | Migrate test DB, then run server and client Vitest suites |
| `npm run db:migrate`      | Apply checked-in migrations to development DB             |
| `npm run db:seed`         | Compile and run the additive demo seed                    |
| `npm run format`          | Prettier shared formatting                                |
| `npm run start -w server` | Start compiled API after building                         |

Server build entry point: `server/dist/src/index.js`. Client bundle: `client/dist/`.
Vite uses its config runner; server development uses TypeScript’s compiler and
Node’s watcher. These avoid profile-directory reads that fail in restricted Windows sessions.

## Configuration

See the workspace `.env.example` files. Server requires `DATABASE_URL` and a
random `JWT_SECRET`; `PORT` defaults to 3001. Production must set
`NODE_ENV=production`, use HTTPS and set `CLIENT_ORIGIN` to the client origin.
The cookie is httpOnly, SameSite=Lax, secure in production, and expires after seven
days. Serve client and API on the same site (a same-origin `/api` proxy is simplest).

`VITE_API_URL=/api` uses Vite’s development proxy. For a deployed client, configure
the equivalent reverse proxy or a same-site API URL. Vite environment variables
are public; never put secrets in the client.

## Architecture and behavior

- `server/src/domain/conflicts.ts`: pure conflict engine, tested independently.
- `server/src/services/roster.ts`: roster transactions and context loading.
- `server/src/routes/`: validated HTTP adapters.
- `client/src/pages/`: React Router pages backed by TanStack Query.
- `server/prisma/`: complete schema, migration, demo seed.

All authenticated tenant reads/writes derive organization scope from the verified
session. Roles are reloaded from the database on every request. Composite foreign
keys also prevent cross-tenant associations. The necessary bootstrap exceptions
are signup, globally unique email lookup at login, and the system health probe.
Organization records are scoped by their own primary key.

Owners and managers operate tenant-wide rosters and locations in Phase 1.
Employees can edit only their own availability and read only their own published
shifts. Owners can promote employees to managers from Team; managers can manage
employees but cannot promote managers or modify owner accounts. The spec does
not yet define per-manager location permissions.

Availability uses Sunday=0 through Saturday=6 and local minutes [0,1440].
Multiple windows per day are supported; windows must not overlap. Overnight
availability is expressed as windows on each day. No availability means unavailable.
Warnings cover overlap, availability, approved time off, weekly hours and <10h rest.
Weekly limits include the employee’s shifts across locations, with Monday
boundaries in the edited shift’s location timezone.

Roster reads include shifts intersecting the selected local week, so overnight
hours are clipped correctly in totals. Copy/publish act on shifts **starting** in
the selected week. Copying preserves local wall-clock times across DST and creates
drafts. Copy and publish are atomic. Shift writes take a tenant-specific PostgreSQL transaction advisory lock before
reading conflicts, so concurrent writers see the preceding committed changes.
The lock is automatically released on commit or rollback
([PostgreSQL documentation](https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS)).

Hard overlaps return 409 until a manager/owner explicitly chooses an override.
Other conflicts return warnings with a successful save. The roster displays the
warnings and lets managers explicitly publish a reviewed overlapping roster.
Employees see changes to a published shift immediately; editing does not reset
its published status. Estimated labor is scheduled hours × hourly rate, with no
currency assumption, overtime premiums or taxes.

## Tests and database safety

`npm test` uses `TEST_DATABASE_URL` from `server/.env`, falling back to the local
test DB. The test launcher rejects any database name other than
`shiftsync_test`, sets the test environment and applies migrations. Integration
tests use unique organizations and clean up only those organizations; they never
truncate the database or touch development seed records.

Tests cover all five conflicts and boundaries (overnight, DST, touching shifts,
week boundaries), session cookies, role enforcement, input validation, tenant
isolation, membership checks, CRUD, atomic copying, publishing and concurrent
overlap rejection. Client tests exercise login, role guards, week navigation,
hours, dialogs, availability submission and roster actions.

## Phase boundary

Swaps, time-off workflows, attendance and timesheets have Prisma models only.
Email delivery, password reset/mandatory temporary-password rotation, notification
inbox, audit viewer and manager-specific location authorization are later work.
Logout clears the browser cookie; issued JWTs are stateless and cannot be revoked
individually before expiry.

See [API reference](docs/API.md) and [Phase 1 progress](docs/PROGRESS.md).
