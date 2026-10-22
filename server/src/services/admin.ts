import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { DateTime } from 'luxon';
import type { z } from 'zod';
import type { Session } from '../auth.js';
import { db, publicUser, tenant } from '../db.js';
import { AppError } from '../http.js';
import { aggregateAnalytics } from '../domain/analytics.js';
import { transaction } from './roster.js';
import type {
  adminUserBody,
  auditQuery,
  profileBody,
  teamBatchBody,
} from '../phase3-validation.js';
import type { reportQuery } from '../phase2-validation.js';

export async function analytics(auth: Session, query: z.infer<typeof reportQuery>) {
  const scope = tenant(auth.organizationId);
  const org = await db.organization.findFirstOrThrow({ where: { id: auth.organizationId } });
  const location = query.locationId
    ? await db.location.findFirst({ where: { ...scope, id: query.locationId } })
    : null;
  if (query.locationId && !location) throw new AppError(404, 'NOT_FOUND', 'Location not found.');
  const timezone = location?.timezone ?? org.timezone;
  const from = DateTime.fromISO(query.from, { zone: timezone }).startOf('day').toJSDate();
  const to = DateTime.fromISO(query.to, { zone: timezone })
    .plus({ days: 1 })
    .startOf('day')
    .toJSDate();
  const [users, shifts, swaps, timeOff] = await Promise.all([
    db.user.findMany({ where: scope, select: { id: true, name: true, hourlyRate: true } }),
    db.shift.findMany({
      where: {
        ...scope,
        status: 'PUBLISHED',
        ...(location ? { locationId: location.id } : {}),
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      include: { location: { select: { clockInGraceMin: true } }, attendance: { where: scope } },
    }),
    db.swapRequest.findMany({
      where: {
        ...scope,
        createdAt: { gte: from, lt: to },
        ...(location ? { shift: { ...scope, locationId: location.id } } : {}),
      },
      select: { status: true },
    }),
    db.timeOffRequest.findMany({
      where: {
        ...scope,
        createdAt: { gte: from, lt: to },
        ...(location
          ? { user: { ...scope, locations: { some: { ...scope, locationId: location.id } } } }
          : {}),
      },
      select: { status: true },
    }),
  ]);
  return {
    timezone,
    ...aggregateAnalytics({
      ...query,
      timezone,
      now: new Date(),
      users: users.map((u) => ({ ...u, hourlyRate: Number(u.hourlyRate) })),
      shifts,
      swaps,
      timeOff,
    }),
  };
}
export async function auditLog(auth: Session, query: z.infer<typeof auditQuery>) {
  const where = {
    ...tenant(auth.organizationId),
    ...(query.action ? { action: query.action } : {}),
    ...(query.entity ? { entityType: query.entity } : {}),
  };
  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { actor: { select: { name: true } } },
    }),
    db.auditLog.count({ where }),
  ]);
  return { entries, total, page: query.page, pageSize: query.pageSize };
}
export async function updateAdminUser(
  auth: Session,
  id: string,
  body: z.infer<typeof adminUserBody> | 'reset',
) {
  return transaction(auth.organizationId, async (tx) => {
    const scope = tenant(auth.organizationId);
    const user = await tx.user.findFirst({ where: { ...scope, id } });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found.');
    if (user.role === 'OWNER')
      throw new AppError(403, 'FORBIDDEN', 'Owner accounts are protected.');
    const tempPassword = body === 'reset' ? randomBytes(18).toString('base64url') : undefined;
    const data = tempPassword
      ? { passwordHash: await bcrypt.hash(tempPassword, 12), mustChangePassword: true }
      : body === 'reset'
        ? {}
        : body;
    const updated = await tx.user.update({
      where: { organizationId_id: { ...scope, id } },
      data,
      select: publicUser,
    });
    await tx.auditLog.create({
      data: {
        ...scope,
        actorId: auth.id,
        action: tempPassword ? 'PASSWORD_RESET' : 'USER_UPDATED',
        entityType: 'User',
        entityId: id,
        details: tempPassword ? { reset: true } : data,
      },
    });
    return { user: updated, ...(tempPassword ? { tempPassword } : {}) };
  });
}
export async function updateProfile(auth: Session, body: z.infer<typeof profileBody>) {
  return transaction(auth.organizationId, async (tx) => {
    const scope = tenant(auth.organizationId);
    const user = await tx.user.findFirstOrThrow({ where: { ...scope, id: auth.id } });
    if (
      (body.password !== undefined || body.pin !== undefined) &&
      (!body.currentPassword || !(await bcrypt.compare(body.currentPassword, user.passwordHash)))
    )
      throw new AppError(403, 'INVALID_PASSWORD', 'Current password is incorrect.');
    return tx.user.update({
      where: { organizationId_id: { ...scope, id: auth.id } },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.emailNotifications !== undefined
          ? { emailNotifications: body.emailNotifications }
          : {}),
        ...(body.password
          ? { passwordHash: await bcrypt.hash(body.password, 12), mustChangePassword: false }
          : {}),
        ...(body.pin !== undefined
          ? { pinHash: body.pin === null ? null : await bcrypt.hash(body.pin, 12) }
          : {}),
      },
      select: publicUser,
    });
  });
}
export async function batchTeam(auth: Session, body: z.infer<typeof teamBatchBody>) {
  return transaction(auth.organizationId, async (tx) => {
    const scope = tenant(auth.organizationId);
    const users = await tx.user.findMany({ where: { ...scope, id: { in: body.ids } } });
    if (users.length !== body.ids.length) throw new AppError(404, 'NOT_FOUND', 'User not found.');
    if (users.some((u) => u.role === 'OWNER' || (auth.role !== 'OWNER' && u.role !== 'EMPLOYEE')))
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only owners can manage managers; owner accounts are protected.',
      );
    if (
      body.locationId &&
      !(await tx.location.findFirst({ where: { ...scope, id: body.locationId } }))
    )
      throw new AppError(404, 'NOT_FOUND', 'Location not found.');
    if (body.maxWeeklyHours !== undefined)
      await tx.user.updateMany({
        where: { ...scope, id: { in: body.ids } },
        data: { maxWeeklyHours: body.maxWeeklyHours },
      });
    if (body.locationId)
      await tx.userLocation.createMany({
        data: body.ids.map((userId) => ({ ...scope, userId, locationId: body.locationId! })),
        skipDuplicates: true,
      });
    await tx.auditLog.create({
      data: {
        ...scope,
        actorId: auth.id,
        action: 'USERS_BATCH_UPDATED',
        entityType: 'User',
        entityId: body.ids[0],
        details: body,
      },
    });
    return { updated: users.length };
  });
}

export async function getProfile(auth: Session) {
  return db.user.findFirstOrThrow({
    where: { ...tenant(auth.organizationId), id: auth.id },
    select: publicUser,
  });
}
