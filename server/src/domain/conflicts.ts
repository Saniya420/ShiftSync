import { DateTime, Interval } from 'luxon';
export type ConflictType =
  'OVERLAP' | 'OUTSIDE_AVAILABILITY' | 'TIME_OFF' | 'WEEKLY_HOURS' | 'REST';
export interface Conflict {
  type: ConflictType;
  message: string;
  shiftId?: string;
}
export interface ShiftInput {
  id?: string;
  userId: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone?: string;
}
export interface AvailabilityInput {
  weekday: number;
  startMinute: number;
  endMinute: number;
}
export interface ConflictContext {
  shifts: ShiftInput[];
  availability: AvailabilityInput[];
  timeOff: { startsAt: Date; endsAt: Date; status: string }[];
  maxWeeklyHours: number;
  timezone: string;
}
const overlaps = (
  a: ShiftInput | { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
) => a.startsAt < b.endsAt && a.endsAt > b.startsAt;
export const hours = (shift: { startsAt: Date; endsAt: Date }) =>
  (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3600000;
export function detectConflicts(shift: ShiftInput, context: ConflictContext): Conflict[] {
  if (!shift.userId) return [];
  const warnings: Conflict[] = [];
  const others = context.shifts.filter(
    (s) => s.userId === shift.userId && (!shift.id || s.id !== shift.id),
  );
  for (const other of others) {
    if (overlaps(shift, other))
      warnings.push({ type: 'OVERLAP', message: 'Overlaps another shift.', shiftId: other.id });
    else {
      const gap =
        shift.startsAt >= other.endsAt
          ? (shift.startsAt.getTime() - other.endsAt.getTime()) / 3600000
          : (other.startsAt.getTime() - shift.endsAt.getTime()) / 3600000;
      if (gap < 10)
        warnings.push({
          type: 'REST',
          message: 'Less than 10 hours of rest between shifts.',
          shiftId: other.id,
        });
    }
  }
  // Availability is recurring in the location's local time; Sunday is weekday 0.
  const start = DateTime.fromJSDate(shift.startsAt, { zone: context.timezone });
  const end = DateTime.fromJSDate(shift.endsAt, { zone: context.timezone });
  let outside = false;
  for (let day = start.startOf('day'); day < end; day = day.plus({ days: 1 })) {
    const segmentStart = Math.max(start.toMillis(), day.toMillis());
    const segmentEnd = Math.min(end.toMillis(), day.plus({ days: 1 }).toMillis());
    const windows = context.availability
      .filter((a) => a.weekday === day.weekday % 7)
      .map((a) => ({
        start: day
          .set({ hour: Math.floor(a.startMinute / 60), minute: a.startMinute % 60 })
          .toMillis(),
        end:
          a.endMinute === 1440
            ? day.plus({ days: 1 }).toMillis()
            : day.set({ hour: Math.floor(a.endMinute / 60), minute: a.endMinute % 60 }).toMillis(),
      }))
      .sort((a, b) => a.start - b.start);
    let coveredUntil = segmentStart;
    for (const window of windows)
      if (window.start <= coveredUntil) coveredUntil = Math.max(coveredUntil, window.end);
    if (coveredUntil < segmentEnd) outside = true;
  }
  if (outside)
    warnings.push({
      type: 'OUTSIDE_AVAILABILITY',
      message: 'Outside the employee’s available hours.',
    });
  if (context.timeOff.some((t) => t.status === 'APPROVED' && overlaps(shift, t)))
    warnings.push({ type: 'TIME_OFF', message: 'Clashes with approved time off.' });
  for (let week = start.startOf('week'); week < end; week = week.plus({ weeks: 1 })) {
    const range = Interval.fromDateTimes(week, week.plus({ weeks: 1 }));
    const total = [...others, shift].reduce((sum, s) => {
      const intersection = range.intersection(
        Interval.fromDateTimes(DateTime.fromJSDate(s.startsAt), DateTime.fromJSDate(s.endsAt)),
      );
      return sum + (intersection?.length('hours') ?? 0);
    }, 0);
    if (total > context.maxWeeklyHours) {
      warnings.push({
        type: 'WEEKLY_HOURS',
        message: 'Exceeds the employee’s weekly hours limit.',
      });
      break;
    }
  }
  return warnings;
}
