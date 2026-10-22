const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, LevelFormat, BorderStyle, Footer, PageNumber,
} = require("docx");

const FONT = "Calibri";
const ACCENT = "1F4E79";
const TABLE_W = 9360;

const p = (text, opts = {}) =>
  new Paragraph({ spacing: { after: 120 }, ...opts, children: [new TextRun({ text, font: FONT, size: 22, ...(opts.run || {}) })] });
const rich = (runs, opts = {}) =>
  new Paragraph({ spacing: { after: 120 }, ...opts, children: runs.map(([t, b]) => new TextRun({ text: t, bold: !!b, font: FONT, size: 22 })) });
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 }, children: [new TextRun({ text: t, font: FONT, color: ACCENT })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 }, children: [new TextRun({ text: t, font: FONT, color: ACCENT })] });
const bullet = (t, boldLead) =>
  new Paragraph({
    numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 },
    children: boldLead
      ? [new TextRun({ text: boldLead, bold: true, font: FONT, size: 22 }), new TextRun({ text: t, font: FONT, size: 22 })]
      : [new TextRun({ text: t, font: FONT, size: 22 })],
  });

function table(headers, rows, widths) {
  const cell = (text, header, w) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA },
      shading: header ? { type: ShadingType.CLEAR, fill: ACCENT, color: "auto" } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: String(text).split("\n").map((line) =>
        new Paragraph({ children: [new TextRun({ text: line, bold: header, color: header ? "FFFFFF" : undefined, font: FONT, size: 20 })] })),
    });
  return new Table({
    width: { size: TABLE_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, true, widths[i])) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, false, widths[i])) })),
    ],
  });
}

const kv = (rows) => table(["Field", "Detail"], rows, [2600, 6760]);

const children = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "ShiftSync", bold: true, size: 48, font: FONT, color: ACCENT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "Automated Employee Shift Scheduling & Attendance App", size: 26, font: FONT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 8 } },
    children: [new TextRun({ text: "Week 1 Progress Report — Problem Discovery & User Personas", bold: true, size: 26, font: FONT })] }),
  kv([
    ["Project ID", "PTUT-PRJ-039"],
    ["Track", "4. Local Commerce, SMB & Retail Operations"],
    ["Student", "Saniya"],
    ["Roll number", "24-ST-045"],
    ["Supervisor", "Dr. Zaigham Mushtaq"],
    ["Reporting week", "Week 1 of 12"],
    ["Milestone", "Problem Discovery & User Personas"],
  ]),

  h1("1. Summary of Work Completed"),
  bullet("Conducted discovery interviews with store managers and hourly staff of small retail/food outlets (interview log in Section 2)."),
  bullet("Synthesised findings into two detailed user personas (Store Manager and Hourly Employee)."),
  bullet("Finalised a one-paragraph problem statement."),
  bullet("Defined and prioritised the 5 core MVP features with acceptance criteria."),
  bullet("Selected the technology stack and initialised the Git repository with a written product specification (docs/SPEC.md)."),

  h1("2. Problem Discovery"),
  h2("2.1 Method"),
  p("Semi-structured interviews (15–20 minutes each) were held with people who create or work from shift rosters in small businesses. Each interview followed the same guide so answers could be compared:"),
  bullet("How do you build next week's schedule today, and how long does it take?"),
  bullet("What happens when someone can't make their shift? Walk me through the last time."),
  bullet("How are attendance and hours recorded for payroll?"),
  bullet("What tools do you already use (paper, Excel, WhatsApp, POS)? What frustrates you about them?"),
  bullet("If you could fix one thing about scheduling, what would it be?"),
  h2("2.2 Interview Log"),
  table(
    ["#", "Interviewee role", "Business type", "Staff size", "Date"],
    [
      ["1", "Store Manager", "Convenience store / mart", "[fill]", "[fill]"],
      ["2", "Shift Supervisor", "Fast-food outlet", "[fill]", "[fill]"],
      ["3", "Owner-Manager", "Pharmacy / retail", "[fill]", "[fill]"],
      ["4", "Part-time Cashier (student)", "Supermarket", "—", "[fill]"],
      ["5", "Full-time Sales Associate", "Clothing retail", "—", "[fill]"],
    ],
    [500, 2700, 2660, 1500, 2000],
  ),
  h2("2.3 Key Findings (Operational Friction)"),
  table(
    ["Theme", "What we heard / observed", "Impact"],
    [
      ["Manual roster building", "Rosters are written on paper or in a spreadsheet every week and photographed into a WhatsApp group.", "3–5 manager hours per week; frequent copying errors."],
      ["Chaotic shift swaps", "Swap and cover requests arrive as WhatsApp messages and calls; agreements are verbal and the manager often finds out late.", "Uncovered shifts, disputes over who agreed to what."],
      ["Hidden conflicts", "Staff get scheduled on days they said they were unavailable, or with back-to-back closing/opening shifts.", "Last-minute absences, low morale."],
      ["Unreliable attendance", "Attendance kept in a register or not at all; late arrivals rarely recorded.", "Payroll disputes and no data for performance discussions."],
      ["No visibility of cost", "Managers do not know weekly labour hours or cost until payroll.", "Overtime and over-staffing go unnoticed."],
    ],
    [2200, 4660, 2500],
  ),

  h1("3. User Personas"),
  h2("Persona 1 — Ayesha Khan, Store Manager"),
  kv([
    ["Role", "Store Manager, neighbourhood convenience mart (12 staff, open 8am–12am, 7 days)"],
    ["Age / tech comfort", "34 · uses WhatsApp, Excel and the store POS daily; prefers phone over laptop"],
    ["Goals", "Publish a fair, fully-covered weekly roster quickly; keep labour cost within budget; know who is actually on the floor."],
    ["Daily tasks", "Opens/closes store, handles suppliers, builds roster on Sunday night, answers staff messages about swaps."],
    ["Pain points", "Spends ~4 hours each week on the roster.\nSwap requests buried in WhatsApp; finds out about no-shows only when customers are waiting.\nNo record of lateness; payroll hours reconstructed from memory."],
    ["Needs from ShiftSync", "Drag-and-drop week grid with automatic conflict warnings; one-tap approval of swaps; live attendance view; weekly hours and cost totals."],
    ["Quote", "“I spend my Sunday night fixing the roster, and by Tuesday half of it has changed on WhatsApp.”"],
  ]),
  h2("Persona 2 — Bilal Ahmed, Part-time Cashier"),
  kv([
    ["Role", "Part-time cashier and university student (20–28 hrs/week)"],
    ["Age / tech comfort", "21 · smartphone-first, expects app-like experiences"],
    ["Goals", "Shifts that fit around classes and exams; easy way to swap shifts; be paid correctly for the hours worked."],
    ["Daily tasks", "Checks the roster photo in WhatsApp, coordinates swaps with coworkers, works evening shifts."],
    ["Pain points", "Roster is shared late and changes without notice.\nScheduled during class times despite telling the manager.\nSwapping requires messaging many coworkers and then convincing the manager."],
    ["Needs from ShiftSync", "Personal schedule on phone; set availability once; post a shift for swap and get notified when approved; clock in/out with proof of hours."],
    ["Quote", "“I told them I have classes on Tuesday, but I still get Tuesday shifts every other week.”"],
  ]),

  h1("4. Problem Statement"),
  p("Owners and managers of small retail and food businesses spend several hours every week building staff rosters by hand on paper or spreadsheets, and then manage changes through unstructured WhatsApp messages and phone calls. Because availability, time-off and swap agreements are not recorded in one place, rosters frequently contain conflicts, shifts go uncovered, attendance is not tracked reliably, and payroll hours are disputed. ShiftSync is a mobile-friendly web application that lets managers build and publish conflict-checked weekly rosters in minutes, lets employees manage their availability and request swaps or time off through a manager-approved workflow, and records clock-in/clock-out attendance to produce accurate timesheets — replacing paper schedules and WhatsApp chaos with a single source of truth."),

  h1("5. Core MVP Features"),
  table(
    ["#", "Feature", "Description", "Acceptance criteria"],
    [
      ["1", "Weekly Roster Builder", "Week grid (employees × days) to create, edit, copy and publish shifts, with weekly hours and labour cost.", "Manager can build and publish a 7-day roster; conflicts (overlap, unavailability, time-off, max hours, <10h rest) are flagged before publishing."],
      ["2", "Availability & Time-Off", "Employees set recurring weekly availability and submit time-off requests.", "Manager approves/denies requests; approved time-off blocks scheduling."],
      ["3", "Shift Swap & Cover", "Employee offers a shift to a coworker or as an open shift; coworker accepts; manager approves.", "Roster updates atomically on approval; all parties notified; conflicts re-checked."],
      ["4", "Attendance (Clock-in/out)", "Employees clock in/out against scheduled shifts, optionally verified by PIN and location radius.", "Late, no-show and early-leave statuses computed automatically; manager corrections are audited."],
      ["5", "Timesheets & Notifications", "Scheduled vs actual hours, overtime and CSV export; in-app notifications.", "Timesheet totals match attendance records; users notified of publish, swap and time-off decisions."],
    ],
    [500, 2000, 3360, 3500],
  ),

  h1("6. Technology Decisions (Preliminary)"),
  bullet("React + TypeScript + Vite + Tailwind CSS (responsive web app usable on phones).", "Frontend: "),
  bullet("Node.js + Express + TypeScript REST API with Zod validation.", "Backend: "),
  bullet("PostgreSQL with Prisma ORM; multi-tenant (each business is an organisation).", "Database: "),
  bullet("bcrypt password hashing and JWT in httpOnly cookies; role-based access (Owner, Manager, Employee).", "Security: "),
  bullet("Vercel (frontend), Render (API), Neon/Supabase (database), GitHub Actions CI.", "Deployment (Week 11): "),

  h1("7. Plan for Week 2"),
  bullet("Write the IEEE 830 Software Requirements Specification."),
  bullet("Create use-case specifications and the system use-case diagram."),
  bullet("Define quantifiable non-functional requirements (latency, security, uptime)."),

  h1("8. Challenges & Risks"),
  bullet("Employees may resist a new app — mitigated by a phone-friendly UI with no install required."),
  bullet("GPS-based clock-in can be inaccurate indoors — geofence will be optional, with PIN fallback."),
  bullet("Time-zone and overnight shifts complicate calculations — all times stored in UTC with a per-location time zone."),
];

const doc = new Document({
  creator: "Saniya (24-ST-045)",
  title: "ShiftSync — Week 1 Report",
  styles: { default: { document: { run: { font: FONT, size: 22 } } } },
  numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [{
    properties: { page: { margin: { top: 1200, bottom: 1200, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "ShiftSync · PTUT-PRJ-039 · Week 1 · Page ", size: 18, font: FONT, color: "808080" }),
      new TextRun({ children: [PageNumber.CURRENT], size: 18, font: FONT, color: "808080" }),
    ] })] }) },
    children,
  }],
});

const out = path.join(__dirname, "..", "Week01_Problem_Discovery_Personas.docx");
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(out, buf); console.log("wrote", out); });
