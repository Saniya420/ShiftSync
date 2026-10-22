# ShiftSync — Week 3 Progress Report

**High-Level Architecture & Cloud Topology**

| Field | Detail |
|---|---|
| Project ID | PTUT-PRJ-039 |
| Project Title | ShiftSync – Automated Employee Shift Scheduling & Attendance App |
| Track | 4. Local Commerce, SMB & Retail Operations |
| Student | Saniya |
| Roll Number | 24-ST-045 |
| Email | 24-st-045@students.ptut.edu.pk |
| Supervisor | Dr. Zaigham Mushtaq |
| Reporting Week | Week 3 of 12 |

---

## Week 3 Summary of Work Completed

- Designed the 3-tier architecture (Client → API Server → Database) and documented each tier's responsibilities.
- Produced the Data Flow Diagrams at Level 0 (context) and Level 1 (major processes and data stores).
- Defined the system boundary: what ShiftSync owns versus what external services provide.
- Selected and justified a zero-cost cloud stack (Vercel, Render, Neon PostgreSQL, GitHub Actions).
- Documented the request lifecycle, security layers and deployment topology.

---

## 1. Architecture Style

ShiftSync uses a **3-tier, client–server architecture** with a single-page application (SPA) front end, a stateless REST API, and a relational database.

| Decision | Choice | Reason |
|---|---|---|
| Architecture | 3-tier monolith API (modular) | Small team and scope; one deployable API is simpler to build, test and host for free than microservices. |
| API style | REST + JSON | Simple CRUD-heavy domain; easy to test with Supertest and document. |
| Database | Relational (PostgreSQL) | Strong relations (organisation → location → shift → attendance), transactions for swaps/publishing, constraints against double-booking. |
| State | Stateless API (JWT in cookie) | Allows horizontal scaling and free-tier restarts without losing sessions. |
| Multi-tenancy | Shared database, `organizationId` on every row | Lowest cost; isolation enforced in the API layer and by composite foreign keys. |

---

## 2. 3-Tier Architecture Diagram

```mermaid
flowchart TB
    subgraph T1["Tier 1 — Presentation (Client)"]
        Browser["Browser / Phone<br/>React 18 + TypeScript SPA<br/>Tailwind CSS · React Router · TanStack Query"]
    end

    subgraph T2["Tier 2 — Application (API Server)"]
        direction TB
        MW["Middleware<br/>Helmet · CORS · Rate limit · Origin check · Pino logging"]
        AUTH["Auth & RBAC<br/>JWT cookie · bcrypt · requireRole"]
        ROUTES["REST Routes<br/>/auth /locations /users /availability /shifts<br/>/time-off /swaps /attendance /timesheets /notifications"]
        DOMAIN["Domain Layer (pure functions)<br/>Conflict engine · Swap state machine<br/>Attendance status · Timesheet calc"]
        JOB["Background Job<br/>No-show detector"]
        ORM["Prisma ORM"]
        MW --> AUTH --> ROUTES --> DOMAIN
        ROUTES --> ORM
        JOB --> ORM
    end

    subgraph T3["Tier 3 — Data"]
        DB[("PostgreSQL<br/>Organizations · Locations · Users · Shifts<br/>Availability · TimeOff · Swaps · Attendance<br/>Notifications · AuditLog")]
    end

    EXT1["Google Gemini API<br/>(Week 8)"]
    EXT2["Email / Messaging API<br/>(Week 8)"]

    Browser -- "HTTPS · JSON · httpOnly cookie" --> MW
    ORM -- "TLS · SQL" --> DB
    ROUTES -. "HTTPS" .-> EXT1
    ROUTES -. "HTTPS" .-> EXT2
```

### 2.1 Tier Responsibilities

| Tier | Technology | Responsibilities |
|---|---|---|
| Presentation | React 18, TypeScript, Vite, Tailwind CSS | Render role-aware screens; client-side routing and route guards; caching and refetching API data; form validation for fast feedback; geolocation capture for clock-in; toast notifications. |
| Application | Node.js 20, Express, TypeScript, Zod, Prisma | Authentication and RBAC; tenant scoping on every query; server-side validation; business rules (conflicts, swaps, attendance, timesheets); transactions; notifications; scheduled no-show detection; structured logging and health check. |
| Data | PostgreSQL | Durable storage; foreign keys and composite keys enforcing tenant consistency; unique constraint preventing duplicate active swaps; indexes for week/location/user queries; managed backups. |

### 2.2 Request Lifecycle (Example: Manager approves a swap)

```mermaid
sequenceDiagram
    participant M as Manager (Browser)
    participant API as Express API
    participant D as Domain Layer
    participant DB as PostgreSQL

    M->>API: POST /api/swaps/:id/approve (cookie)
    API->>API: Helmet, CORS, origin check
    API->>API: Verify JWT, load user, requireRole(MANAGER)
    API->>DB: Load swap + shift scoped by organizationId
    API->>D: canTransition(ACCEPTED → APPROVED)?
    API->>DB: Load acceptor's shifts, availability, time off
    API->>D: detectConflicts(newAssignment)
    alt hard conflict and no override
        API-->>M: 409 SHIFT_OVERLAP + warnings
    else ok
        API->>DB: BEGIN; update shift.userId; swap.status=APPROVED; insert notifications; COMMIT
        API-->>M: 200 updated swap
    end
```

---

## 3. Data Flow Diagrams

### 3.1 DFD Level 0 — Context Diagram

```mermaid
flowchart LR
    OW["Owner"]
    MG["Manager"]
    EM["Employee"]
    GM["Gemini AI<br/>(external)"]
    NT["Email / Messaging<br/>Provider (external)"]

    SYS(("0<br/>ShiftSync<br/>System"))

    OW -- "org details, locations, managers" --> SYS
    SYS -- "org dashboard, reports" --> OW
    MG -- "shifts, publish command, approvals, attendance corrections" --> SYS
    SYS -- "roster with conflict warnings, request inbox, attendance board, timesheets CSV" --> MG
    EM -- "credentials, availability, time-off & swap requests, clock-in/out + location/PIN" --> SYS
    SYS -- "personal schedule, open shifts, request status, notifications" --> EM
    SYS -- "staffing constraints" --> GM
    GM -- "suggested roster" --> SYS
    SYS -- "notification messages" --> NT
```

### 3.2 DFD Level 1 — Major Processes

```mermaid
flowchart TB
    MG["Manager / Owner"]
    EM["Employee"]

    P1(("1.0<br/>Authenticate &<br/>Manage Accounts"))
    P2(("2.0<br/>Manage Roster"))
    P3(("3.0<br/>Manage Availability<br/>& Time Off"))
    P4(("4.0<br/>Process Shift<br/>Swaps"))
    P5(("5.0<br/>Record<br/>Attendance"))
    P6(("6.0<br/>Generate Timesheets<br/>& Notifications"))

    D1[("D1 Users & Organisations")]
    D2[("D2 Locations")]
    D3[("D3 Shifts")]
    D4[("D4 Availability & Time Off")]
    D5[("D5 Swap Requests")]
    D6[("D6 Attendance Records")]
    D7[("D7 Notifications & Audit Log")]

    MG -- "credentials, invites" --> P1
    EM -- "credentials" --> P1
    P1 <--> D1
    P1 -- "session (JWT)" --> MG
    P1 -- "session (JWT)" --> EM

    MG -- "shift details, publish" --> P2
    P2 <--> D3
    P2 -- "read" --> D4
    P2 -- "read" --> D2
    P2 -- "roster + warnings" --> MG
    P2 -- "published events" --> P6

    EM -- "availability, time-off request" --> P3
    MG -- "approve / deny" --> P3
    P3 <--> D4
    P3 -- "decision events" --> P6

    EM -- "offer / accept swap" --> P4
    MG -- "approve / reject" --> P4
    P4 <--> D5
    P4 -- "reassign" --> D3
    P4 -- "conflict check data" --> D4
    P4 -- "swap events" --> P6

    EM -- "clock-in/out, lat/lng, PIN" --> P5
    MG -- "corrections" --> P5
    P5 -- "read shift" --> D3
    P5 -- "read geofence" --> D2
    P5 <--> D6
    P5 -- "no-show / correction events" --> P6

    MG -- "date range" --> P6
    P6 -- "read" --> D3
    P6 -- "read" --> D6
    P6 <--> D7
    P6 -- "timesheets, CSV" --> MG
    P6 -- "notifications" --> EM
```

### 3.3 Process Descriptions

| Process | Inputs | Outputs | Data Stores |
|---|---|---|---|
| 1.0 Authenticate & Manage Accounts | Sign-up/login data, invitations | Session cookie, new accounts | D1 |
| 2.0 Manage Roster | Shift details, week, publish command | Draft/published shifts, conflict warnings, hours & cost | D2, D3, D4 |
| 3.0 Manage Availability & Time Off | Availability windows, time-off requests, decisions | Updated availability, request status | D4 |
| 4.0 Process Shift Swaps | Offers, acceptances, approvals | Reassigned shift, swap status | D3, D4, D5 |
| 5.0 Record Attendance | Clock events, location, PIN, corrections | Attendance status (on-time/late/no-show/early leave) | D2, D3, D6, D7 |
| 6.0 Generate Timesheets & Notifications | Date range, events from 2.0–5.0 | Timesheets, CSV, notifications | D3, D6, D7 |

---

## 4. System Boundaries

```mermaid
flowchart LR
    subgraph Inside["Inside the ShiftSync boundary (we build & own)"]
        A[React SPA]
        B[Express REST API]
        C[Domain rules: conflicts, swaps, attendance, timesheets]
        D[(PostgreSQL schema & data)]
        E[No-show background job]
    end
    subgraph Outside["Outside the boundary (external / provided)"]
        F[User's browser & device GPS]
        G[Google Gemini API]
        H[Email / messaging provider]
        I[Hosting: Vercel, Render, Neon]
        J[GitHub & GitHub Actions]
        K[Payroll / POS systems — not integrated]
    end
    F --- A
    B -.-> G
    B -.-> H
```

| In Scope (inside boundary) | Out of Scope (outside boundary) |
|---|---|
| Accounts, organisations, locations, roles | Payroll calculation and salary payment |
| Roster building, conflict detection, publishing | POS / inventory integration |
| Availability, time off, swaps, approvals | Native iOS/Android apps (web is responsive) |
| Attendance capture and status rules | Biometric or hardware time clocks |
| Timesheets, CSV export, in-app notifications | Legal labour-law compliance checks per country |
| AI roster suggestions via Gemini (calls out to external API) | Hosting the AI model itself |

**Trust boundaries:** (1) browser ↔ API — all input untrusted, validated with Zod, authenticated by cookie, origin-checked; (2) API ↔ database — private connection string, TLS, least-privilege role; (3) API ↔ external APIs — keys stored only as server environment variables, never sent to the client.

---

## 5. Cloud Infrastructure & Deployment Topology

```mermaid
flowchart LR
    U["Users<br/>(desktop & mobile browsers)"]
    subgraph Vercel["Vercel (free Hobby tier)"]
        FE["Static SPA build<br/>Global CDN · auto HTTPS"]
    end
    subgraph Render["Render (free web service)"]
        BE["Node.js Express API<br/>Docker-less Node runtime<br/>/api/health check"]
    end
    subgraph Neon["Neon (free tier)"]
        PG[("Serverless PostgreSQL<br/>TLS · automatic backups")]
    end
    GH["GitHub repo<br/>+ GitHub Actions CI"]

    U -- "HTTPS" --> FE
    U -- "HTTPS /api" --> BE
    BE -- "TLS" --> PG
    GH -- "deploy on push to main" --> FE
    GH -- "deploy hook" --> BE
    GH -- "lint · typecheck · test" --> GH
```

### 5.1 Stack Justification

| Component | Choice | Alternatives Considered | Justification |
|---|---|---|---|
| Frontend hosting | **Vercel** | Netlify, GitHub Pages | Free tier, global CDN, automatic HTTPS, first-class Vite support, preview deploys per pull request. |
| API hosting | **Render** | Railway, Fly.io, Heroku | Permanent free web service for Node.js, automatic HTTPS, health checks, env-var secrets; Railway/Heroku no longer free. |
| Database | **Neon PostgreSQL** | Supabase, MongoDB Atlas, PlanetScale | Free serverless Postgres with branching and backups; relational model and transactions fit the domain; Supabase is the backup option. |
| ORM | **Prisma** | TypeORM, raw SQL | Type-safe queries shared with TypeScript, versioned migrations, easy seeding. |
| CI/CD | **GitHub Actions** | GitLab CI, CircleCI | Free for public repos and generous for private; native GitHub integration. |
| Auth | **Self-hosted JWT + bcrypt** | Firebase Auth, Auth0 | Course requires implementing secure auth; avoids vendor lock-in and cost. |
| AI (Week 8) | **Google Gemini API** | OpenAI | Free tier available; required by project plan. |

### 5.2 Free-Tier Constraints and Mitigations

| Constraint | Impact | Mitigation |
|---|---|---|
| Render free service sleeps after ~15 min idle | First request after idle takes ~30–50 s | Uptime ping on `/api/health` during demos; loading state in UI. |
| Neon free storage limit (0.5 GB) | Limits data volume | Ample for pilot (~100 orgs); indexes kept lean. |
| Cross-site cookies between Vercel and Render domains | Browsers may block third-party cookies | Proxy `/api` through Vercel rewrites so the cookie is first-party. |

---

## 6. Security Architecture (Summary)

| Layer | Controls |
|---|---|
| Transport | HTTPS everywhere; HSTS via Helmet. |
| Authentication | bcrypt (cost 12); JWT in httpOnly, Secure, SameSite cookie; 7-day expiry. |
| Authorisation | Role middleware (Owner/Manager/Employee); every query filtered by `organizationId` from the token. |
| Input | Zod schemas on every body/query/param; JSON body size limit 100 KB. |
| Abuse | Rate limiting on auth routes; origin check on state-changing requests. |
| Data | Composite foreign keys tie child rows to the same organisation; audit log for attendance corrections. |
| Secrets | Environment variables only; `.env` git-ignored. |

---

## 7. Progress Note

Alongside the design work, the foundation described in this architecture is already implemented and running locally: the React client, Express API with authentication and tenant isolation, PostgreSQL schema with migrations, and the roster conflict engine, with an automated test suite passing.

## Plan for Week 4

- Construct the database Entity-Relationship Diagram with index definitions.
- Specify the complete REST API endpoint contracts.
- Design UI wireframes for the primary application screens.

---

*Submitted by Saniya (24-ST-045) to Dr. Zaigham Mushtaq — Week 3, PTUT-PRJ-039.*
