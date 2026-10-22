import { DateTime } from 'luxon';
import type { Session } from '../auth.js';
import { db, tenant } from '../db.js';
import { AppError } from '../http.js';
import { calculateTimesheets } from '../domain/timesheets.js';
export async function timesheetReport(
  auth: Session,
  query: { from: string; to: string; locationId?: string },
) {
  const scope = tenant(auth.organizationId);
  const org = await db.organization.findFirstOrThrow({ where: { id: auth.organizationId } });
  const loc = query.locationId
    ? await db.location.findFirst({ where: { ...scope, id: query.locationId } })
    : null;
  if (query.locationId && !loc) throw new AppError(404, 'NOT_FOUND', 'Location not found.');
  const timezone = loc?.timezone ?? org.timezone;
  const from = DateTime.fromISO(query.from, { zone: timezone }).startOf('day');
  const to = DateTime.fromISO(query.to, { zone: timezone }).plus({ days: 1 }).startOf('day');
  const [users, shifts] = await Promise.all([
    db.user.findMany({
      where: {
        ...scope,
        ...(loc
          ? {
              OR: [
                { locations: { some: { ...scope, locationId: loc.id } } },
                { shifts: { some: { ...scope, locationId: loc.id, status: 'PUBLISHED' } } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, hourlyRate: true, maxWeeklyHours: true },
      orderBy: { name: 'asc' },
    }),
    db.shift.findMany({
      where: {
        ...scope,
        status: 'PUBLISHED',
        OR: [
          {
            startsAt: { lt: to.endOf('week').toJSDate() },
            endsAt: { gt: from.startOf('week').toJSDate() },
          },
          {
            attendance: {
              some: {
                ...scope,
                clockInAt: { lt: to.endOf('week').toJSDate() },
                clockOutAt: { gt: from.startOf('week').toJSDate() },
              },
            },
          },
        ],
      },
      include: { location: { select: { clockInGraceMin: true } }, attendance: { where: scope } },
    }),
  ]);
  // Weekly overtime is evaluated across the employee's locations. Location filtering
  // attributes only that location's hours while preserving the weekly threshold.
  const entries = shifts.map((s) => ({
    ...s,
    selected: !loc || s.locationId === loc.id,
    clockInGraceMin: s.location.clockInGraceMin,
  }));
  return {
    timezone,
    rows: calculateTimesheets(
      users.map((u) => ({ ...u, hourlyRate: Number(u.hourlyRate) })),
      entries,
      from.toJSDate(),
      to.toJSDate(),
      timezone,
    ),
  };
}
