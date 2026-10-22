# ShiftSync — Product & Technical Specification

Project ID: PTUT-PRJ-039 · Domain: Local Commerce, SMB & Retail Operations

## Problem
Store managers at small retail/food businesses spend 3–5 hours a week building shift rosters on paper or
spreadsheets, then lose more time to chaotic WhatsApp threads where employees ask to swap or drop shifts.
There is no single source of truth for who is working, attendance is tracked by hand, and payroll hours are
reconstructed from memory. ShiftSync replaces this with one web app: managers build and publish a weekly
roster with automatic conflict checks, employees see their shifts, set availability, request swaps/time off,
and clock in/out; managers approve requests and get accurate timesheets.

## Users / roles
- **OWNER** – creates the organization (tenant), manages locations, managers, billing-free settings.
- **MANAGER** – builds rosters for their location(s), approves swaps/time-off, reviews attendance & timesheets.
- **EMPLOYEE** – views own schedule, sets availability, requests swaps/time off, clocks in/out.

Multi-tenant: every row belongs to an `Organization`; every query is scoped by `organizationId` taken from the
authenticated session, never from client input.

## 5 Core MVP features
1. **Weekly Roster Builder** – week grid (employees × days), create/edit/delete/copy shifts, copy last week,
   publish week. Conflict engine flags: overlapping shifts, shift outside employee availability, approved time-off
   clash, weekly hours over `maxWeeklyHours`, < 10h rest between shifts. Shows weekly hours & labor cost.
2. **Availability & Time-Off** – employees set recurring weekly availability; request time off; manager approves/denies.
3. **Shift Swap & Cover Marketplace** – employee offers a shift (open drop or directed swap to a coworker);
   eligible coworker accepts; manager approves; roster updates atomically. Conflict engine re-checks before approval.
4. **Attendance (Clock-in/out)** – employee clocks in/out against a scheduled shift (optional PIN + geofence radius
   per location); system marks LATE (> grace minutes), NO_SHOW, EARLY_LEAVE; manager can correct entries with audit note.
5. **Timesheets & Notifications** – per-employee hours (scheduled vs actual), overtime, CSV export; in-app
   notifications for published schedules, swap/time-off decisions, and missed clock-ins.

Later weeks: Gemini AI auto-schedule suggestions (week 8), email/WhatsApp notifications (week 8),
admin analytics dashboard with RBAC (week 9).

## Tech stack
- Monorepo with npm workspaces: `client/`, `server/`, `docs/`.
- **Client**: React 18 + TypeScript + Vite + Tailwind CSS + React Router + TanStack Query; react-hot-toast.
- **Server**: Node 20+ + Express + TypeScript, Prisma ORM, PostgreSQL, Zod validation, bcrypt (cost 12),
  JWT access token in httpOnly SameSite cookie, helmet, cors, express-rate-limit, pino logging.
- **Tests**: Vitest + Supertest (server), Vitest + Testing Library (client).
- **Deploy (week 11)**: Vercel (client), Render (server), Neon/Supabase Postgres, GitHub Actions CI.

## Local dev database
A private Postgres 18 cluster lives in `./.pgdata` (git-ignored), port 5433, user `shiftsync`, trust auth.
- dev: `postgresql://shiftsync@localhost:5433/shiftsync`
- test: `postgresql://shiftsync@localhost:5433/shiftsync_test`
Start it with: `"C:/Program Files/PostgreSQL/18/bin/pg_ctl" -D ./.pgdata -o "-p 5433" -l ./.pgdata/server.log start`

## Data model (initial)
Organization, Location(name, timezone, lat, lng, geofenceRadiusM, clockInGraceMin), User(email, passwordHash,
name, role, hourlyRate, maxWeeklyHours, pin hash, organizationId), UserLocation, Availability(userId, weekday,
startMinute, endMinute), TimeOffRequest(status), Shift(locationId, userId nullable = open shift, startsAt, endsAt,
role/position, notes, status DRAFT|PUBLISHED), SwapRequest(shiftId, requesterId, targetUserId nullable,
acceptedById, status PENDING|ACCEPTED|APPROVED|REJECTED|CANCELLED), AttendanceRecord(shiftId, userId, clockInAt,
clockOutAt, status, correctedById, note), Notification, AuditLog.
Indexes on (organizationId), (locationId, startsAt), (userId, startsAt).
