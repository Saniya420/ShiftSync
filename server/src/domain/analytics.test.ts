import { it, expect } from 'vitest';
import { aggregateAnalytics } from './analytics.js';
const date = (v: string) => new Date(v);
const base = () => ({
  from: '2026-10-19',
  to: '2026-10-20',
  timezone: 'UTC',
  now: date('2026-10-23T00:00Z'),
  users: [{ id: 'a', name: 'Alex', hourlyRate: 20 }],
  shifts: [],
  swaps: [],
  timeOff: [],
});
it('returns zero metrics and filled daily series for empty data', () => {
  const r = aggregateAnalytics(base());
  expect(r.kpis.attendanceRate).toBe(0);
  expect(r.kpis.coverage).toBe(0);
  expect(r.daily).toHaveLength(2);
});
it('clips overnight hours by local day, counts independent lateness and ignores future attendance', () => {
  const s = {
    userId: 'a',
    startsAt: date('2026-10-18T22:00Z'),
    endsAt: date('2026-10-19T06:00Z'),
    location: { clockInGraceMin: 5 },
    attendance: [
      {
        clockInAt: date('2026-10-18T22:10Z'),
        clockOutAt: date('2026-10-19T05:00Z'),
        status: 'EARLY_LEAVE',
      },
    ],
  };
  const r = aggregateAnalytics({
    ...base(),
    shifts: [
      s,
      {
        ...s,
        startsAt: date('2026-10-20T09:00Z'),
        endsAt: date('2026-10-20T17:00Z'),
        attendance: [],
      },
      { ...s, userId: null, attendance: [] },
    ],
    swaps: [{ status: 'APPROVED' }, { status: 'REJECTED' }, { status: 'PENDING' }],
    timeOff: [{ status: 'PENDING' }],
  });
  expect(r.kpis.scheduledHours).toBe(20);
  expect(r.kpis.actualHours).toBe(5);
  expect(r.kpis.labourCost).toBe(280);
  expect(r.kpis.attendanceRate).toBe(50);
  expect(r.kpis.lateRate).toBe(50);
  expect(r.kpis.noShowRate).toBe(50);
  expect(r.kpis.swapApprovalRate).toBe(50);
  expect(r.kpis.timeOffVolume).toBe(1);
  expect(r.hoursPerEmployee[0].scheduledHours).toBe(14);
});

it('splits DST days using elapsed hours and excludes future/open shifts from attendance rates', () => {
  const s = {
    userId: 'a',
    startsAt: date('2026-03-08T05:00Z'),
    endsAt: date('2026-03-09T04:00Z'),
    location: { clockInGraceMin: 5 },
    attendance: [
      {
        clockInAt: date('2026-03-08T05:00Z'),
        clockOutAt: date('2026-03-09T04:00Z'),
        status: 'ON_TIME',
      },
    ],
  };
  const r = aggregateAnalytics({
    ...base(),
    from: '2026-03-08',
    to: '2026-03-08',
    timezone: 'America/New_York',
    now: date('2026-03-08T12:00Z'),
    shifts: [s, { ...s, userId: null, attendance: [] }],
  });
  expect(r.daily).toHaveLength(1);
  expect(r.daily[0].scheduledHours).toBe(46);
  expect(r.daily[0].actualHours).toBe(23);
  expect(r.kpis.attendanceRate).toBe(0);
  expect(r.kpis.coverage).toBe(50);
});
it('counts exact grace boundary on time and incomplete attendance as zero actual hours', () => {
  const s = {
    userId: 'a',
    startsAt: date('2026-10-19T09:00Z'),
    endsAt: date('2026-10-19T17:00Z'),
    location: { clockInGraceMin: 5 },
    attendance: [{ clockInAt: date('2026-10-19T09:05Z'), clockOutAt: null, status: 'ON_TIME' }],
  };
  const r = aggregateAnalytics({ ...base(), shifts: [s] });
  expect(r.kpis.attendanceRate).toBe(100);
  expect(r.kpis.lateRate).toBe(0);
  expect(r.kpis.actualHours).toBe(0);
  expect(r.attendance[0].value).toBe(1);
});
