import type { Prisma } from '@prisma/client';
import type { Session } from '../auth.js';
import { db, tenant } from '../db.js';
import { AppError } from '../http.js';
import { transitionSwap, type SwapAction } from '../domain/swaps.js';
import { contextFor, transaction, warningsFor } from './roster.js';
const person = { select: { id: true, name: true } } as const;
export async function notify(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userIds: string[],
  title: string,
  message: string,
) {
  await tx.notification.createMany({
    data: [...new Set(userIds)].map((userId) => ({ organizationId, userId, title, message })),
  });
}
export async function listTimeOff(auth: Session) {
  return db.timeOffRequest.findMany({
    where: {
      ...tenant(auth.organizationId),
      ...(auth.role === 'EMPLOYEE' ? { userId: auth.id } : {}),
    },
    include: { user: person },
    orderBy: { createdAt: 'desc' },
  });
}
export async function createTimeOff(
  auth: Session,
  body: { startsAt: Date; endsAt: Date; reason: string },
) {
  return db.timeOffRequest.create({
    data: { ...body, ...tenant(auth.organizationId), userId: auth.id },
  });
}
export async function changeTimeOff(
  auth: Session,
  id: string,
  status: 'APPROVED' | 'REJECTED' | 'CANCELLED',
) {
  return transaction(auth.organizationId, async (tx) => {
    const request = await tx.timeOffRequest.findFirst({
      where: {
        ...tenant(auth.organizationId),
        id,
        ...(status === 'CANCELLED' ? { userId: auth.id } : {}),
      },
    });
    if (!request) throw new AppError(404, 'NOT_FOUND', 'Time-off request not found.');
    if (status !== 'CANCELLED' && auth.role === 'EMPLOYEE')
      throw new AppError(403, 'FORBIDDEN', 'Manager approval is required.');
    if (request.status !== 'PENDING' && !(status === 'CANCELLED' && request.status === 'APPROVED'))
      throw new AppError(409, 'INVALID_TRANSITION', 'This request has already been resolved.');
    const result = await tx.timeOffRequest.update({
      where: { organizationId_id: { ...tenant(auth.organizationId), id } },
      data: { status },
    });
    if (status !== 'CANCELLED')
      await notify(
        tx,
        auth.organizationId,
        [request.userId],
        'Time off ' + status.toLowerCase(),
        request.reason ?? 'Your time-off request was reviewed.',
      );
    return result;
  });
}
export async function coworkers(auth: Session, shiftId: string) {
  const shift = await db.shift.findFirst({
    where: {
      ...tenant(auth.organizationId),
      id: shiftId,
      userId: auth.id,
      status: 'PUBLISHED',
      startsAt: { gt: new Date() },
    },
  });
  if (!shift) throw new AppError(404, 'NOT_FOUND', 'Future published shift not found.');
  return db.user.findMany({
    where: {
      ...tenant(auth.organizationId),
      id: { not: auth.id },
      locations: { some: { ...tenant(auth.organizationId), locationId: shift.locationId } },
    },
    select: { id: true, name: true },
  });
}
export async function listSwaps(auth: Session) {
  const memberships = await db.userLocation.findMany({
    where: { ...tenant(auth.organizationId), userId: auth.id },
  });
  return db.swapRequest.findMany({
    where: {
      ...tenant(auth.organizationId),
      ...(auth.role === 'EMPLOYEE'
        ? {
            OR: [
              { requesterId: auth.id },
              { acceptedById: auth.id },
              {
                status: 'PENDING',
                OR: [{ targetUserId: null }, { targetUserId: auth.id }],
                shift: {
                  organizationId: auth.organizationId,
                  userId: { not: auth.id },
                  status: 'PUBLISHED',
                  startsAt: { gt: new Date() },
                  locationId: { in: memberships.map((m) => m.locationId) },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      requester: person,
      acceptedBy: person,
      target: person,
      shift: { include: { location: { select: { name: true, timezone: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
export async function createSwap(auth: Session, body: { shiftId: string; targetUserId?: string }) {
  return transaction(auth.organizationId, async (tx) => {
    const shift = await tx.shift.findFirst({
      where: {
        ...tenant(auth.organizationId),
        id: body.shiftId,
        userId: auth.id,
        status: 'PUBLISHED',
        startsAt: { gt: new Date() },
      },
    });
    if (!shift) throw new AppError(404, 'NOT_FOUND', 'Offer only your own future published shift.');
    if (
      await tx.attendanceRecord.findFirst({
        where: { ...tenant(auth.organizationId), shiftId: shift.id },
      })
    )
      throw new AppError(409, 'ATTENDANCE_EXISTS', 'A shift with attendance cannot be offered.');
    if (
      body.targetUserId &&
      (body.targetUserId === auth.id ||
        !(await tx.userLocation.findFirst({
          where: {
            ...tenant(auth.organizationId),
            userId: body.targetUserId,
            locationId: shift.locationId,
          },
        })))
    )
      throw new AppError(404, 'NOT_FOUND', 'Eligible coworker not found.');
    if (
      await tx.swapRequest.findFirst({
        where: {
          ...tenant(auth.organizationId),
          shiftId: shift.id,
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
      })
    )
      throw new AppError(409, 'ACTIVE_SWAP', 'This shift already has an active offer.');
    return tx.swapRequest.create({
      data: { ...body, ...tenant(auth.organizationId), requesterId: auth.id },
    });
  });
}
export async function actOnSwap(auth: Session, id: string, action: SwapAction, force: boolean) {
  return transaction(auth.organizationId, async (tx) => {
    const scope = tenant(auth.organizationId);
    const swap = await tx.swapRequest.findFirst({
      where: { ...scope, id },
      include: { shift: { include: { location: true } } },
    });
    if (!swap) throw new AppError(404, 'NOT_FOUND', 'Swap not found.');
    const eligible =
      (!swap.targetUserId || swap.targetUserId === auth.id) &&
      !!(await tx.userLocation.findFirst({
        where: { ...scope, userId: auth.id, locationId: swap.shift.locationId },
      }));
    const status = transitionSwap(swap.status, action, {
      isRequester: swap.requesterId === auth.id,
      isManager: auth.role !== 'EMPLOYEE',
      eligible,
    });
    if (!status)
      throw new AppError(
        409,
        'INVALID_TRANSITION',
        'This action is not available to you for this swap.',
      );
    if (
      ['accept', 'approve'].includes(action) &&
      (swap.shift.startsAt <= new Date() ||
        swap.shift.status !== 'PUBLISHED' ||
        swap.shift.userId !== swap.requesterId)
    )
      throw new AppError(
        409,
        'SHIFT_CHANGED',
        'The shift has started or its assignment has changed.',
      );
    if (
      ['accept', 'approve'].includes(action) &&
      (await tx.attendanceRecord.findFirst({ where: { ...scope, shiftId: swap.shiftId } }))
    )
      throw new AppError(409, 'ATTENDANCE_EXISTS', 'This shift already has attendance.');
    let warnings: ReturnType<typeof warningsFor> = [];
    if (status === 'APPROVED') {
      if (
        !swap.acceptedById ||
        !(await tx.userLocation.findFirst({
          where: { ...scope, userId: swap.acceptedById, locationId: swap.shift.locationId },
        }))
      )
        throw new AppError(
          409,
          'MEMBERSHIP_CHANGED',
          'The coworker is no longer assigned to this location.',
        );
      const context = await contextFor(
        tx,
        auth.organizationId,
        swap.shift.startsAt,
        swap.shift.endsAt,
      );
      warnings = warningsFor(
        { ...swap.shift, userId: swap.acceptedById },
        context,
        swap.shift.location.timezone,
      );
      if (warnings.length && !force)
        throw new AppError(409, 'SWAP_CONFLICT', 'Review conflicts before approving this swap.', {
          warnings,
        });
      await tx.shift.update({
        where: { organizationId_id: { ...scope, id: swap.shiftId } },
        data: { userId: swap.acceptedById },
      });
      await tx.auditLog.create({
        data: {
          ...scope,
          actorId: auth.id,
          action: 'SWAP_APPROVED',
          entityType: 'SwapRequest',
          entityId: id,
          details: { force, warnings: warnings.map((w) => w.type) },
        },
      });
    }
    await tx.swapRequest.updateMany({
      where: { ...scope, id, status: swap.status },
      data: { status, ...(status === 'ACCEPTED' ? { acceptedById: auth.id } : {}) },
    });
    if (['ACCEPTED', 'APPROVED', 'REJECTED'].includes(status)) {
      const managers =
        status === 'ACCEPTED'
          ? await tx.user.findMany({
              where: { ...scope, role: { in: ['OWNER', 'MANAGER'] } },
              select: { id: true },
            })
          : [];
      await notify(
        tx,
        auth.organizationId,
        [
          swap.requesterId,
          ...(swap.acceptedById ? [swap.acceptedById] : []),
          ...(status === 'ACCEPTED' ? [auth.id] : []),
          ...managers.map((m) => m.id),
        ],
        'Swap ' + status.toLowerCase(),
        'Shift on ' + swap.shift.startsAt.toISOString() + ': ' + status.toLowerCase() + '.',
      );
    }
    return { swap: await tx.swapRequest.findFirstOrThrow({ where: { ...scope, id } }), warnings };
  });
}
