# Product

<!-- impeccable:product-schema 1 -->

> Written from `docs/SPEC.md` and the codebase. The user delegated the init interview
> ("proceed with whatever you think is best"), so items marked _(inferred)_ are not yet confirmed.

## Platform

web

## Users

- **Managers / owners of small shops, cafés and food outlets.** They build the weekly roster, approve
  swaps and time off, watch attendance, and pull timesheets for payroll. Usually on a laptop in the back
  office, often early in the day or between rushes, with little patience for admin. _(situation inferred)_
- **Hourly employees.** They check their shifts, set availability, ask for swaps or time off, and clock
  in/out. Almost always on a phone, often one-handed at the shop door. _(device inferred)_

## Product Purpose

Replace paper/spreadsheet rosters and chaotic WhatsApp swap threads with one source of truth for who is
working when. Success: a manager builds and publishes a week in minutes with conflicts caught before the
team sees them; employees always know their next shift; payroll hours come from real clock records.

## Positioning

The roster is checked, not just drawn: a conflict engine flags overlaps, availability and time-off clashes,
weekly-hour limits and short rest before anything is published, and swaps are re-checked before approval.

## Operating Context

- Weekly rhythm: build → publish → swaps/time-off during the week → clock in/out → timesheets.
- Multi-location, per-location timezone (seed org uses Asia/Karachi; money is PKR in the demo). _(currency handling inferred)_
- Notifications in-app and by email; optional Gemini-powered roster suggestions.

## Capabilities and Constraints

- Roles: OWNER, MANAGER, EMPLOYEE. Shift status DRAFT | PUBLISHED. Swap status
  PENDING | ACCEPTED | APPROVED | REJECTED | CANCELLED. Attendance: on time, LATE, NO_SHOW, EARLY_LEAVE.
- Stack is fixed: React + Vite + TypeScript + Tailwind v4 client, Express + Prisma server.
- University project (PTUT-PRJ-039) with weekly reports; existing tests must keep passing.

## Brand Commitments

- Name: **ShiftSync**. No logo asset beyond a wordmark. No other binding brand assets.

## Evidence on Hand

- Seed demo organisation "Corner Mart" with owner, manager and employees (`server/prisma/seed.ts`).
- No real customers, testimonials, pricing or usage numbers exist. Do not invent them.

## Product Principles

1. Trouble is the loudest thing on screen: gaps, conflicts and lateness outrank decoration.
2. Publishing is an event the team feels: reviewed, stamped, reversible.
3. The employee's next shift is always one glance away.
4. Speak like a shift lead, not a wellness brand: plain, specific, time-stamped.

## Accessibility & Inclusion

WCAG 2.1 AA: 4.5:1 text contrast, keyboard-complete flows, state never conveyed by colour or hover alone.
