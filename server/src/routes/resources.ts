import { teamQuery } from '../phase3-validation.js';
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db, publicUser, tenant } from '../db.js';
import { requireRole } from '../auth.js';
import { AppError, route } from '../http.js';
import { availabilityBody, id, idParams, locationBody } from '../validation.js';
export const resourceRouter = Router();
const managers = requireRole('OWNER', 'MANAGER');
resourceRouter.get(
  '/locations',
  route(async (req, res) => {
    res.json({
      locations: await db.location.findMany({
        where: tenant(req.auth.organizationId),
        orderBy: { name: 'asc' },
      }),
    });
  }),
);
resourceRouter.get(
  '/locations/:id',
  route(async (req, res) => {
    const { id } = idParams.parse(req.params);
    const location = await db.location.findFirst({
      where: { ...tenant(req.auth.organizationId), id },
    });
    if (!location) throw new AppError(404, 'NOT_FOUND', 'Location not found.');
    res.json({ location });
  }),
);
resourceRouter.post(
  '/locations',
  managers,
  route(async (req, res) => {
    const data = locationBody.parse(req.body);
    res.status(201).json({
      location: await db.location.create({
        data: { ...data, ...tenant(req.auth.organizationId) },
      }),
    });
  }),
);
resourceRouter.put(
  '/locations/:id',
  managers,
  route(async (req, res) => {
    const { id } = idParams.parse(req.params);
    const data = locationBody.parse(req.body);
    const location = await db.location.update({
      where: { organizationId_id: { ...tenant(req.auth.organizationId), id } },
      data,
    });
    res.json({ location });
  }),
);
resourceRouter.delete(
  '/locations/:id',
  managers,
  route(async (req, res) => {
    const { id } = idParams.parse(req.params);
    await db.location.delete({
      where: { organizationId_id: { ...tenant(req.auth.organizationId), id } },
    });
    res.status(204).end();
  }),
);
resourceRouter.get(
  '/users',
  managers,
  route(async (req, res) => {
    const query = teamQuery.parse(req.query);
    res.json({
      users: await db.user.findMany({
        where: {
          ...tenant(req.auth.organizationId),
          ...(query.search
            ? {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' as const } },
                  { email: { contains: query.search, mode: 'insensitive' as const } },
                ],
              }
            : {}),
          ...(query.role ? { role: query.role } : {}),
          ...(query.locationId
            ? {
                locations: {
                  some: { ...tenant(req.auth.organizationId), locationId: query.locationId },
                },
              }
            : {}),
        },
        select: { ...publicUser, locations: { select: { locationId: true } } },
        orderBy: { name: 'asc' },
      }),
    });
  }),
);
const profile = z
  .object({
    name: z.string().trim().min(1).max(100),
    hourlyRate: z.number().min(0).max(10000),
    maxWeeklyHours: z.number().min(0).max(168),
    locationIds: z
      .array(id)
      .max(100)
      .refine((v) => new Set(v).size === v.length, 'Duplicate locations'),
  })
  .strict();
async function checkLocations(organizationId: string, locationIds: string[]) {
  const count = await db.location.count({
    where: { ...tenant(organizationId), id: { in: locationIds } },
  });
  if (count !== locationIds.length) throw new AppError(404, 'NOT_FOUND', 'Location not found.');
}
resourceRouter.post(
  '/users',
  managers,
  route(async (req, res) => {
    const body = profile
      .extend({
        email: z
          .string()
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
      })
      .parse(req.body);
    await checkLocations(req.auth.organizationId, body.locationIds);
    const tempPassword = randomBytes(15).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const { locationIds, ...data } = body;
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { ...data, passwordHash, role: 'EMPLOYEE', ...tenant(req.auth.organizationId) },
        select: publicUser,
      });
      await tx.userLocation.createMany({
        data: locationIds.map((locationId) => ({
          locationId,
          userId: created.id,
          organizationId: req.auth.organizationId,
        })),
      });
      return created;
    });
    res.status(201).json({ user, tempPassword });
  }),
);
resourceRouter.put(
  '/users/:id',
  managers,
  route(async (req, res) => {
    const { id } = idParams.parse(req.params);
    const body = profile
      .extend({ role: z.enum(['MANAGER', 'EMPLOYEE']).optional() })
      .parse(req.body);
    const existing = await db.user.findFirst({ where: { ...tenant(req.auth.organizationId), id } });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'User not found.');
    if (
      existing.role === 'OWNER' ||
      (req.auth.role !== 'OWNER' && (existing.role !== 'EMPLOYEE' || body.role === 'MANAGER'))
    )
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only the owner can manage managers; owner accounts cannot be changed here.',
      );
    await checkLocations(req.auth.organizationId, body.locationIds);
    const { locationIds, ...data } = body;
    const user = await db.$transaction(async (tx) => {
      await tx.userLocation.deleteMany({
        where: { ...tenant(req.auth.organizationId), userId: id },
      });
      const updated = await tx.user.update({
        where: { organizationId_id: { ...tenant(req.auth.organizationId), id } },
        data,
        select: publicUser,
      });
      await tx.userLocation.createMany({
        data: locationIds.map((locationId) => ({
          locationId,
          userId: id,
          organizationId: req.auth.organizationId,
        })),
      });
      return updated;
    });
    res.json({ user });
  }),
);
resourceRouter.get(
  '/availability',
  route(async (req, res) => {
    res.json({
      availability: await db.availability.findMany({
        where: { ...tenant(req.auth.organizationId), userId: req.auth.id },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      }),
    });
  }),
);
resourceRouter.put(
  '/availability',
  route(async (req, res) => {
    const { availability } = availabilityBody.parse(req.body);
    await db.$transaction(async (tx) => {
      await tx.availability.deleteMany({
        where: { ...tenant(req.auth.organizationId), userId: req.auth.id },
      });
      await tx.availability.createMany({
        data: availability.map((a) => ({
          ...a,
          ...tenant(req.auth.organizationId),
          userId: req.auth.id,
        })),
      });
    });
    res.json({ availability });
  }),
);
