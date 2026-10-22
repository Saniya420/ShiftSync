import { Prisma, type Shift } from '@prisma/client';
import { DateTime } from 'luxon';
import type { z } from 'zod';
import { db, tenant } from '../db.js';
import type { Session } from '../auth.js';
import { AppError } from '../http.js';
import { detectConflicts, type Conflict } from '../domain/conflicts.js';
import { shiftBody, weekRange } from '../validation.js';

import { notify } from './notifications.js';
type Tx = Prisma.TransactionClient;
type ShiftBody = z.infer<typeof shiftBody>;
export async function getLocation(tx: Tx, organizationId: string, id: string) {
  const location = await tx.location.findFirst({ where: { ...tenant(organizationId), id } });
  if (!location) throw new AppError(404, 'NOT_FOUND', 'Location not found.');
  return location;
}
export async function contextFor(tx: Tx, organizationId: string, startsAt: Date, endsAt: Date) {
  const start = DateTime.fromJSDate(startsAt).minus({ weeks: 2 }).toJSDate();
  const end = DateTime.fromJSDate(endsAt).plus({ weeks: 2 }).toJSDate();
  const [users, shifts] = await Promise.all([
    tx.user.findMany({
      where: tenant(organizationId),
      include: {
        availability: { where: tenant(organizationId) },
        timeOff: {
          where: {
            ...tenant(organizationId),
            status: 'APPROVED',
            startsAt: { lt: end },
            endsAt: { gt: start },
          },
        },
      },
    }),
    tx.shift.findMany({
      where: { ...tenant(organizationId), startsAt: { lt: end }, endsAt: { gt: start } },
    }),
  ]);
  return { users, shifts };
}
export function warningsFor(
  shift: Pick<Shift, 'userId' | 'startsAt' | 'endsAt'> & { id?: string },
  context: Awaited<ReturnType<typeof contextFor>>,
  timezone: string,
) {
  const user = context.users.find((u) => u.id === shift.userId);
  return user
    ? detectConflicts(shift, {
        shifts: context.shifts,
        availability: user.availability,
        timeOff: user.timeOff,
        maxWeeklyHours: user.maxWeeklyHours,
        timezone,
      })
    : [];
}
export function checkOverlap(warnings: Conflict[], force: boolean) {
  if (!force && warnings.some((w) => w.type === 'OVERLAP'))
    throw new AppError(
      409,
      'SHIFT_OVERLAP',
      'This employee already has a shift at this time. Review the warnings before forcing the overlap.',
      { warnings },
    );
}
export const transaction = <T>(organizationId: string, work: (tx: Tx) => Promise<T>) =>
  db.$transaction(
    async (tx) => {
      // Serialize roster mutations for this authenticated tenant. READ COMMITTED
      // gives conflict reads a fresh snapshot after the preceding writer releases its lock.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(1397968462, hashtext(${organizationId}))::text`;
      return work(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 },
  );

export async function listShifts(auth: Session, week: string, locationId?: string) {
  const location = locationId ? await getLocation(db, auth.organizationId, locationId) : undefined;
  const org = await db.organization.findFirstOrThrow({ where: { id: auth.organizationId } });
  const timezone = location?.timezone ?? org.timezone;
  const { start, end } = weekRange(week, timezone);
  const shifts = await db.shift.findMany({
    where: {
      ...tenant(auth.organizationId),
      ...(locationId ? { locationId } : {}),
      ...(auth.role === 'EMPLOYEE' ? { userId: auth.id, status: 'PUBLISHED' } : {}),
      startsAt: { lt: end },
      endsAt: { gt: start },
    },
    orderBy: { startsAt: 'asc' },
    include: { location: { select: { name: true, timezone: true } } },
  });
  if (auth.role === 'EMPLOYEE')
    return { timezone, shifts: shifts.map((s) => ({ ...s, warnings: [] })) };
  const context = await contextFor(db, auth.organizationId, start, end);
  return {
    timezone,
    shifts: shifts.map((s) => ({ ...s, warnings: warningsFor(s, context, s.location.timezone) })),
  };
}
export async function saveShift(auth: Session, body: ShiftBody, id?: string) {
  return transaction(auth.organizationId, async (tx) => {
    const existing = id
      ? await tx.shift.findFirst({ where: { ...tenant(auth.organizationId), id } })
      : null;
    if (id && !existing) throw new AppError(404, 'NOT_FOUND', 'Shift not found.');
    if (
      existing &&
      existing.userId !== body.userId &&
      (await tx.attendanceRecord.findFirst({
        where: { ...tenant(auth.organizationId), shiftId: existing.id },
      }))
    )
      throw new AppError(
        409,
        'ATTENDANCE_EXISTS',
        'A shift with recorded attendance cannot change assignee.',
      );
    const location = await getLocation(tx, auth.organizationId, body.locationId);
    if (body.userId) {
      const membership = await tx.userLocation.findFirst({
        where: {
          ...tenant(auth.organizationId),
          userId: body.userId,
          user: { organizationId: auth.organizationId, active: true },
          locationId: body.locationId,
        },
      });
      if (!membership)
        throw new AppError(404, 'NOT_FOUND', 'Employee is not assigned to this location.');
    }
    const context = await contextFor(tx, auth.organizationId, body.startsAt, body.endsAt);
    const warnings = warningsFor({ ...body, id }, context, location.timezone);
    checkOverlap(warnings, body.force);
    const { force, ...data } = body;
    const shift = id
      ? await tx.shift.update({
          where: { organizationId_id: { ...tenant(auth.organizationId), id } },
          data,
        })
      : await tx.shift.create({ data: { ...data, ...tenant(auth.organizationId) } });
    await tx.auditLog.create({
      data: {
        ...tenant(auth.organizationId),
        actorId: auth.id,
        action: id ? 'SHIFT_UPDATED' : 'SHIFT_CREATED',
        entityType: 'Shift',
        entityId: shift.id,
        details: { force, warnings: warnings.map((w) => w.type) },
      },
    });
    return { shift, warnings };
  });
}
export async function deleteShift(auth: Session, id: string) {
  await transaction(auth.organizationId, async (tx) => {
    await tx.shift.delete({ where: { organizationId_id: { ...tenant(auth.organizationId), id } } });
  });
}
export async function applyShifts(
  auth: Session,
  week: string,
  locationId: string,
  proposed: { userId: string; startsAt: string; endsAt: string; position: string }[],
  force: boolean,
) {
  return transaction(auth.organizationId, async (tx) => {
    const scope = tenant(auth.organizationId);
    const location = await getLocation(tx, auth.organizationId, locationId);
    const range = weekRange(week, location.timezone);
    const context = await contextFor(tx, auth.organizationId, range.start, range.end);
    const members = await tx.userLocation.findMany({
      where: { ...scope, locationId, user: { ...scope, active: true } },
    });
    const copies = proposed.map((s, i) => ({
      ...s,
      startsAt: new Date(s.startsAt),
      endsAt: new Date(s.endsAt),
      id: 'apply-' + i,
    }));
    for (const s of copies) {
      if (!members.some((m) => m.userId === s.userId))
        throw new AppError(404, 'NOT_FOUND', 'Active location member not found.');
      if (s.startsAt < range.start || s.startsAt >= range.end)
        throw new AppError(400, 'VALIDATION_ERROR', 'All shifts must start in the selected week.');
    }
    const batch = {
      ...context,
      shifts: [
        ...context.shifts,
        ...copies.map((s) => ({
          ...s,
          organizationId: auth.organizationId,
          locationId,
          status: 'DRAFT' as const,
          notes: null,
          createdAt: new Date(),
        })),
      ],
    };
    const warnings = copies.flatMap((s) => warningsFor(s, batch, location.timezone));
    checkOverlap(warnings, force);
    const shifts: Shift[] = [];
    for (const s of copies)
      shifts.push(
        await tx.shift.create({
          data: {
            ...scope,
            userId: s.userId,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            position: s.position,
            locationId,
            status: 'DRAFT',
          },
        }),
      );
    await tx.auditLog.create({
      data: {
        ...scope,
        actorId: auth.id,
        action: 'AI_SUGGESTION_APPLIED',
        entityType: 'Shift',
        entityId: locationId,
        details: { count: shifts.length, force },
      },
    });
    return { shifts, warnings };
  });
}
export async function deleteDrafts(auth: Session, ids: string[]) {
  return transaction(auth.organizationId, async (tx) => {
    const where = { ...tenant(auth.organizationId), id: { in: ids } };
    const shifts = await tx.shift.findMany({ where });
    if (shifts.length !== ids.length) throw new AppError(404, 'NOT_FOUND', 'Shift not found.');
    if (shifts.some((s) => s.status !== 'DRAFT'))
      throw new AppError(409, 'NOT_DRAFT', 'Only draft shifts can be batch deleted.');
    const result = await tx.shift.deleteMany({ where: { ...where, status: 'DRAFT' } });
    await tx.auditLog.create({
      data: {
        ...tenant(auth.organizationId),
        actorId: auth.id,
        action: 'SHIFTS_DELETED',
        entityType: 'Shift',
        entityId: ids[0],
        details: { ids },
      },
    });
    return { deleted: result.count };
  });
}
export async function copyWeek(auth: Session, week: string, locationId: string, force: boolean) {
  return transaction(auth.organizationId, async (tx) => {
    const location = await getLocation(tx, auth.organizationId, locationId);
    const { start, end } = weekRange(week, location.timezone);
    const previous = DateTime.fromJSDate(start, { zone: location.timezone })
      .minus({ weeks: 1 })
      .toJSDate();
    const source = await tx.shift.findMany({
      where: { ...tenant(auth.organizationId), locationId, startsAt: { gte: previous, lt: start } },
    });
    const context = await contextFor(tx, auth.organizationId, start, end);
    const warnings: (Conflict & { userId: string | null })[] = [];
    const copies = source.map((s) => ({
      ...s,
      id: undefined,
      startsAt: DateTime.fromJSDate(s.startsAt, { zone: location.timezone })
        .plus({ weeks: 1 })
        .toJSDate(),
      endsAt: DateTime.fromJSDate(s.endsAt, { zone: location.timezone })
        .plus({ weeks: 1 })
        .toJSDate(),
    }));
    // Check the complete proposed batch, including conflicts between copied shifts.
    const batchContext = {
      ...context,
      shifts: [...context.shifts, ...copies.map((s, i) => ({ ...s, id: 'copy-' + i }))],
    };
    for (const [i, s] of copies.entries()) {
      const found = warningsFor({ ...s, id: 'copy-' + i }, batchContext, location.timezone);
      checkOverlap(found, force);
      warnings.push(...found.map((w) => ({ ...w, userId: s.userId })));
    }
    const shifts: Shift[] = [];
    for (const s of copies) {
      if (
        s.userId &&
        !(await tx.userLocation.findFirst({
          where: {
            ...tenant(auth.organizationId),
            userId: s.userId,
            user: { organizationId: auth.organizationId, active: true },
            locationId,
          },
        }))
      )
        throw new AppError(
          409,
          'MEMBERSHIP_CHANGED',
          'An employee is no longer assigned to this location.',
        );
      shifts.push(
        await tx.shift.create({
          data: {
            ...tenant(auth.organizationId),
            locationId,
            userId: s.userId,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            position: s.position,
            notes: s.notes,
            status: 'DRAFT',
          },
        }),
      );
    }
    return { shifts, warnings };
  });
}
export async function publishWeek(
  auth: Session,
  week: string,
  locationId: string,
  force: boolean,
  days?: number[],
) {
  return transaction(auth.organizationId, async (tx) => {
    const location = await getLocation(tx, auth.organizationId, locationId);
    const { start, end } = weekRange(week, location.timezone);
    const selectedDays = days?.map((day) => {
      const date = DateTime.fromISO(week, { zone: location.timezone }).plus({
        days: (day + 6) % 7,
      });
      return { startsAt: { gte: date.toJSDate(), lt: date.plus({ days: 1 }).toJSDate() } };
    });
    const where = {
      ...tenant(auth.organizationId),
      locationId,
      startsAt: { gte: start, lt: end },
      ...(selectedDays ? { OR: selectedDays } : {}),
    };
    const shifts = await tx.shift.findMany({ where });
    const context = await contextFor(tx, auth.organizationId, start, end);
    const warnings = shifts.flatMap((s) => warningsFor(s, context, location.timezone));
    checkOverlap(warnings, force);
    const result = await tx.shift.updateMany({
      where: { ...where, status: 'DRAFT' },
      data: { status: 'PUBLISHED' },
    });
    const recipients = [
      ...new Set(shifts.filter((s) => s.status === 'DRAFT' && s.userId).map((s) => s.userId!)),
    ];
    await notify(
      tx,
      auth.organizationId,
      recipients,
      'Your schedule is published',
      'Your schedule for the week of ' + week + ' at ' + location.name + ' is ready.',
    );
    return { published: result.count, warnings };
  });
}
