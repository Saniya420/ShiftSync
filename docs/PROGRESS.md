# ShiftSync progress

## Phase 2 — 2026-10-22

Implemented all four remaining MVP workflows through database, API, React screens,
and tests:

- Time-off creation/cancellation, manager decisions, decision notifications and
  approved-time-off conflict integration.
- Directed/open cover offers, eligible coworker acceptance, cancellation/rejection,
  and atomic manager approval with fresh conflict checks and explicit override.
  A partial unique index prevents duplicate active swaps. Recorded shifts cannot
  change assignees; swap state transitions have exhaustive unit tests.
- Clock-in/out with server timestamps, 15-minute window, optional PIN/geofence,
  overnight attendance statuses, live Today board, audited corrections and an
  idempotent no-show job disabled in tests.
- Date/location timesheets, full-week overtime across locations, late counts,
  scheduled labor estimates, safe CSV export and own-user notification inbox/read controls.

Extended the additive demo seed with requests, a future offer, notifications and
mixed attendance for completed days. Updated API and setup/workflow documentation.
Integration tests cover approval rollback/override, competing accepts and clock-ins,
clock-in rules, corrections/audit, no-show boundaries and new endpoint tenant isolation.
Client tests exercise date conversion, directed offers, acceptance, conflict review,
clock-in/geolocation, correction notes, report filters and notification read actions.

Validation: development and test migrations applied; demo seed succeeded;
root lint, strict typecheck, 79 server tests, 17 client tests and production build verified.
No `.env` or `.pgdata` changes are included.

Commit creation is blocked in this environment because `.git` is read-only
(`git add` cannot create `.git/index.lock`). Four logical commit groups are
prepared in the ignored `.cache/phase2-commits.ps1` script for execution from a
normal PowerShell session. Unrelated report files are excluded.
