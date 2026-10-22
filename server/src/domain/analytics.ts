import { DateTime } from 'luxon';
export interface AnalyticsShift {
  userId: string | null;
  startsAt: Date;
  endsAt: Date;
  location: { clockInGraceMin: number };
  attendance: { clockInAt: Date | null; clockOutAt: Date | null; status: string }[];
}
export function aggregateAnalytics(input: {
  from: string;
  to: string;
  timezone: string;
  now: Date;
  users: { id: string; name: string; hourlyRate: number }[];
  shifts: AnalyticsShift[];
  swaps: { status: string }[];
  timeOff: { status: string }[];
}) {
  const start = DateTime.fromISO(input.from, { zone: input.timezone }).startOf('day');
  const end = DateTime.fromISO(input.to, { zone: input.timezone }).plus({ days: 1 }).startOf('day');
  const clipped = (a: Date, b: Date, lo: number, hi: number) =>
    Math.max(0, Math.min(+b, hi) - Math.max(+a, lo)) / 3600000;
  const daily: { date: string; scheduledHours: number; actualHours: number; labourCost: number }[] =
    [];
  for (let day = start; day < end; day = day.plus({ days: 1 })) {
    let scheduledHours = 0,
      actualHours = 0,
      labourCost = 0;
    for (const shift of input.shifts) {
      const scheduled = clipped(
        shift.startsAt,
        shift.endsAt,
        day.toMillis(),
        day.plus({ days: 1 }).toMillis(),
      );
      const rate = input.users.find((u) => u.id === shift.userId)?.hourlyRate ?? 0;
      scheduledHours += scheduled;
      labourCost += scheduled * rate;
      for (const record of shift.attendance)
        if (record.clockInAt && record.clockOutAt)
          actualHours += clipped(
            record.clockInAt,
            record.clockOutAt,
            day.toMillis(),
            day.plus({ days: 1 }).toMillis(),
          );
    }
    daily.push({ date: day.toISODate()!, scheduledHours, actualHours, labourCost });
  }
  const eligible = input.shifts.filter((s) => s.userId && s.endsAt <= input.now);
  const arrived = eligible.filter((s) => s.attendance.some((a) => a.clockInAt));
  const late = arrived.filter((s) =>
    s.attendance.some(
      (a) => a.clockInAt && +a.clockInAt > +s.startsAt + s.location.clockInGraceMin * 60000,
    ),
  ).length;
  const noShow = eligible.length - arrived.length;
  const rate = (n: number, d: number) => (d ? (100 * n) / d : 0);
  const decided = input.swaps.filter((s) => ['APPROVED', 'REJECTED'].includes(s.status));
  return {
    kpis: {
      scheduledHours: daily.reduce((n, d) => n + d.scheduledHours, 0),
      actualHours: daily.reduce((n, d) => n + d.actualHours, 0),
      labourCost: daily.reduce((n, d) => n + d.labourCost, 0),
      attendanceRate: rate(arrived.length, eligible.length),
      lateRate: rate(late, eligible.length),
      noShowRate: rate(noShow, eligible.length),
      swapVolume: input.swaps.length,
      swapApprovalRate: rate(decided.filter((s) => s.status === 'APPROVED').length, decided.length),
      timeOffVolume: input.timeOff.length,
      coverage: rate(input.shifts.filter((s) => s.userId).length, input.shifts.length),
    },
    attendance: [
      { name: 'On time', value: arrived.length - late },
      { name: 'Late', value: late },
      { name: 'No show', value: noShow },
    ],
    daily,
    hoursPerEmployee: input.users.map((user) => ({
      userId: user.id,
      name: user.name,
      scheduledHours: input.shifts
        .filter((s) => s.userId === user.id)
        .reduce((n, s) => n + clipped(s.startsAt, s.endsAt, start.toMillis(), end.toMillis()), 0),
      actualHours: input.shifts
        .filter((s) => s.userId === user.id)
        .reduce(
          (n, s) =>
            n +
            s.attendance.reduce(
              (sum, a) =>
                sum +
                (a.clockInAt && a.clockOutAt
                  ? clipped(a.clockInAt, a.clockOutAt, start.toMillis(), end.toMillis())
                  : 0),
              0,
            ),
          0,
        ),
    })),
  };
}
