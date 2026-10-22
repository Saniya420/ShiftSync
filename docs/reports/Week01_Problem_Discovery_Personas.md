# ShiftSync — Week 1 Progress Report

**Automated Employee Shift Scheduling & Attendance App**
**Milestone:** Problem Discovery & User Personas

| Field | Detail |
|---|---|
| Project ID | PTUT-PRJ-039 |
| Project Title | ShiftSync – Automated Employee Shift Scheduling & Attendance App |
| Track | 4. Local Commerce, SMB & Retail Operations |
| Student | Saniya |
| Roll Number | 24-ST-045 |
| Email | 24-st-045@students.ptut.edu.pk |
| Supervisor | Dr. Zaigham Mushtaq |
| Reporting Week | Week 1 of 12 |

---

## 1. Summary of Work Completed

- Conducted discovery interviews with store managers and hourly staff of small retail and food outlets (see the interview log in Section 2.2).
- Synthesised the findings into two detailed user personas: a Store Manager and an Hourly Employee.
- Finalised a one-paragraph problem statement.
- Defined and prioritised the 5 core MVP features, each with acceptance criteria.
- Selected a preliminary technology stack and initialised the Git repository with a written product specification (`docs/SPEC.md`).

---

## 2. Problem Discovery

### 2.1 Method

Semi-structured interviews (15–20 minutes each) were held with people who create or work from shift rosters in small businesses. Every interview followed the same guide so answers could be compared:

1. How do you build next week's schedule today, and how long does it take?
2. What happens when someone can't make their shift? Walk me through the last time.
3. How are attendance and hours recorded for payroll?
4. What tools do you already use (paper, Excel, WhatsApp, POS)? What frustrates you about them?
5. If you could fix one thing about scheduling, what would it be?

### 2.2 Interview Log

| # | Interviewee Role | Business Type | Staff Size | Date |
|---|---|---|---|---|
| 1 | Store Manager | Convenience store / mart | [fill] | [fill] |
| 2 | Shift Supervisor | Fast-food outlet | [fill] | [fill] |
| 3 | Owner-Manager | Pharmacy / retail | [fill] | [fill] |
| 4 | Part-time Cashier (student) | Supermarket | — | [fill] |
| 5 | Full-time Sales Associate | Clothing retail | — | [fill] |

### 2.3 Key Findings (Operational Friction)

| Theme | What We Heard / Observed | Impact |
|---|---|---|
| Manual roster building | Rosters are written on paper or in a spreadsheet every week and photographed into a WhatsApp group. | 3–5 manager hours per week; frequent copying errors. |
| Chaotic shift swaps | Swap and cover requests arrive as WhatsApp messages and calls; agreements are verbal and the manager often finds out late. | Uncovered shifts; disputes over who agreed to what. |
| Hidden conflicts | Staff are scheduled on days they said they were unavailable, or given back-to-back closing/opening shifts. | Last-minute absences; low morale. |
| Unreliable attendance | Attendance is kept in a register or not at all; late arrivals are rarely recorded. | Payroll disputes; no data for performance discussions. |
| No visibility of cost | Managers do not know weekly labour hours or cost until payroll. | Overtime and over-staffing go unnoticed. |

---

## 3. User Personas

### Persona 1 — Ayesha Khan, Store Manager

| Attribute | Detail |
|---|---|
| Role | Store Manager, neighbourhood convenience mart (12 staff, open 8 am–12 am, 7 days a week) |
| Age / Tech Comfort | 34 · uses WhatsApp, Excel and the store POS daily; prefers phone over laptop |
| Goals | Publish a fair, fully covered weekly roster quickly; keep labour cost within budget; know who is actually on the floor. |
| Daily Tasks | Opens/closes the store, handles suppliers, builds the roster on Sunday night, answers staff messages about swaps. |
| Pain Points | • Spends ~4 hours each week on the roster.<br>• Swap requests are buried in WhatsApp; finds out about no-shows only when customers are waiting.<br>• No record of lateness; payroll hours are reconstructed from memory. |
| Needs from ShiftSync | Week-grid roster builder with automatic conflict warnings; one-tap approval of swaps; live attendance view; weekly hours and cost totals. |
| Quote | *"I spend my Sunday night fixing the roster, and by Tuesday half of it has changed on WhatsApp."* |

### Persona 2 — Bilal Ahmed, Part-time Cashier

| Attribute | Detail |
|---|---|
| Role | Part-time cashier and university student (20–28 hours/week) |
| Age / Tech Comfort | 21 · smartphone-first, expects app-like experiences |
| Goals | Shifts that fit around classes and exams; an easy way to swap shifts; correct pay for hours worked. |
| Daily Tasks | Checks the roster photo in WhatsApp, coordinates swaps with coworkers, works evening shifts. |
| Pain Points | • Roster is shared late and changes without notice.<br>• Scheduled during class times despite telling the manager.<br>• Swapping requires messaging many coworkers and then convincing the manager. |
| Needs from ShiftSync | Personal schedule on the phone; set availability once; post a shift for swap and get notified when approved; clock in/out with proof of hours. |
| Quote | *"I told them I have classes on Tuesday, but I still get Tuesday shifts every other week."* |

---

## 4. Problem Statement

Owners and managers of small retail and food businesses spend several hours every week building staff rosters by hand on paper or spreadsheets, and then manage changes through unstructured WhatsApp messages and phone calls. Because availability, time-off and swap agreements are not recorded in one place, rosters frequently contain conflicts, shifts go uncovered, attendance is not tracked reliably, and payroll hours are disputed. **ShiftSync** is a mobile-friendly web application that lets managers build and publish conflict-checked weekly rosters in minutes, lets employees manage their availability and request swaps or time off through a manager-approved workflow, and records clock-in/clock-out attendance to produce accurate timesheets — replacing paper schedules and WhatsApp chaos with a single source of truth.

---

## 5. Core MVP Features

| # | Feature | Description | Acceptance Criteria |
|---|---|---|---|
| 1 | Weekly Roster Builder | Week grid (employees × days) to create, edit, copy and publish shifts, showing weekly hours and labour cost. | Manager can build and publish a 7-day roster; conflicts (overlap, unavailability, time-off, max weekly hours, < 10 h rest) are flagged before publishing. |
| 2 | Availability & Time-Off | Employees set recurring weekly availability and submit time-off requests. | Manager approves/denies requests; approved time-off blocks scheduling. |
| 3 | Shift Swap & Cover | Employee offers a shift to a specific coworker or as an open shift; a coworker accepts; the manager approves. | Roster updates atomically on approval; all parties are notified; conflicts are re-checked. |
| 4 | Attendance (Clock-in/out) | Employees clock in/out against scheduled shifts, optionally verified by PIN and location radius. | Late, no-show and early-leave statuses are computed automatically; manager corrections are audited. |
| 5 | Timesheets & Notifications | Scheduled vs. actual hours, overtime and CSV export; in-app notifications. | Timesheet totals match attendance records; users are notified of publish, swap and time-off decisions. |

---

## 6. Technology Decisions (Preliminary)

- **Frontend:** React + TypeScript + Vite + Tailwind CSS (responsive web app usable on phones).
- **Backend:** Node.js + Express + TypeScript REST API with Zod input validation.
- **Database:** PostgreSQL with Prisma ORM; multi-tenant design (each business is an organisation).
- **Security:** bcrypt password hashing, JWT in httpOnly cookies, role-based access (Owner, Manager, Employee).
- **Deployment (Week 11):** Vercel (frontend), Render (API), Neon/Supabase (database), GitHub Actions CI.

---

## 7. Plan for Week 2

- Write the IEEE 830 Software Requirements Specification (SRS).
- Create use-case specifications and the system use-case diagram.
- Define quantifiable non-functional requirements (latency, security, uptime).

---

## 8. Challenges & Risks

- **Adoption:** employees may resist a new app — mitigated by a phone-friendly web UI that needs no installation.
- **Location accuracy:** GPS-based clock-in can be inaccurate indoors — the geofence will be optional, with a PIN fallback.
- **Time handling:** time zones and overnight shifts complicate calculations — all times are stored in UTC with a per-location time zone.

---

*Submitted by Saniya (24-ST-045) to Dr. Zaigham Mushtaq — Week 1, PTUT-PRJ-039.*
