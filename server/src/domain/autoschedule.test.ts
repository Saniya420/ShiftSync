import { describe, it, expect } from 'vitest';
import { autoschedule, needWindow, type ScheduleEmployee } from './autoschedule.js';
const employee = (id: string): ScheduleEmployee => ({
  id,
  name: id,
  hourlyRate: 20,
  maxWeeklyHours: 40,
  availability: Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    startMinute: 0,
    endMinute: 1440,
  })),
  timeOff: [],
});
const need = { weekday: 1, start: '09:00', end: '17:00', headcount: 2, position: 'Floor' };
const base = () => ({
  week: '2026-10-19',
  timezone: 'UTC',
  employees: [employee('b'), employee('a')],
  existing: [],
  needs: [need],
});
describe('deterministic autoschedule', () => {
  it('fills with distinct users and stable ID tie breaks without mutating inputs', () => {
    const input = base();
    const snapshot = JSON.stringify(input);
    const a = autoschedule(input);
    expect(a.shifts.map((s) => s.userId)).toEqual(['a', 'b']);
    expect(a.warnings).toEqual([]);
    expect(autoschedule(input)).toEqual(a);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
  it('uses the fewest scheduled hours across all locations', () => {
    const input = {
      ...base(),
      needs: [{ ...need, headcount: 1 }],
      existing: [
        {
          userId: 'a',
          startsAt: new Date('2026-10-20T09:00Z'),
          endsAt: new Date('2026-10-20T17:00Z'),
        },
      ],
    };
    expect(autoschedule(input).shifts[0].userId).toBe('b');
  });
  it.each(['availability', 'timeOff', 'maxHours', 'overlap', 'rest'])(
    'excludes employees with %s conflicts',
    (kind) => {
      const e = employee('a');
      const input = {
        ...base(),
        employees: [e],
        needs: [{ ...need, headcount: 1 }],
        existing: [] as { userId: string; startsAt: Date; endsAt: Date }[],
      };
      if (kind === 'availability') e.availability = [];
      if (kind === 'timeOff')
        e.timeOff = [
          {
            startsAt: new Date('2026-10-19T10:00Z'),
            endsAt: new Date('2026-10-19T12:00Z'),
            status: 'APPROVED',
          },
        ];
      if (kind === 'maxHours') e.maxWeeklyHours = 7;
      if (kind === 'overlap')
        input.existing = [
          {
            userId: 'a',
            startsAt: new Date('2026-10-19T10:00Z'),
            endsAt: new Date('2026-10-19T12:00Z'),
          },
        ];
      if (kind === 'rest')
        input.existing = [
          {
            userId: 'a',
            startsAt: new Date('2026-10-18T20:00Z'),
            endsAt: new Date('2026-10-19T00:00Z'),
          },
        ];
      const result = autoschedule(input);
      expect(result.shifts).toHaveLength(0);
      expect(result.warnings[0].type).toBe('UNDERSTAFFED');
    },
  );
  it('counts proposed hours and respects exact ten hour rest', () => {
    const input = {
      ...base(),
      employees: [{ ...employee('a'), maxWeeklyHours: 16 }],
      needs: [
        { ...need, headcount: 1 },
        { ...need, weekday: 2, headcount: 1 },
        { ...need, weekday: 3, headcount: 1 },
      ],
    };
    expect(autoschedule(input).shifts).toHaveLength(2);
    const rest = {
      ...base(),
      needs: [{ ...need, headcount: 1 }],
      employees: [employee('a')],
      existing: [
        {
          userId: 'a',
          startsAt: new Date('2026-10-18T15:00Z'),
          endsAt: new Date('2026-10-18T23:00Z'),
        },
      ],
    };
    expect(autoschedule(rest).shifts).toHaveLength(1);
  });
  it('handles Sunday and overnight in the location timezone', () => {
    const window = needWindow('2026-10-19', 'Asia/Karachi', {
      ...need,
      weekday: 0,
      start: '22:00',
      end: '06:00',
    })!;
    expect(window.startsAt.toISOString()).toBe('2026-10-25T17:00:00.000Z');
    expect(window.endsAt.toISOString()).toBe('2026-10-26T01:00:00.000Z');
  });
  it('rejects nonexistent DST wall times', () => {
    expect(
      needWindow('2026-03-02', 'America/New_York', {
        ...need,
        weekday: 0,
        start: '02:30',
        end: '10:00',
      }),
    ).toBeNull();
  });
  it('returns empty results for an empty team and ignores rejected time off', () => {
    expect(autoschedule({ ...base(), employees: [] }).warnings).toHaveLength(1);
    const e = employee('a');
    e.timeOff = [
      {
        startsAt: new Date('2026-10-19T09:00Z'),
        endsAt: new Date('2026-10-19T17:00Z'),
        status: 'REJECTED',
      },
    ];
    expect(autoschedule({ ...base(), employees: [e] }).shifts).toHaveLength(1);
  });
});
