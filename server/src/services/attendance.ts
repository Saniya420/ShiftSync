import bcrypt from 'bcrypt';
import { DateTime } from 'luxon';
import type { Session } from '../auth.js';
import { db, tenant } from '../db.js';
import { AppError } from '../http.js';
import { attendanceStatus, canClockIn, haversineMeters } from '../domain/attendance.js';
import { transaction } from './roster.js';
import { notify } from './requests.js';
type ClockBody = { shiftId: string; pin?: string; lat?: number; lng?: number };
export async function clock(auth: Session, body: ClockBody, out: boolean, now = new Date()) {
  return transaction(auth.organizationId, async (tx) => {
    const scope = tenant(auth.organizationId);
    const shift = await tx.shift.findFirst({
      where: { ...scope, id: body.shiftId, userId: auth.id, status: 'PUBLISHED' },
      include: { location: true },
    });
    if (!shift) throw new AppError(404, 'NOT_FOUND', 'Your published shift was not found.');
    const user = await tx.user.findFirstOrThrow({ where: { ...scope, id: auth.id } });
    if (user.pinHash && (!body.pin || !(await bcrypt.compare(body.pin, user.pinHash))))
      throw new AppError(403, 'INVALID_PIN', 'A valid attendance PIN is required.');
    const loc = shift.location;
    if (
      loc.lat !== null &&
      loc.lng !== null &&
      body.lat !== undefined &&
      body.lng !== undefined &&
      haversineMeters({ lat: loc.lat, lng: loc.lng }, { lat: body.lat, lng: body.lng }) >
        loc.geofenceRadiusM
    )
      throw new AppError(403, 'OUTSIDE_GEOFENCE', 'You are outside the location geofence.');
    const existing = await tx.attendanceRecord.findFirst({
      where: { ...scope, shiftId: shift.id, userId: auth.id },
    });
    if (out) {
      if (!existing?.clockInAt || existing.clockOutAt || now <= existing.clockInAt)
        throw new AppError(
          409,
          'INVALID_CLOCK_OUT',
          'Clock in first; a completed record cannot be clocked out again.',
        );
      return tx.attendanceRecord.update({
        where: { organizationId_shiftId_userId: { ...scope, shiftId: shift.id, userId: auth.id } },
        data: {
          clockOutAt: now,
          status: attendanceStatus({
            ...shift,
            clockInGraceMin: loc.clockInGraceMin,
            clockInAt: existing.clockInAt,
            clockOutAt: now,
          }),
        },
      });
    }
    if (!canClockIn(shift.startsAt, shift.endsAt, now))
      throw new AppError(
        409,
        'CLOCK_IN_WINDOW',
        'Clock in from 15 minutes before start until the shift ends.',
      );
    if (existing)
      throw new AppError(409, 'ALREADY_CLOCKED_IN', 'This shift already has an attendance record.');
    if (
      await tx.attendanceRecord.findFirst({
        where: { ...scope, userId: auth.id, clockInAt: { not: null }, clockOutAt: null },
      })
    )
      throw new AppError(409, 'ACTIVE_CLOCK', 'Clock out of your previous shift first.');
    return tx.attendanceRecord.create({
      data: {
        ...scope,
        shiftId: shift.id,
        userId: auth.id,
        clockInAt: now,
        status: attendanceStatus({
          ...shift,
          clockInGraceMin: loc.clockInGraceMin,
          clockInAt: now,
          clockOutAt: null,
        }),
      },
    });
  });
}
export async function currentAttendance(auth: Session, now = new Date()) {
  const scope = tenant(auth.organizationId);
  const active = await db.attendanceRecord.findFirst({
    where: { ...scope, userId: auth.id, clockInAt: { not: null }, clockOutAt: null },
    include: { shift: { include: { location: true } } },
  });
  if (active) return { shift: active.shift, record: active };
  const shift = await db.shift.findFirst({
    where: {
      ...scope,
      userId: auth.id,
      status: 'PUBLISHED',
      startsAt: { lte: new Date(+now + 15 * 60000) },
      endsAt: { gt: now },
      attendance: { none: { ...scope, userId: auth.id } },
    },
    include: { location: true },
    orderBy: { startsAt: 'asc' },
  });
  return { shift, record: null };
}
export async function attendanceBoard(auth: Session, now = new Date()) {
  const scope = tenant(auth.organizationId);
  const org = await db.organization.findFirstOrThrow({ where: { id: auth.organizationId } });
  const day = DateTime.fromJSDate(now, { zone: org.timezone }).startOf('day');
  const shifts = await db.shift.findMany({
    where: {
      ...scope,
      status: 'PUBLISHED',
      userId: { not: null },
      startsAt: { lt: day.plus({ days: 1 }).toJSDate() },
      endsAt: { gt: day.toJSDate() },
    },
    include: { user: { select: { name: true } }, location: true, attendance: { where: scope } },
    orderBy: { startsAt: 'asc' },
  });
  return {
    timezone: org.timezone,
    shifts: shifts.map((s) => ({
      ...s,
      liveStatus: s.attendance[0]?.clockOutAt
        ? 'OUT'
        : s.attendance[0]?.clockInAt
          ? 'IN'
          : s.attendance[0]?.status === 'NO_SHOW'
            ? 'NO_SHOW'
            : +now > +s.startsAt + s.location.clockInGraceMin * 60000
              ? 'LATE'
              : 'NOT_ARRIVED',
    })),
  };
}
export async function correctAttendance(
  auth: Session,
  id: string,
  body: { clockInAt: Date | null; clockOutAt: Date | null; note: string },
) {
  return transaction(auth.organizationId, async (tx) => {
    const scope = tenant(auth.organizationId);
    const record = await tx.attendanceRecord.findFirst({
      where: { ...scope, id },
      include: { shift: { include: { location: true } } },
    });
    if (!record) throw new AppError(404, 'NOT_FOUND', 'Attendance record not found.');
    const status = attendanceStatus({
      ...record.shift,
      ...body,
      clockInGraceMin: record.shift.location.clockInGraceMin,
    });
    const updated = await tx.attendanceRecord.updateMany({
      where: { ...scope, id },
      data: { ...body, status, correctedById: auth.id },
    });
    await tx.auditLog.create({
      data: {
        ...scope,
        actorId: auth.id,
        action: 'ATTENDANCE_CORRECTED',
        entityType: 'AttendanceRecord',
        entityId: id,
        details: {
          note: body.note,
          before: {
            clockInAt: record.clockInAt?.toISOString() ?? null,
            clockOutAt: record.clockOutAt?.toISOString() ?? null,
            status: record.status,
          },
          after: {
            clockInAt: body.clockInAt?.toISOString() ?? null,
            clockOutAt: body.clockOutAt?.toISOString() ?? null,
            status,
          },
        },
      },
    });
    return updated;
  });
}
export async function markNoShows(organizationId: string, now = new Date()) {
  return transaction(organizationId, async (tx) => {
    const scope = tenant(organizationId);
    const shifts = await tx.shift.findMany({
      where: {
        ...scope,
        status: 'PUBLISHED',
        userId: { not: null },
        endsAt: { lt: new Date(+now - 30 * 60000) },
        attendance: { none: scope },
      },
    });
    for (const s of shifts) {
      await tx.attendanceRecord.create({
        data: { ...scope, shiftId: s.id, userId: s.userId!, status: 'NO_SHOW' },
      });
      const managers = await tx.user.findMany({
        where: { ...scope, role: { in: ['OWNER', 'MANAGER'] } },
        select: { id: true },
      });
      await notify(
        tx,
        organizationId,
        [s.userId!, ...managers.map((m) => m.id)],
        'Missed clock-in',
        'No clock-in recorded for the shift on ' + s.startsAt.toISOString() + '.',
      );
    }
    return shifts.length;
  });
}
