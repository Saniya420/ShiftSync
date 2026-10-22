import { describe, expect, it } from 'vitest';
import { detectConflicts, hours, type ConflictContext, type ShiftInput } from './conflicts.js';
const date = (s: string) => new Date(s);
const shift = (
  start = '2026-10-19T09:00:00Z',
  end = '2026-10-19T17:00:00Z',
  id = 'new',
): ShiftInput => ({ id, userId: 'u', startsAt: date(start), endsAt: date(end) });
const context = (partial: Partial<ConflictContext> = {}): ConflictContext => ({
  shifts: [],
  availability: Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    startMinute: 0,
    endMinute: 1440,
  })),
  timeOff: [],
  maxWeeklyHours: 40,
  timezone: 'UTC',
  ...partial,
});
const types = (s: ShiftInput, c = context()) => detectConflicts(s, c).map((w) => w.type);
describe('conflict detection', () => {
  it('accepts an available shift and computes duration', () => {
    expect(types(shift())).toEqual([]);
    expect(hours(shift())).toBe(8);
  });
  it('does not mutate its inputs', () => {
    const s = shift(),
      c = context();
    const before = JSON.stringify({ s, c });
    detectConflicts(s, c);
    expect(JSON.stringify({ s, c })).toBe(before);
  });
  it('ignores unassigned shifts', () =>
    expect(types({ ...shift(), userId: null }, context({ availability: [] }))).toEqual([]));
  it('detects partial, enclosed, and identical overlaps', () => {
    for (const existing of [
      shift('2026-10-19T08:00:00Z', '2026-10-19T10:00:00Z', 'old'),
      shift('2026-10-19T10:00:00Z', '2026-10-19T11:00:00Z', 'old'),
      { ...shift(), id: 'old' },
    ])
      expect(types(shift(), context({ shifts: [existing] }))).toContain('OVERLAP');
  });
  it('excludes the shift being edited and other employees', () =>
    expect(
      types(shift(), context({ shifts: [shift(), { ...shift(), id: 'other', userId: 'v' }] })),
    ).toEqual([]));
  it('treats touching boundaries as rest warnings, not overlaps', () => {
    expect(
      types(
        shift(),
        context({ shifts: [shift('2026-10-19T17:00:00Z', '2026-10-19T20:00:00Z', 'old')] }),
      ),
    ).toEqual(['REST']);
  });
  it('requires full availability coverage and flags absent availability', () => {
    expect(types(shift(), context({ availability: [] }))).toContain('OUTSIDE_AVAILABILITY');
    expect(
      types(
        shift(),
        context({ availability: [{ weekday: 1, startMinute: 600, endMinute: 1020 }] }),
      ),
    ).toContain('OUTSIDE_AVAILABILITY');
  });
  it('merges adjacent availability windows', () =>
    expect(
      types(
        shift(),
        context({
          availability: [
            { weekday: 1, startMinute: 540, endMinute: 720 },
            { weekday: 1, startMinute: 720, endMinute: 1020 },
          ],
        }),
      ),
    ).toEqual([]));
  it('detects gaps in availability', () =>
    expect(
      types(
        shift(),
        context({
          availability: [
            { weekday: 1, startMinute: 540, endMinute: 700 },
            { weekday: 1, startMinute: 720, endMinute: 1020 },
          ],
        }),
      ),
    ).toContain('OUTSIDE_AVAILABILITY'));
  it('uses local timezone for availability', () =>
    expect(
      types(
        shift(),
        context({
          timezone: 'Asia/Karachi',
          availability: [{ weekday: 1, startMinute: 840, endMinute: 1320 }],
        }),
      ),
    ).toEqual([]));
  it('checks both local days on overnight shifts', () => {
    const s = shift('2026-10-19T22:00:00Z', '2026-10-20T06:00:00Z');
    expect(
      types(
        s,
        context({
          availability: [
            { weekday: 1, startMinute: 1320, endMinute: 1440 },
            { weekday: 2, startMinute: 0, endMinute: 360 },
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      types(s, context({ availability: [{ weekday: 1, startMinute: 1320, endMinute: 1440 }] })),
    ).toContain('OUTSIDE_AVAILABILITY');
  });
  it('handles spring-forward availability in local clock time', () => {
    expect(
      types(
        shift('2026-03-08T06:00:00Z', '2026-03-08T08:00:00Z'),
        context({
          timezone: 'America/New_York',
          availability: [{ weekday: 0, startMinute: 60, endMinute: 240 }],
        }),
      ),
    ).toEqual([]);
  });
  it('only warns for approved overlapping time off', () => {
    const off = {
      startsAt: date('2026-10-19T12:00:00Z'),
      endsAt: date('2026-10-19T14:00:00Z'),
      status: 'APPROVED',
    };
    expect(types(shift(), context({ timeOff: [off] }))).toContain('TIME_OFF');
    expect(types(shift(), context({ timeOff: [{ ...off, status: 'PENDING' }] }))).toEqual([]);
    expect(
      types(shift(), context({ timeOff: [{ ...off, startsAt: date('2026-10-19T17:00:00Z') }] })),
    ).toEqual([]);
  });
  it('warns above weekly limit but permits exact limit', () => {
    expect(types(shift(), context({ maxWeeklyHours: 7 }))).toContain('WEEKLY_HOURS');
    expect(types(shift(), context({ maxWeeklyHours: 8 }))).toEqual([]);
  });
  it('totals hours across locations and excludes other weeks', () => {
    const others = [shift('2026-10-20T09:00:00Z', '2026-10-20T17:00:00Z', 'b')];
    expect(types(shift(), context({ shifts: others, maxWeeklyHours: 15 }))).toContain(
      'WEEKLY_HOURS',
    );
    expect(
      types(
        shift(),
        context({
          shifts: [shift('2026-10-12T09:00:00Z', '2026-10-12T17:00:00Z', 'b')],
          maxWeeklyHours: 8,
        }),
      ),
    ).toEqual([]);
  });
  it('splits a Sunday overnight shift across Monday weeks', () => {
    expect(
      types(shift('2026-10-25T22:00:00Z', '2026-10-26T06:00:00Z'), context({ maxWeeklyHours: 6 })),
    ).toEqual([]);
    expect(
      types(shift('2026-10-25T22:00:00Z', '2026-10-26T06:00:00Z'), context({ maxWeeklyHours: 5 })),
    ).toContain('WEEKLY_HOURS');
  });
  it('uses local Monday boundaries for hours', () => {
    expect(
      types(
        shift('2026-10-25T18:00:00Z', '2026-10-25T22:00:00Z'),
        context({ timezone: 'Asia/Karachi', maxWeeklyHours: 3 }),
      ),
    ).toEqual([]);
  });
  it('warns on short rest in either direction and permits exactly 10h', () => {
    for (const s of [
      shift('2026-10-19T00:00:00Z', '2026-10-19T01:00:00Z', 'b'),
      shift('2026-10-20T01:00:00Z', '2026-10-20T03:00:00Z', 'b'),
    ])
      expect(types(shift(), context({ shifts: [s] }))).toContain('REST');
    expect(
      types(
        shift(),
        context({ shifts: [shift('2026-10-20T03:00:00Z', '2026-10-20T05:00:00Z', 'b')] }),
      ),
    ).toEqual([]);
  });
  it('can report all five conflicts together', () => {
    const c = context({
      availability: [],
      maxWeeklyHours: 1,
      shifts: [
        { ...shift(), id: 'overlap' },
        shift('2026-10-20T01:00:00Z', '2026-10-20T02:00:00Z', 'rest'),
      ],
      timeOff: [{ ...shift(), status: 'APPROVED' }],
    });
    expect(new Set(types(shift(), c))).toEqual(
      new Set(['OVERLAP', 'REST', 'OUTSIDE_AVAILABILITY', 'WEEKLY_HOURS', 'TIME_OFF']),
    );
  });
});
