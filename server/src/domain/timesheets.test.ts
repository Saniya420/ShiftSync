import { describe, expect, it } from 'vitest';
import { calculateTimesheets, timesheetsCsv } from './timesheets.js';
const d = (s: string) => new Date(s);
const users = [{ id: 'a', name: '=SUM(1,2)', hourlyRate: 20, maxWeeklyHours: 8 }];
function entry(start: string, end: string, selected = true, late = false) {
  return {
    userId: 'a',
    startsAt: d(start),
    endsAt: d(end),
    clockInGraceMin: 5,
    selected,
    attendance: [{ clockInAt: new Date(+d(start) + (late ? 10 * 60000 : 0)), clockOutAt: d(end) }],
  };
}
describe('timesheet calculations', () => {
  it('clips overnight hours, ignores missing clock-outs and tracks late arrivals', () => {
    const shifts = [
      entry('2026-10-18T22:00Z', '2026-10-19T06:00Z'),
      entry('2026-10-20T09:00Z', '2026-10-20T17:00Z', true, true),
      {
        ...entry('2026-10-21T09:00Z', '2026-10-21T17:00Z'),
        attendance: [{ clockInAt: null, clockOutAt: null }],
      },
    ];
    const [r] = calculateTimesheets(
      users,
      shifts,
      d('2026-10-19T00:00Z'),
      d('2026-10-26T00:00Z'),
      'UTC',
    );
    expect(r.scheduledHours).toBe(22);
    expect(r.actualHours).toBeCloseTo(13 + 5 / 6);
    expect(r.overtimeHours).toBeCloseTo(5 + 5 / 6);
    expect(r.lateCount).toBe(1);
    expect(r.estimatedCost).toBe(440);
  });
  it('uses full weeks for partial ranges and counts other locations toward overtime', () => {
    const shifts = [
      entry('2026-10-19T09:00Z', '2026-10-19T17:00Z', false),
      entry('2026-10-20T09:00Z', '2026-10-20T17:00Z'),
    ];
    const [r] = calculateTimesheets(
      users,
      shifts,
      d('2026-10-20T00:00Z'),
      d('2026-10-21T00:00Z'),
      'UTC',
    );
    expect(r.scheduledHours).toBe(8);
    expect(r.actualHours).toBe(8);
    expect(r.overtimeHours).toBe(8);
  });
  it('resets overtime on Monday and respects DST elapsed hours', () => {
    const [r] = calculateTimesheets(
      users,
      [
        entry('2026-03-08T01:00:00-05:00', '2026-03-08T04:00:00-04:00'),
        entry('2026-03-09T09:00Z', '2026-03-09T17:00Z'),
      ],
      d('2026-03-02T05:00Z'),
      d('2026-03-10T04:00Z'),
      'America/New_York',
    );
    expect(r.actualHours).toBe(10);
    expect(r.overtimeHours).toBe(0);
  });
  it('quotes CSV and neutralizes spreadsheet formulas', () => {
    const rows = calculateTimesheets(users, [], d('2026-10-19'), d('2026-10-26'), 'UTC');
    expect(timesheetsCsv(rows)).toContain('"\'=SUM(1,2)"');
    expect(timesheetsCsv([{ ...rows[0], name: 'Alex "A", Rivera' }])).toContain(
      '"Alex ""A"", Rivera"',
    );
  });
});
