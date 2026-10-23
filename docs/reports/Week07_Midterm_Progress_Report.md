# ShiftSync — Week 7 Midterm Progress Report

**🏛️ Live Working Prototype Milestone Gate**

| Field | Detail |
|---|---|
| Project ID | PTUT-PRJ-039 |
| Project Title | ShiftSync – Automated Employee Shift Scheduling & Attendance App |
| Track | 4. Local Commerce, SMB & Retail Operations |
| Student | Saniya |
| Roll Number | 24-ST-045 |
| Email | 24-st-045@students.ptut.edu.pk |
| Supervisor | Dr. Zaigham Mushtaq |
| Reporting Week | Week 7 of 12 — Midterm |
| Repository | https://github.com/Saniya420/ShiftSync |

---

## 1. Executive Summary

ShiftSync is a working, multi-tenant web application that replaces paper rosters and WhatsApp shift-swapping for small retail and food businesses. At the midterm gate, **all 5 MVP features are implemented and verified end-to-end**, and several features planned for Weeks 8–9 (Gemini AI roster suggestions, email notifications, admin analytics) are already working.

| Indicator | Status at Midterm |
|---|---|
| MVP features (5 of 5) | ✅ Implemented and demonstrated |
| End-to-end smoke test | ✅ **25 / 25 steps passed** |
| Automated tests | ✅ **150 passing** (124 server, 26 client) |
| Lint / strict type-check / production build | ✅ 0 errors, 0 warnings |
| Source code | ~7,600 lines of TypeScript (excluding tests) + ~3,200 lines of tests |
| Documentation | Weeks 1–6 reports, SRS, architecture, ERD, API contract (42 endpoints) |
| Repository | Public GitHub repo with protected `main` branch and PR workflow |

---

## 2. Progress Against the 12-Week Plan

| Week | Milestone | Status | Evidence |
|---|---|---|---|
| 1 | Problem discovery & personas | ✅ Complete | Week 1 report: 2 personas, problem statement, 5 MVP features |
| 2 | Software Requirements Specification | ✅ Complete | IEEE 830 SRS: 52 functional requirements, 10 use cases, 20 measurable NFRs |
| 3 | Architecture & cloud topology | ✅ Complete | 3-tier diagram, DFD Level 0/1, deployment plan |
| 4 | Database & API design, wireframes | ✅ Complete | ERD (11 entities, 17 indexes), 42 endpoint contracts, 7 wireframes |
| 5 | Scaffolding & authentication | ✅ Complete | Monorepo, bcrypt + JWT auth, RBAC, tenant isolation, branch protection |
| 6 | Core logic & vertical slice | ✅ Complete | Conflict engine (5 rules), Roster Builder ↔ API ↔ DB |
| **7** | **Midterm gate** | ✅ **This report** | Smoke test, demo, slides |
| 8 | Third-party APIs & secondary features | 🟢 Mostly done early | Gemini AI suggestions live; email outbox (log transport until a provider key is added); search, filters, batch operations |
| 9 | Admin portal & UX polish | 🟢 Mostly done early | Admin analytics (10 KPIs, 4 charts), audit log, user management; responsive mobile layout |
| 10 | Automated testing & security audit | ⏳ Planned | Coverage measurement, `npm audit`, OWASP Top 10 review |
| 11 | Cloud deployment & CI/CD | ⏳ Planned | Vercel + Render + Neon, GitHub Actions |
| 12 | Final report & defense | ⏳ Planned | — |

---

## 3. Implemented Features

| # | MVP Feature | What works today |
|---|---|---|
| 1 | **Weekly Roster Builder** | Week grid per location; add/edit/delete shifts; copy last week; publish week; live conflict warnings (overlap, availability, time off, weekly hours, < 10 h rest); hours and labour cost per employee |
| 2 | **Availability & Time-Off** | Employees set recurring weekly availability; request/cancel time off; managers approve/deny; approved time off feeds the conflict engine |
| 3 | **Shift Swap & Cover** | Offer a shift to a coworker or as an open shift; coworker accepts; manager approves with conflict re-check; atomic reassignment; one active swap per shift enforced in the database |
| 4 | **Attendance (Clock-in/out)** | Clock in from 15 min before start; optional PIN and GPS geofence; automatic ON_TIME / LATE / EARLY_LEAVE / NO_SHOW; live "Today" board; audited manager corrections |
| 5 | **Timesheets & Notifications** | Scheduled vs actual hours, overtime, late count, cost; CSV export; in-app notification bell for publish, swap, time-off and no-show events |

**Delivered ahead of schedule**
- **Gemini AI roster suggestions** — the manager enters staffing needs and Gemini proposes shifts; every suggestion is checked by the conflict engine and saved only as drafts after review. Falls back to a lighter Gemini model, then a deterministic scheduler, if the AI is unavailable.
- **Email notifications** — background outbox with retries; Profile page with email preference, password and PIN.
- **Admin portal (RBAC)** — attendance rate, late/no-show rates, labour cost, swap approval rate, coverage, charts, audit log, and owner-only user management.

---

## 4. End-to-End Smoke Test

**Method:** an automated script (`npm run smoke`, `server/scripts/smoke.mjs`) drives the real running API over HTTP exactly as a browser would. It creates a brand-new organisation, so it exercises the full journey from sign-up to logout with no pre-existing data.

**Environment:** local development stack (Node.js API on port 3001, PostgreSQL 18), 23 Oct 2026.

| # | Step | HTTP | Time (ms) | Result |
|---|---|---|---|---|
| 1 | Health check (API + DB) | 200 | 227 | PASS |
| 2 | Owner signs up (new organisation) | 201 | 1208 | PASS |
| 3 | Session restored (`/auth/me`) | 200 | 18 | PASS |
| 4 | Owner creates location | 201 | 70 | PASS |
| 5 | Owner invites employee (temporary password) | 201 | 586 | PASS |
| 6 | Owner creates shift starting in 5 min | 201 | 100 | PASS |
| 7 | Overlapping shift is blocked (409) | 409 | 30 | PASS |
| 8 | Owner publishes week | 200 | 52 | PASS |
| 9 | Employee logs in with temporary password | 200 | 633 | PASS |
| 10 | Temporary password forces a change (403) | 403 | 9 | PASS |
| 11 | Employee sets own password | 200 | 1321 | PASS |
| 12 | Employee sees the published shift | 200 | 23 | PASS |
| 13 | Employee clocks in (ON_TIME) | 200 | 44 | PASS |
| 14 | Manager attendance board shows arrival | 200 | 658 | PASS |
| 15 | Employee clocks out early (EARLY_LEAVE) | 200 | 55 | PASS |
| 16 | Employee requests time off | 201 | 22 | PASS |
| 17 | Owner approves time off | 200 | 38 | PASS |
| 18 | Employee receives notifications | 200 | 23 | PASS |
| 19 | Timesheet includes the hours | 200 | 94 | PASS |
| 20 | AI roster suggestion (Gemini or fallback) | 200 | 7699 | PASS |
| 21 | Owner analytics dashboard | 200 | 220 | PASS |
| 22 | Employee blocked from analytics (403) | 403 | 12 | PASS |
| 23 | Tenant isolation: other organisation's location hidden (404) | 404 | 14 | PASS |
| 24 | Logout | 204 | 3 | PASS |
| 25 | Session cleared after logout (401) | 401 | 3 | PASS |

**Result: 25 / 25 steps passed.**

**Observations**
- Typical read/write requests complete in **10–100 ms** locally, well inside the SRS target (p95 < 300 ms reads / < 500 ms writes).
- Steps involving password hashing (sign-up, invite, login, password change: ~0.4–1.3 s) are slow **by design** — bcrypt cost 12 deliberately makes each hash expensive to resist password cracking.
- The AI suggestion (~7.7 s) is dominated by the external Gemini call; the UI shows a progress state and the server enforces a 20 s timeout with fallback.

**Defect found and fixed by the smoke test:** the first run failed step 10 — invited employees could keep using the temporary password shown to their manager. Invites now require the employee to set their own password on first login, matching the owner password-reset flow. Tests were updated and the full suite re-run (all pass).

---

## 5. Live Demonstration Script (≈ 10 minutes)

Demo data: organisation **Corner Mart** (1 owner, 1 manager, 6 employees, 3 weeks of history).

| # | Act | Who | What to show | Requirement shown |
|---|---|---|---|---|
| 1 | The problem | — | Paper roster + WhatsApp swap chaos (persona slide) | Week 1 |
| 2 | Sign in | Manager (Maya) | Role-aware dashboard; sidebar shows manager tools | FR-A3, FR-A8 |
| 3 | Build the roster | Manager | Week grid, hours/cost; add an overlapping shift → conflict warnings and blocked save | FR-R1–R7 |
| 4 | AI suggestion | Manager | "Suggest with AI" → staffing needs → Gemini proposal with explanation → apply as drafts → publish | FR-N7, FR-R9 |
| 5 | Requests inbox | Manager | Approve a time-off request; review a swap | FR-V4, FR-S4 |
| 6 | Employee view | Employee (Alex), phone-width | My schedule; Swap button; clock-in card | FR-T1, FR-S1 |
| 7 | Attendance | Manager | Today board: on-time / late / no-show; correct a record with a note (audited) | FR-T5–T9 |
| 8 | Timesheets | Manager | Scheduled vs actual hours, overtime, CSV download | FR-N1–N3 |
| 9 | Admin analytics | Owner | KPIs and charts for the last 3 weeks | Week 9 |
| 10 | Quality | — | Test run (150 passing) and smoke test (25/25) | NFR-M1 |

Backup plan: if the internet is unavailable, the AI step automatically uses the built-in scheduler, and every other step runs fully offline on the local stack.

---

## 6. Requirements Coverage (from Week 2 SRS)

| Requirement group | Total | Implemented | Remaining |
|---|---|---|---|
| FR-A Authentication & organisation | 10 | 10 | — |
| FR-R Roster builder | 11 | 11 | — |
| FR-V Availability & time off | 5 | 5 | — |
| FR-S Shift swaps | 9 | 9 | — |
| FR-T Attendance | 9 | 9 | — |
| FR-N Timesheets, notifications, AI | 8 | 8 | Real email delivery needs a provider key (currently logged) |
| **Total** | **52** | **52** | |

Non-functional requirements already evidenced: bcrypt cost 12 (NFR-S1), secure cookies (NFR-S2), authenticated endpoints (NFR-S3), tenant isolation tests (NFR-S4), auth rate limit (NFR-S6), atomic swaps and publishing (NFR-A3). Still to measure in Weeks 10–11: test coverage ≥ 70 %, Lighthouse performance/accessibility, load-test latency, production uptime and HTTPS grade.

---

## 7. Challenges, Risks & Mitigations

| Item | Impact | Mitigation / Status |
|---|---|---|
| Gemini free tier unavailable on the university Google account | AI calls were refused | New key from a personal account; app also falls back automatically |
| Gemini models occasionally overloaded (HTTP 503) | AI suggestion fails | Automatic retry on a lighter model, then deterministic scheduler; failure reason logged |
| Free hosting tiers sleep when idle (Render) | Slow first request in demos | Warm-up ping before demos; health-check monitor (Week 11) |
| Email provider not yet configured | Emails only written to server log | Add Resend or SMTP credentials before deployment |
| Time zones and overnight shifts | Wrong conflict or hours calculations | All times in UTC + location time zone; dedicated unit tests |

---

## 8. Plan for the Second Half

| Week | Focus | Key deliverables |
|---|---|---|
| 8–9 | Finish integrations & polish | Connect real email provider; final responsive review at 360 px |
| 10 | Testing & security | Coverage report (target ≥ 70 % on domain logic), `npm audit` fixes, OWASP Top 10 checklist, input sanitisation review |
| 11 | Deployment & CI/CD | Live HTTPS URLs on Vercel / Render / Neon; GitHub Actions running lint, type-check and tests on every pull request; production health checks |
| 12 | Final defense | Final FYP report, slide deck and live defense demo |

---

*Submitted by Saniya (24-ST-045) to Dr. Zaigham Mushtaq — Week 7 Midterm, PTUT-PRJ-039.*
