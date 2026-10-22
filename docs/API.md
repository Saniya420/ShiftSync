# ShiftSync MVP API

Base URL: `http://localhost:3001/api`. JSON bodies; credentialed cookie sessions.
Errors are `{ "error": { "code": "...", "message": "...", "details": {} } }`.
Unknown body/query fields are rejected where a schema is defined; client organization
IDs and invite roles are never accepted. User IDs in payloads must belong to the
authenticated tenant and shifts require a matching location membership.

| Method      | Path                                   | Access                                            |
| ----------- | -------------------------------------- | ------------------------------------------------- |
| GET         | /health                                | Public; database probe                            |
| POST        | /auth/signup                           | Public; creates organization and OWNER            |
| POST        | /auth/login                            | Public                                            |
| POST        | /auth/logout                           | Clears cookie                                     |
| GET         | /auth/me                               | Authenticated                                     |
| GET         | /locations                             | Authenticated                                     |
| GET         | /locations/:id                         | Authenticated                                     |
| POST        | /locations                             | Manager/owner                                     |
| PUT, DELETE | /locations/:id                         | Manager/owner                                     |
| GET, POST   | /users                                 | Manager/owner                                     |
| PUT         | /users/:id                             | Manager/owner with role restrictions              |
| GET, PUT    | /availability                          | Own availability                                  |
| GET         | /shifts?week=YYYY-MM-DD&locationId=... | Authenticated; employees see own published shifts |
| POST        | /shifts                                | Manager/owner                                     |
| PUT, DELETE | /shifts/:id                            | Manager/owner                                     |
| POST        | /shifts/copy-previous-week             | Manager/owner                                     |
| POST        | /shifts/publish                        | Manager/owner                                     |

Weeks must be valid Monday dates; locationId is optional only for listing.
Location dates and weekly boundaries use its IANA timezone; organization timezone
is used for listing all locations.

## Bodies

- Signup: `{ organizationName, name, email, password }`.
- Login: `{ email, password }`. Passwords are 12–72 UTF-8 bytes/characters (at least
  12 characters, at most 72 bytes); hashes use bcrypt cost 12.
- Location create/update: `{ name, timezone, lat?, lng?, geofenceRadiusM?, clockInGraceMin? }`.
- Invite: `{ name, email, hourlyRate, maxWeeklyHours, locationIds: [] }`.
  Returns `{ user, tempPassword }`; role is always EMPLOYEE.
- User update: `{ name, hourlyRate, maxWeeklyHours, locationIds: [], role? }`.
  Only the owner can set role to MANAGER or EMPLOYEE; owner accounts are protected.
- Availability: `{ availability: [{ weekday: 1, startMinute: 540, endMinute: 1020 }] }`.
  Replaces all own recurring windows atomically; empty array marks all days unavailable.
- Shift create/update: `{ locationId, userId: string | null, startsAt, endsAt, position?, notes?, force?: false }`.
  Timestamps must be ISO instants with an offset; end must be later and duration at most 24h.
  PUT is a full replacement of editable fields and preserves publication status.
- Copy/publish: `{ week: "2026-10-19", locationId, force?: false }`.
- Logout: `{}`.

Create/update returns `{ shift, warnings }`; listing returns
`{ timezone, shifts: [{ ..., location, warnings }] }`.
Warnings contain `{ type, message, shiftId? }`. Types: OVERLAP,
OUTSIDE_AVAILABILITY, TIME_OFF, WEEKLY_HOURS, REST.
409 SHIFT_OVERLAP includes `error.details.warnings`. Overrides must use JSON
boolean `force: true` and are restricted to managers/owners.
Copy returns `{ shifts, warnings }`; publish returns `{ published, warnings }`.
Publishing twice changes zero shifts and does not duplicate notifications.
A 409 CONCURRENT_UPDATE means refresh and retry.

Auth POSTs are rate-limited (60 requests/IP/15 minutes outside tests).
Cross-origin unsafe requests are rejected unless Origin matches CLIENT_ORIGIN;
CORS allows credentials for that configured origin. The client proxy is the
recommended same-origin development entry point.

## Time off

| Method | Path                   | Access / response                                                                               |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------- |
| GET    | /time-off              | Employees: own; managers/owners: organization. `{ requests }`, newest first, includes user name |
| POST   | /time-off              | Own request. `{ startsAt, endsAt, reason }` → 201 `{ request }`                                 |
| POST   | /time-off/:id/cancel   | Own PENDING or APPROVED request; `{}` → `{ request }`                                           |
| POST   | /time-off/:id/decision | Manager/owner; `{ status: "APPROVED" \| "REJECTED" }` → `{ request }`                           |

Ranges are half-open ISO instants with offsets; end must be after start. Reason
is required, trimmed, 1–1000 characters. The client converts inclusive whole-day
dates in the organization timezone into a range ending at midnight of the next day.
Only PENDING requests can be decided. Decisions notify the employee atomically.
Approved requests immediately participate in roster and swap TIME_OFF conflicts;
cancellation removes that conflict. Invalid transitions return 409 INVALID_TRANSITION.

## Shift swap / cover

| Method | Path                         | Body / response                                                                           |
| ------ | ---------------------------- | ----------------------------------------------------------------------------------------- |
| GET    | /swaps                       | `{ swaps }`, including shift/location and requester, target, acceptor names               |
| GET    | /swaps/coworkers?shiftId=... | Coworkers at the location of your own future published shift; `{ users: [{ id, name }] }` |
| POST   | /swaps                       | `{ shiftId, targetUserId? }` → 201 `{ swap }`                                             |
| POST   | /swaps/:id/accept            | Eligible coworker, `{}` → `{ swap, warnings }`                                            |
| POST   | /swaps/:id/cancel            | Requester, `{}` → `{ swap, warnings }`                                                    |
| POST   | /swaps/:id/approve           | Manager/owner, `{ force?: false }` → `{ swap, warnings }`                                 |
| POST   | /swaps/:id/reject            | Manager/owner, `{}` → `{ swap, warnings }`                                                |

An offer requires your own future PUBLISHED shift without attendance. A coworker
must belong to that shift's location, differ from the requester, and match the
target when directed. Open offers are visible only to eligible location members;
employees also see their own requested/accepted offers. Managers see all org swaps.
Eligibility at acceptance means location membership and directed recipient match;
scheduling warnings are checked at final approval. Acceptance never reassigns the shift.

Transitions: PENDING → ACCEPTED → APPROVED; PENDING or ACCEPTED → CANCELLED by
requester, or REJECTED by manager. Terminal states cannot transition again.
A partial unique database index prevents multiple PENDING/ACCEPTED offers per shift;
409 ACTIVE_SWAP reports an existing offer. Accept/approve reject started, draft,
reassigned, or attendance-recorded shifts. Approval revalidates location membership
and all conflict types, returning 409 SWAP_CONFLICT with `error.details.warnings`
unless JSON boolean `force: true` is supplied. Shift reassignment, swap status,
audit log, and notifications commit in one transaction under the roster tenant lock.
Acceptance notifies requester, acceptor, and managers; approval/rejection notifies
requester and acceptor. An assignee cannot be changed through roster editing once
attendance exists (409 ATTENDANCE_EXISTS).

## Attendance

| Method | Path                  | Access / body / response                                                                             |
| ------ | --------------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | /attendance/current   | Own currently clocked shift, or next eligible current shift; `{ shift, record }`, nullable           |
| POST   | /attendance/clock-in  | Own published shift; `{ shiftId, pin?, lat?, lng? }` → `{ record }`                                  |
| POST   | /attendance/clock-out | Own published shift; same body → `{ record }`                                                        |
| GET    | /attendance           | Manager/owner; `{ timezone, shifts }`, today's shifts with user, location, attendance and liveStatus |
| PUT    | /attendance/:id       | Manager/owner; `{ clockInAt: ISO \| null, clockOutAt: ISO \| null, note }` → `{ updated: true }`     |

Clock-in is allowed from exactly 15 minutes before start until (excluding) shift
end. Only one record per employee/shift and one active clock per employee are
allowed; duplicate and invalid clock actions return 409. Timestamps come from the
server. PIN is a 4–12 digit string; if the user's pinHash exists, a matching PIN is
required for clock-in and clock-out (403 INVALID_PIN). Coordinates must be paired
and bounded. If both the location and request have coordinates, Haversine distance
must be within geofenceRadiusM (403 OUTSIDE_GEOFENCE); absent coordinates are allowed.
The client requests browser geolocation and falls back when unavailable or denied.

Status: no arrival → NO_SHOW; clock-out before end → EARLY_LEAVE; otherwise arrival
strictly beyond clockInGraceMin → LATE; otherwise ON_TIME. Early leave takes
precedence in the record status; timesheet late counts independently use arrival
timestamps, so an employee can be counted late even when leaving early.
Overnight shifts use absolute instants. Today is the organization's local day,
including overnight shifts intersecting it. liveStatus is IN, OUT, LATE,
NOT_ARRIVED, or NO_SHOW; the stored attendance status remains available separately.
The client polls the board every 15 seconds, current shift every 30 seconds.

Corrections require a trimmed 1–1000 character note, nullable times, and an out
time strictly after an in time. Both null means NO_SHOW. Every correction writes
an AuditLog containing before/after timestamps and status, actor, and note in the
same transaction. A startup/every-minute job marks assigned published shifts that
ended strictly more than 30 minutes ago without attendance as NO_SHOW and notifies
employee and managers exactly once. The job is disabled in test environments;
it discovers tenant IDs as a system operation, then scopes all work to each tenant.

## Timesheets and notifications

| Method | Path                                                         | Access / response                                                               |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| GET    | /timesheets?from=YYYY-MM-DD&to=YYYY-MM-DD&locationId=...     | Manager/owner; `{ timezone, rows }`                                             |
| GET    | /timesheets.csv?from=YYYY-MM-DD&to=YYYY-MM-DD&locationId=... | Manager/owner; CSV attachment                                                   |
| GET    | /notifications                                               | Own only; `{ notifications, unreadCount }`, latest 100, unread count across all |
| POST   | /notifications/:id/read                                      | Own only, `{}` → 204; foreign/other-user IDs → 404                              |
| POST   | /notifications/read-all                                      | Own only, `{}` → 204                                                            |

Report dates are required, valid and inclusive, ordered, at most 366 days apart.
locationId is optional; date and Monday week boundaries use that location's
timezone, or the organization's timezone for all locations. Only published shifts
count. Rows contain userId, name, scheduledHours, actualHours, overtimeHours,
lateCount, estimatedCost. Scheduled hours and completed attendance hours are
clipped to the requested range. Missing clock-out and no-show records add zero
actual hours. Overtime uses actual hours above maxWeeklyHours per local Monday
week, including work before the selected range and at other locations. Location
filtering attributes only the selected location's hours to the result. Estimated
cost is scheduled hours × current hourlyRate; no overtime premiums or taxes.
CSV uses a UTF-8 BOM, CRLF, quoted/escaped cells and formula neutralization.

Notifications are produced for week publication, swap acceptance/approval/rejection,
time-off approval/denial, and no-shows. Reads and read-all always filter by both
authenticated organizationId and userId. Unknown fields in defined query/body
schemas are rejected. Missing foreign-tenant resources return 404.

## Phase 3: AI, profile, batches and admin

| Method   | Path                                         | Access / response                             |
| -------- | -------------------------------------------- | --------------------------------------------- |
| POST     | /ai/suggest-roster                           | Manager/owner; suggestion only, no writes     |
| POST     | /ai/apply-suggestion                         | Manager/owner; 201 drafts + warnings          |
| GET, PUT | /profile                                     | Own safe profile / update                     |
| POST     | /users/batch                                 | Manager/owner; atomic update                  |
| POST     | /time-off/batch-decision                     | Manager/owner; per-item results               |
| POST     | /shifts/batch-delete                         | Manager/owner; atomic DRAFT deletion          |
| POST     | /shifts/publish-days                         | Manager/owner; atomic selected-day publishing |
| GET      | /admin/analytics?from&to&locationId          | Manager/owner analytics                       |
| GET      | /admin/audit-log?page&pageSize&action&entity | Owner only                                    |
| PUT      | /admin/users/:id                             | Owner only; role/activation                   |
| POST     | /admin/users/:id/reset-password              | Owner only; one-time display of tempPassword  |

All bodies/queries reject unknown fields. Foreign tenant IDs return 404 without
partial writes, except time-off batches which return per-item NOT_FOUND errors.
EMPLOYEE cannot access AI, batch, or admin endpoints. MANAGER cannot access admin
user changes or audit logs. Owner accounts cannot be changed through admin/team APIs.

AI suggest body: { week, locationId, needs: [{ weekday, start, end, headcount, position }], notes? }.
Week is a Monday; weekday is Sunday=0 to Saturday=6. Times are HH:mm local to the
location; end before start means overnight, equal times are rejected. Up to 70 need
rows, 30 people per row, 500 requested shifts total. notes is at most 2000 characters.
Response: { source: "gemini" | "heuristic", shifts: [{ userId, startsAt, endsAt, position }],
warnings: [{ type, message, shiftId? }], explanation }. Gemini uses a 20-second timeout
and JSON response mode; unknown users and invalid times are dropped, conflicts become
warnings, and invalid/unavailable responses use the deterministic fallback. No key
also uses fallback. 20 suggest requests per org/hour per server process; excess
returns 429 RATE_LIMITED. Each suggested assignment is checked against all existing
and proposed shifts. Warnings can also include UNDERSTAFFED, DROPPED, FALLBACK and
INVALID_TIME. Only active location members are candidates.

AI apply body: { week, locationId, shifts: [{ userId, startsAt, endsAt, position }], force? }.
1-500 shifts, valid ISO instants with offsets, duration at most 24h, all starting in
that local week. All assignees must be active tenant members of the location.
The roster tenant lock and transaction validate the entire batch; overlap returns
409 SHIFT_OVERLAP with warnings unless force is JSON true. Other roster warnings
are returned without blocking, consistent with ordinary shift creation. Returns
{ shifts, warnings }; all saved status values are DRAFT. Failure rolls back the batch.

Profile PUT body: { name?, emailNotifications?, currentPassword?, password?, pin? }.
Password keeps the auth 12-character/72-byte rules. PIN is 4-12 digits or null to clear;
changing either password or PIN requires currentPassword, otherwise 400 validation
or 403 INVALID_PASSWORD. GET returns { user } with safe fields (no hashes).
User/session responses now include active, emailNotifications and mustChangePassword.
Deactivated users get 401 on login and existing sessions. A reset returns { user,
tempPassword }; the password is stored only as a bcrypt hash, shown once, and requires
rotation before non-profile resources (403 PASSWORD_CHANGE_REQUIRED). After changing
it, the temporary password no longer authenticates. Profiles cannot set roles/org IDs.

Team listing accepts optional search (case-insensitive name/email), role and locationId.
Batch team body: { ids, locationId?, maxWeeklyHours? }; 1-100 unique IDs and at least
one update. Location is added to memberships; existing locations are preserved.
Max hours is 0-168. Manager may update employees; owner may also update managers.
Returns { updated }. All target IDs and the location are validated before writes.

GET /time-off and /swaps accept status and paired from/to (inclusive local dates).
Requests must overlap the date range (swaps use shift windows). ACCEPTED is a valid
swap filter and yields no time-off rows. Batch decision body: { ids, status:
"APPROVED" | "REJECTED" }, up to 100 unique IDs. Each item runs its own transaction
and transition validation; response { results: [{ id, ok, error?: { code, message } }] }.
A stale/missing item does not undo valid items. Successful decisions enqueue email.

Draft delete body: { ids }; 1-100 unique IDs. Missing IDs return 404, any published
shift returns 409 NOT_DRAFT, and no deletion occurs. Returns { deleted }.
Publish days body: { week, locationId, days: [0..6], force? }; days must be unique,
1-7 values. Returns { published, warnings }; existing overlap/override rules apply.
Publication emails/notifications are idempotent when repeated without new drafts.

Admin analytics uses the existing inclusive report range validation (at most 366 days
apart) and timezone rules. Returns { timezone, kpis, daily, attendance, hoursPerEmployee }.
KPIs: scheduledHours, actualHours, labourCost (scheduled hours times current hourly
rate), attendanceRate, lateRate, noShowRate, swapVolume, swapApprovalRate,
timeOffVolume, coverage. Rates are percentages 0-100; empty denominators return 0.
Attendance denominators are ended assigned shifts. Arrival timestamps count late
independently of stored EARLY_LEAVE status. Missing arrival on an ended shift is a
no-show. Actual hours require clock-in and clock-out; hours/cost are clipped to the
range and split by local day. Coverage is assigned/published shifts intersecting the
range. Swap approval is approved/(approved+rejected); request volume filters creation
date. Location filters restrict swap shift locations and time-off user memberships.
Inactive users retain their historical metrics. daily has one row per local date:
{ date, scheduledHours, actualHours, labourCost }; hoursPerEmployee contains
{ userId, name, scheduledHours, actualHours }. attendance contains name/value buckets.

Audit response: { entries, total, page, pageSize }; default page=1, pageSize=25 (max 100),
action and entity are exact filters, entries newest first with stable ID ordering.
Owner user PUT body: { role?: "MANAGER" | "EMPLOYEE", active?: boolean }; at least one
field. Reset body is {}. Changes and password reset actions produce tenant audit rows;
passwords and hashes never appear in audit details.

Emails are queued atomically with notifications when opted in (default true), escaped
HTML and plain text. Transports: RESEND_API_KEY -> Resend, SMTP_URL -> Nodemailer,
otherwise pino log. EMAIL_FROM defaults to ShiftSync <notifications@shiftsync.local>.
Background batches run every 30 seconds, retry exponentially up to 5 attempts then
FAILED. Queued emails are suppressed if a recipient opts out or becomes inactive.
No background jobs or real integration network calls run in tests.
