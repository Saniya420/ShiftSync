export interface AttendanceInput {
  startsAt: Date;
  endsAt: Date;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  clockInGraceMin: number;
}
export function attendanceStatus(
  s: AttendanceInput,
): 'ON_TIME' | 'LATE' | 'EARLY_LEAVE' | 'NO_SHOW' {
  if (!s.clockInAt) return 'NO_SHOW';
  if (s.clockOutAt && s.clockOutAt < s.endsAt) return 'EARLY_LEAVE';
  return s.clockInAt.getTime() > s.startsAt.getTime() + s.clockInGraceMin * 60000
    ? 'LATE'
    : 'ON_TIME';
}
export function canClockIn(startsAt: Date, endsAt: Date, now: Date) {
  return now.getTime() >= startsAt.getTime() - 15 * 60000 && now < endsAt;
}
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
