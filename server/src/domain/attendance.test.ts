import { describe, expect, it } from 'vitest';
import { attendanceStatus, canClockIn, haversineMeters } from './attendance.js';
const d = (v: string) => new Date(v);
const shift = {
  startsAt: d('2026-10-22T22:00:00Z'),
  endsAt: d('2026-10-23T06:00:00Z'),
  clockInGraceMin: 5,
};
describe('overnight attendance and boundaries', () => {
  it('includes the grace boundary and marks later arrivals late', () => {
    expect(
      attendanceStatus({ ...shift, clockInAt: d('2026-10-22T22:05:00Z'), clockOutAt: null }),
    ).toBe('ON_TIME');
    expect(
      attendanceStatus({
        ...shift,
        clockInAt: d('2026-10-22T22:05:00.001Z'),
        clockOutAt: shift.endsAt,
      }),
    ).toBe('LATE');
  });
  it('marks early leave with priority over lateness, and missing arrivals', () => {
    expect(
      attendanceStatus({
        ...shift,
        clockInAt: d('2026-10-22T22:10:00Z'),
        clockOutAt: d('2026-10-23T05:59:59Z'),
      }),
    ).toBe('EARLY_LEAVE');
    expect(
      attendanceStatus({ ...shift, clockInAt: shift.startsAt, clockOutAt: shift.endsAt }),
    ).toBe('ON_TIME');
    expect(attendanceStatus({ ...shift, clockInAt: null, clockOutAt: null })).toBe('NO_SHOW');
  });
  it('allows clock-in exactly 15 minutes early and excludes shift end', () => {
    expect(canClockIn(shift.startsAt, shift.endsAt, d('2026-10-22T21:44:59Z'))).toBe(false);
    expect(canClockIn(shift.startsAt, shift.endsAt, d('2026-10-22T21:45:00Z'))).toBe(true);
    expect(canClockIn(shift.startsAt, shift.endsAt, d('2026-10-23T02:00:00Z'))).toBe(true);
    expect(canClockIn(shift.startsAt, shift.endsAt, shift.endsAt)).toBe(false);
  });
  it('measures geofences in meters, including the date line', () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 })).toBeCloseTo(111.195, 2);
    expect(haversineMeters({ lat: 0, lng: 179.999 }, { lat: 0, lng: -179.999 })).toBeCloseTo(
      222.39,
      1,
    );
  });
});
