import { DateTime } from 'luxon';
interface Span {
  startsAt: Date;
  endsAt: Date;
}
interface Entry extends Span {
  selected?: boolean;
  userId: string | null;
  clockInGraceMin: number;
  attendance: { clockInAt: Date | null; clockOutAt: Date | null }[];
}
export function calculateTimesheets(
  users: { id: string; name: string; hourlyRate: number; maxWeeklyHours: number }[],
  shifts: Entry[],
  from: Date,
  to: Date,
  timezone: string,
) {
  const clipped = (s: Span, start: Date, end: Date) =>
    Math.max(0, Math.min(+s.endsAt, +end) - Math.max(+s.startsAt, +start)) / 3600000;
  return users.map((user) => {
    const own = shifts.filter((s) => s.userId === user.id);
    const actual = own
      .flatMap((s) =>
        s.attendance.flatMap((a) =>
          a.clockInAt && a.clockOutAt
            ? [{ startsAt: a.clockInAt, endsAt: a.clockOutAt, selected: s.selected !== false }]
            : [],
        ),
      )
      .sort((a, b) => +a.startsAt - +b.startsAt);
    const scheduledHours = own
      .filter((s) => s.selected !== false)
      .reduce((sum, s) => sum + clipped(s, from, to), 0);
    const actualHours = actual
      .filter((s) => s.selected)
      .reduce((sum, s) => sum + clipped(s, from, to), 0);
    let overtimeHours = 0;
    for (
      let week = DateTime.fromJSDate(from, { zone: timezone }).startOf('week');
      +week < +to;
      week = week.plus({ weeks: 1 })
    ) {
      const start = week.toJSDate(),
        end = week.plus({ weeks: 1 }).toJSDate();
      let worked = 0;
      for (const s of actual) {
        const duration = clipped(s, start, end);
        if (s.selected && duration) {
          const overtimeStart = new Date(
            Math.max(+s.startsAt, +start) +
              Math.min(duration, Math.max(0, user.maxWeeklyHours - worked)) * 3600000,
          );
          overtimeHours += clipped(
            { startsAt: overtimeStart, endsAt: new Date(Math.min(+s.endsAt, +end)) },
            from,
            to,
          );
        }
        worked += duration;
      }
    }
    const lateCount = own.filter(
      (s) =>
        s.selected !== false &&
        s.attendance.some(
          (a) =>
            a.clockInAt &&
            a.clockInAt >= from &&
            a.clockInAt < to &&
            +a.clockInAt > +s.startsAt + s.clockInGraceMin * 60000,
        ),
    ).length;
    return {
      userId: user.id,
      name: user.name,
      scheduledHours,
      actualHours,
      overtimeHours,
      lateCount,
      estimatedCost: scheduledHours * user.hourlyRate,
    };
  });
}
export function timesheetsCsv(rows: ReturnType<typeof calculateTimesheets>) {
  const cell = (v: string | number) =>
    '"' +
    String(v)
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return (
    '\uFEFF' +
    [
      [
        'Employee',
        'Scheduled hours',
        'Actual hours',
        'Overtime hours',
        'Late count',
        'Estimated cost',
      ],
      ...rows.map((r) => [
        r.name,
        r.scheduledHours.toFixed(2),
        r.actualHours.toFixed(2),
        r.overtimeHours.toFixed(2),
        r.lateCount,
        r.estimatedCost.toFixed(2),
      ]),
    ]
      .map((r) => r.map(cell).join(','))
      .join('\r\n')
  );
}
