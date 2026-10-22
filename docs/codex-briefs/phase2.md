You are continuing ShiftSync. Read AGENTS.md, docs/SPEC.md, docs/API.md and the existing code first.
Phase 1 (auth, tenant-scoped API, roster builder, conflict engine) is done and committed; all tests pass.
Keep existing conventions: thin routes, pure domain functions in server/src/domain with unit tests, Zod validation,
`{ error: { code, message, details? } }` errors, TanStack Query on the client.

PHASE 2 GOAL: the remaining 4 MVP features, end-to-end (DB → API → UI → tests).

1. Time-off requests
   - Employee: create/cancel own requests (date range + reason). Manager/owner: list org requests, approve/deny.
   - Approved time-off must feed the existing conflict engine (TIME_OFF conflict) — verify with a test.
   - UI: employee "Time off" page; manager "Requests" inbox (tabs: Time off | Swaps) with approve/deny buttons.
2. Shift swap & cover
   - Employee offers own published future shift: directed (targetUserId) or open (anyone eligible at that location).
   - Eligible coworker accepts → status ACCEPTED. Manager approves → shift.userId reassigned in a single DB transaction,
     re-running conflict checks for the new assignee (reject with 409 + warnings unless manager passes force=true).
   - Requester can cancel while PENDING/ACCEPTED. Prevent double swaps of the same shift.
   - Domain function `server/src/domain/swaps.ts` for the state machine with unit tests for every transition.
   - UI: "Swap" button on employee's My Schedule; "Open shifts" list for coworkers; manager approval in Requests inbox.
3. Attendance (clock-in / clock-out)
   - POST /api/attendance/clock-in { shiftId, pin?, lat?, lng? }, /clock-out. Allowed from 15 min before start.
     If location has geofence (lat/lng/radius) and coordinates are given, enforce Haversine distance; if PIN is set on
     the user, require it. Pure function `server/src/domain/attendance.ts` computing ON_TIME | LATE (beyond
     clockInGraceMin) | EARLY_LEAVE | NO_SHOW, with unit tests (include overnight shifts).
   - Manager: live "Today" board (who is in / late / not arrived) and correction of a record with a required note
     that writes AuditLog.
   - A small job (setInterval on server start, skipped in test env) marks NO_SHOW for shifts ended > 30 min with no clock-in.
   - UI: employee big Clock in / Clock out button on dashboard for current shift (uses browser geolocation when available);
     manager Attendance page.
4. Timesheets & notifications
   - GET /api/timesheets?from&to&locationId → per employee scheduled hours, actual hours, overtime (> maxWeeklyHours),
     late count, estimated cost; GET /api/timesheets.csv for export. Pure calc function with tests.
   - Notifications table already exists: create notifications on week publish, swap accepted/approved/rejected,
     time-off decided, no-show. GET /api/notifications, POST /api/notifications/:id/read, read-all.
   - UI: bell icon with unread count in the layout; Timesheets page with date range + CSV download (manager/owner).
5. Seed: extend the demo with a pending time-off, a pending swap, and attendance for past days of the current week
   (mix of on-time, late, no-show) so every screen has data.
6. Verify: migrations, seed, `npm run lint`, `npm run typecheck`, `npm test` all green. Add integration tests for
   swap approval, clock-in rules, tenant isolation of the new endpoints. Update docs/API.md and README.
   Commit in logical commits. Write a short summary of what you built to docs/PROGRESS.md.
