# Phase 1 API

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
