You are continuing ShiftSync. Read AGENTS.md, docs/SPEC.md, docs/API.md, docs/PROGRESS.md and the existing code first.
Phases 1–2 (auth, roster + conflict engine, time-off, swaps, attendance, timesheets, notifications) are done; 96 tests pass.
Keep existing conventions: thin routes, pure domain functions in server/src/domain with unit tests, Zod validation,
`{ error: { code, message, details? } }` errors, tenant scoping on every query, TanStack Query on the client.
Note: `.git` is read-only in your sandbox — do NOT try to commit; the reviewer commits. Do not touch `.pgdata/`.

PHASE 3 GOAL (plan weeks 8–9): third-party integrations with safe fallbacks, secondary features, admin portal with
analytics, and UX polish. The app MUST work fully with no API keys set (dev, tests, CI). No real network calls in tests.

1. Gemini AI schedule suggestions
   - Config: `GEMINI_API_KEY` (optional), `GEMINI_MODEL` (default `gemini-2.5-flash`). Call the Gemini REST API
     (`generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`) with `fetch`, a 20 s timeout and
     JSON response mode. Never send emails, password hashes or PINs to the model — send employee ids, display names,
     availability windows, approved time-off, max weekly hours, hourly rate, and the manager's staffing needs.
   - POST /api/ai/suggest-roster (manager/owner) `{ week, locationId, needs: [{ weekday, start: "HH:mm", end: "HH:mm",
     headcount, position }], notes? }` → `{ source: "gemini" | "heuristic", shifts: [{ userId, startsAt, endsAt, position }],
     warnings, explanation }`. Validate the model output with Zod; drop shifts with unknown users or invalid times;
     run every suggestion through the existing conflict engine and return warnings.
   - Fallback: pure deterministic heuristic in `server/src/domain/autoschedule.ts` (greedy fill: available, no time-off,
     fewest hours so far, under max weekly hours, respects 10 h rest) used when no key, on timeout/HTTP error, or on
     invalid model output. Unit-test the heuristic thoroughly; mock fetch for the Gemini path (success, bad JSON, timeout).
   - Suggestions are NOT saved automatically. POST /api/ai/apply-suggestion `{ week, locationId, shifts, force? }` creates
     them as DRAFT shifts in one transaction (reuse roster service, same conflict/409 rules).
   - Simple per-org rate limit for AI calls (e.g. 20/hour) returning 429 RATE_LIMITED.
   - UI: "Suggest with AI" button in Roster Builder → modal to enter staffing needs (rows per weekday, with a
     "same every weekday" helper) → preview grid of suggested shifts with warnings and the source badge
     (Gemini / Smart fallback) → "Apply as drafts".
2. Email notifications (background, with fallback)
   - `server/src/services/email.ts` with a transport interface: `resend` (if `RESEND_API_KEY`, via fetch to Resend's
     REST API), `smtp` (if `SMTP_URL`, via nodemailer), else `log` transport that logs the email with pino.
     `EMAIL_FROM` env with a sensible default.
   - Queue table `EmailOutbox` (id, organizationId, userId, to, subject, html, text, status PENDING|SENT|FAILED,
     attempts, lastError, sendAfter, createdAt, sentAt) + Prisma migration. Whenever an in-app Notification is created,
     enqueue an email if the user has `emailNotifications = true` (new User boolean, default true).
   - Background worker (setInterval, disabled in tests like the no-show job): sends PENDING emails in batches, retries
     with exponential backoff up to 5 attempts, then FAILED. Pure backoff function with tests; integration test with a
     fake transport.
   - Simple branded HTML email templates (publish, swap decision, time-off decision, no-show) + plain-text versions;
     HTML-escape all user content.
   - User setting: toggle email notifications on a "Profile" page (also lets the user change name and password —
     current password required; and set/clear clock-in PIN).
3. Secondary features: search, filtering, batch operations
   - Team page: search by name/email, filter by role and location; batch select → assign location / set max weekly hours.
   - Requests inbox: filter by status and date range; batch approve/deny time-off (each item validated; return
     per-item results).
   - Roster builder: filter by position; batch delete selected DRAFT shifts; batch publish selected days.
   - Server endpoints for each batch op, transactional where sensible, tenant-scoped, tested.
4. Admin portal with RBAC + analytics (owner, and managers read-only for their org)
   - Route `/app/admin` visible only to OWNER (full) and MANAGER (analytics only). Server enforces with requireRole.
   - GET /api/admin/analytics?from&to&locationId → KPIs and series: total scheduled vs actual hours, labour cost,
     attendance rate, late rate, no-show rate, swap volume and approval rate, time-off volume, coverage (% of shifts
     with an assignee), hours per employee, daily series for the range. Pure aggregation functions with tests.
   - GET /api/admin/audit-log (owner) paginated, filter by action/entity.
   - Owner user management: change role (MANAGER/EMPLOYEE), deactivate/reactivate user (new `active` boolean; inactive
     users cannot log in and are excluded from scheduling and AI suggestions), reset a user's password (returns one-time
     temp password).
   - UI: Admin page with KPI tiles, charts (add `recharts`): hours scheduled vs actual (line), attendance status (stacked
     bar or donut), labour cost per day (bar), hours per employee (horizontal bar); date-range + location filters;
     Audit log tab; Users tab (owner). Charts must look right in light mode and on mobile.
5. UX polish
   - Responsive pass for every page at 360 px width: collapsible sidebar → bottom nav or hamburger on mobile, roster grid
     horizontally scrollable with sticky employee column, modals full-screen on mobile.
   - Consistent toasts for every mutation (success + error), loading skeletons, empty states, confirm dialogs for
     destructive actions.
6. Seed: keep existing demo data; add analytics-friendly history (previous 3 weeks of shifts + attendance with a
   realistic mix) so the dashboard charts are populated; mark one employee inactive.
7. Verify: migrations, seed, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all green. Add tests for
   every new domain function and endpoint (incl. tenant isolation and RBAC denials). Update docs/API.md, README
   (document the new env vars in server/.env.example) and append a Phase 3 section to docs/PROGRESS.md.
