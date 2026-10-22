# ShiftSync

A scheduling workspace for small retail and food-service teams. The MVP includes
tenant-scoped rosters, availability, time-off requests, shift handovers, attendance,
timesheets, CSV export, and in-app notifications.

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
six employees, recurring availability and 30 published shifts in the current week,
plus a future cover offer, pending time off, welcome notifications and attendance
for ended shifts this week (on-time, late, and no-show).
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
- `server/src/domain/swaps.ts`, `attendance.ts`, `timesheets.ts`: pure state machine,
  attendance/geofence rules and reporting calculations with unit tests.
- `server/src/services/roster.ts`: roster transactions and context loading.
- `server/src/services/requests.ts`, `attendance.ts`, `reports.ts`: tenant-scoped workflows.
- `server/src/jobs.ts`: idempotent startup/every-minute no-show detection, disabled in tests.
- `server/src/routes/`: validated HTTP adapters.
- `client/src/pages/`: React Router pages backed by TanStack Query.
- `server/prisma/`: complete schema, migration, demo seed.

All authenticated tenant reads/writes derive organization scope from the verified
session. Roles are reloaded from the database on every request. Composite foreign
keys also prevent cross-tenant associations. The necessary bootstrap exceptions
are signup, globally unique email lookup at login, and the system health probe.
Organization records are scoped by their own primary key.

Owners and managers operate tenant-wide rosters and locations.
Employees can edit their availability, read their published shifts, request/cancel
time off, offer shifts and accept eligible coworker offers, and clock in/out.
Owners can promote employees to managers from Team; managers can manage
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

## Phase 2 workflows

Employees use **Time off** to request inclusive date ranges and **My schedule → Swap**
to offer a future published shift to a coworker or anyone at that location.
**Open shifts** lists available offers and tracks their own offers. Accepting a
handover reserves it; only manager approval reassigns the shift. Managers review
**Requests → Time off / Swaps**. Every swap conflict blocks approval until explicitly
reviewed and overridden. Active offers are unique per shift at the database level.

The employee overview shows a large **Clock in / Clock out** button for an active
shift, available 15 minutes before start. Enter a PIN if the account has one configured;
browser geolocation is requested when available. Location geofences apply when
coordinates are supplied. Managers open **Attendance** for a live Today board and
can correct existing records with a required audit note. Missed shifts become
NO_SHOW after their end plus 30 minutes. The board uses the organization timezone;
shift times display in each location's timezone.

**Timesheets** provides manager/owner date and location filters and CSV download.
Actual hours require a completed attendance record. Weekly overtime is based on
actual hours across locations and full local weeks; selected dates are inclusive.
Estimated cost uses scheduled hours and current hourly rates, without premiums or
taxes. The bell shows unread notifications, individual read controls, and read-all.

The demo seed preserves edits and existing request decisions when rerun. Attendance
fixtures only populate already ended shifts, so early Monday may have no past-day
attendance yet. The dedicated future offer is created once per week and keeps its
original time when reseeded. Use employee1 for the cover offer and employee2 for the
pending time-off request. Any other demo employee at Main Street can accept open offers.

## Phase 3 workflows and optional integrations

**Roster builder -> Suggest with AI** accepts staffing rows (Sunday=0, Monday=1),
including overnight windows and a same-every-weekday helper. Review the source badge,
assignments and warnings before **Apply as drafts**. No suggestion is saved automatically.
No API key is needed: a deterministic greedy scheduler fills eligible employees by
fewest scheduled hours, respecting availability, approved time off, overlap, max hours
and ten-hour rest. Unfilled demand is reported. Gemini errors, invalid output and
20-second timeouts use the same fallback. Calls are limited to 20 per org/hour
in each server process; multi-instance deployments should use a shared limiter.

Optional server environment variables (see server/.env.example):

| Variable              | Default / behavior                                                                    |
| --------------------- | ------------------------------------------------------------------------------------- |
| GEMINI_API_KEY        | Empty: Smart fallback; otherwise Gemini REST                                          |
| GEMINI_MODEL          | gemini-3.5-flash                                                                      |
| GEMINI_FALLBACK_MODEL | gemini-flash-lite-latest; tried when the main model returns 503/429                   |
| RESEND_API_KEY        | Empty: try SMTP, then log; otherwise Resend REST                                      |
| SMTP_URL              | Empty: log; otherwise smtp://user:password@host:587 or smtps://user:password@host:465 |
| EMAIL_FROM            | ShiftSync <notifications@shiftsync.local>; set a verified sender for delivery         |

The Gemini payload whitelists display names, employee IDs, availability, approved
absence windows, rates, limits, existing shift windows and manager needs/notes.
Account emails, password/PIN hashes and absence reasons are excluded. The REST
implementation follows the [Gemini generateContent reference](https://ai.google.dev/api/generate-content).
Email uses the [Resend API](https://resend.com/docs/api-reference/emails/send-email)
or [Nodemailer SMTP](https://nodemailer.com/smtp).

Notifications and opted-in emails commit together. A background worker scans a
Postgres outbox every 30 seconds, in batches of 10 per tenant, with a separate tenant
worker lock. Failure retries after 1, 2, 4 and 8 minutes, then becomes FAILED on the
fifth attempt. Opted-out/inactive accounts have queued emails suppressed as FAILED.
Resend uses outbox IDs as idempotency keys; SMTP and log delivery are at-least-once
if a process dies after delivery and before the status commit. Both background jobs
are disabled in tests. Tests clear integration credentials and reject unmocked fetch.

**Profile** updates name, email opt-in, password and clock-in PIN. Changing or clearing
a PIN and changing password require the current password. Owner-issued reset passwords
are shown once; users must replace them on Profile before accessing other API resources.
Inactive users cannot log in and existing sessions stop working immediately. Inactive
users remain in historical reports and cannot receive new scheduling assignments.

**Team** supports name/email search, role/location filters and selected-member location
assignment or weekly-hours updates. Owners can batch manage managers; owner accounts
are protected. **Requests** supports status and date-overlap filters, and per-item
batch time-off approval/denial results. **Roster builder** adds position filters,
confirmed draft batch deletion and selected-day publishing with conflict review.

**Admin** is available to owners and managers. Managers have analytics access only;
owners also have paginated audit filters and user role, activation and password-reset
controls. Analytics includes four responsive Recharts charts and KPI tiles. Published
shifts contribute scheduled hours/cost/coverage; completed attendance contributes
actual hours. Attendance rates use ended, assigned shifts; lateness uses arrival time
independently of early leave. Swap approval rate uses approved/rejected requests;
swap/time-off volume uses request creation date. Days use the selected location or
organization timezone. Monetary estimates exclude overtime premiums and taxes.

The additive seed includes three earlier weeks, mixed attendance, open coverage and
request history, plus inactive employee6. Existing records are preserved. Demo login
credentials remain in server/prisma/SEED_ACCOUNTS.md.

All pages use collapsible mobile navigation, mobile full-height dialogs, mutation
toasts and loading/empty states; the roster scrolls horizontally with a sticky name
column. To verify on Windows use npm.cmd if PowerShell blocks npm.ps1:

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## Remaining scope

Notification pagination beyond the latest 100 and manager-specific location
authorization remain later work. Logout clears the browser cookie; JWTs have no
individual revocation mechanism before expiry. Account activation and mandatory
password rotation are checked on every authenticated request.

See [API reference](docs/API.md) and [progress](docs/PROGRESS.md).
