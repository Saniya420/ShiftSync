import { DateTime } from 'luxon';
import { detectConflicts, type AvailabilityInput, type ShiftInput } from './conflicts.js';

export interface ScheduleEmployee {
  id: string;
  name: string;
  maxWeeklyHours: number;
  hourlyRate: number;
  availability: AvailabilityInput[];
  timeOff: { startsAt: Date; endsAt: Date; status: string }[];
}
export interface StaffingNeed {
  weekday: number;
  start: string;
  end: string;
  headcount: number;
  position: string;
}
export interface ProposedShift {
  userId: string;
  startsAt: Date;
  endsAt: Date;
  position: string;
}
export function needWindow(week: string, timezone: string, need: StaffingNeed) {
  const day = DateTime.fromISO(week, { zone: timezone }).plus({ days: (need.weekday + 6) % 7 });
  const start = day.set({
    hour: Number(need.start.slice(0, 2)),
    minute: Number(need.start.slice(3)),
  });
  let end = day.set({ hour: Number(need.end.slice(0, 2)), minute: Number(need.end.slice(3)) });
  if (end <= start) end = end.plus({ days: 1 });
  // Luxon normalizes DST gaps; reject those wall-clock windows explicitly.
  if (start.toFormat('HH:mm') !== need.start || end.toFormat('HH:mm') !== need.end) return null;
  return { startsAt: start.toJSDate(), endsAt: end.toJSDate() };
}
export function autoschedule(input: {
  week: string;
  timezone: string;
  employees: ScheduleEmployee[];
  existing: ShiftInput[];
  needs: StaffingNeed[];
}) {
  const shifts: ProposedShift[] = [];
  const warnings: { type: string; message: string }[] = [];
  const weekStart = DateTime.fromISO(input.week, { zone: input.timezone }).toMillis();
  const weekEnd = DateTime.fromMillis(weekStart, { zone: input.timezone })
    .plus({ weeks: 1 })
    .toMillis();
  const assignedHours = (id: string) =>
    [...input.existing, ...shifts]
      .filter((s) => s.userId === id)
      .reduce(
        (sum, s) =>
          sum +
          Math.max(0, Math.min(+s.endsAt, weekEnd) - Math.max(+s.startsAt, weekStart)) / 3600000,
        0,
      );
  const needs = [...input.needs].sort(
    (a, b) =>
      ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) ||
      a.start.localeCompare(b.start) ||
      a.position.localeCompare(b.position),
  );
  for (const need of needs) {
    const window = needWindow(input.week, input.timezone, need);
    if (!window) {
      warnings.push({
        type: 'INVALID_TIME',
        message: `Skipped nonexistent local time on weekday ${need.weekday}.`,
      });
      continue;
    }
    let filled = 0;
    for (let slot = 0; slot < need.headcount; slot++) {
      const eligible = input.employees
        .filter(
          (e) =>
            !detectConflicts(
              { ...window, userId: e.id },
              {
                shifts: [...input.existing, ...shifts],
                availability: e.availability,
                timeOff: e.timeOff,
                maxWeeklyHours: e.maxWeeklyHours,
                timezone: input.timezone,
              },
            ).length,
        )
        .sort((a, b) => assignedHours(a.id) - assignedHours(b.id) || a.id.localeCompare(b.id));
      if (!eligible[0]) break;
      shifts.push({ ...window, userId: eligible[0].id, position: need.position });
      filled++;
    }
    if (filled < need.headcount)
      warnings.push({
        type: 'UNDERSTAFFED',
        message: `${need.position}, weekday ${need.weekday} ${need.start}: filled ${filled} of ${need.headcount}.`,
      });
  }
  return {
    shifts,
    warnings,
    explanation:
      'Assigned eligible employees with the fewest scheduled hours, within availability, time off, weekly limits and ten-hour rest.',
  };
}
