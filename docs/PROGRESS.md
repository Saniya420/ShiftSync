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

## Phase 3 - 2026-10-23

Implemented optional integrations, secondary workflows, admin analytics and UX polish:

- Gemini REST suggestions with whitelisted scheduling data, JSON/Zod validation,
  a 20-second timeout, per-org 20/hour process limiter and deterministic greedy
  fallback. Unknown users/invalid shifts are dropped; all proposed assignments run
  through the conflict engine. Apply revalidates active location membership, local
  week and whole-batch conflicts under the roster tenant lock, saving only DRAFTs.
- Transactional notification/email enqueue with user opt-in, escaped branded HTML
  and text, Resend/SMTP/log transports, a separately locked background outbox worker,
  exponential retries and terminal failure after five attempts. Both jobs remain
  disabled in tests; test credentials are cleared and unmocked fetch is rejected.
- Profile name/email preference, current-password-verified password and PIN updates.
  Active accounts and mandatory reset-password rotation are enforced server-side;
  owners can manage roles/activation and issue temporary passwords once for display.
- Team search/role/location filters and atomic membership/hour batches; requests
  status/date filters and per-item time-off batch decisions; roster position filter,
  confirmed DRAFT batch deletion and selected-day publishing with overlap review.
- Owner/manager analytics using pure timezone-aware aggregation with daily series,
  ten KPIs and four responsive Recharts charts. Owners additionally have paginated
  audit filters and user management; managers cannot access those endpoints/tabs.
  Admin/chart code is loaded on demand.
- Collapsible mobile navigation, full-height small-screen dialogs, sticky roster
  employee column, narrow-screen availability/schedule fixes, loading skeletons,
  empty states, mutation toasts and destructive-action confirmations.
- Additive three-week history with mixed attendance, requests and open shifts;
  demo employee6 is inactive. API, setup and optional environment docs updated.

Validation: development and test migrations applied; demo seed succeeded. Root
lint, strict typecheck, all 149 tests (123 server / 26 client) and production build
passed. The build splits Admin/charts into a separate chunk (about 414 KB; main
chunk about 434 KB), without oversized-chunk warnings. Browser visual QA
could not be completed: the local app origin was denied by browser approval. No
workaround was attempted. Component interaction tests and static responsive review
cover the implemented UI; a manual 360px visual review remains recommended.

Operational limits: the AI limiter is process-local; use a shared limiter for multiple
API instances. Email is at-least-once across a process crash between provider delivery
and the status commit (Resend also receives idempotency keys). No live API keys or
provider calls were used. No .env or .pgdata files were edited and no commit was
attempted; the reviewer owns commits because .git is read-only.
