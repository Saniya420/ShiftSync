import { z } from 'zod';
import { id, weekAction } from './validation.js';
import { date } from './phase2-validation.js';
import { credentials } from './auth.js';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const suggestBody = weekAction
  .omit({ force: true })
  .extend({
    needs: z
      .array(
        z
          .object({
            weekday: z.number().int().min(0).max(6),
            start: time,
            end: time,
            headcount: z.number().int().min(1).max(30),
            position: z.string().trim().min(1).max(100),
          })
          .strict()
          .refine((v) => v.start !== v.end, 'Use different start and end times'),
      )
      .min(1)
      .max(70),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .refine((v) => v.needs.reduce((n, r) => n + r.headcount, 0) <= 500, 'At most 500 shifts');
export const proposedShift = z
  .object({
    userId: id,
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    position: z.string().trim().min(1).max(100),
  })
  .strict()
  .refine(
    (s) =>
      Date.parse(s.endsAt) > Date.parse(s.startsAt) &&
      Date.parse(s.endsAt) - Date.parse(s.startsAt) <= 86400000,
    'Invalid duration',
  );
export const applySuggestionBody = weekAction.extend({
  shifts: z.array(proposedShift).min(1).max(500),
});
export const ids = z
  .array(id)
  .min(1)
  .max(100)
  .refine((v) => new Set(v).size === v.length, 'Duplicate IDs');
export const teamBatchBody = z
  .object({ ids, locationId: id.optional(), maxWeeklyHours: z.number().min(0).max(168).optional() })
  .strict()
  .refine((v) => v.locationId !== undefined || v.maxWeeklyHours !== undefined, 'Choose an update');
export const decisionBatchBody = z
  .object({ ids, status: z.enum(['APPROVED', 'REJECTED']) })
  .strict();
export const deleteBatchBody = z.object({ ids }).strict();
export const publishDaysBody = weekAction.extend({
  days: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .refine((v) => new Set(v).size === v.length, 'Duplicate days'),
});
export const profileBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    emailNotifications: z.boolean().optional(),
    currentPassword: z.string().max(72).optional(),
    password: credentials.shape.password.optional(),
    pin: z
      .string()
      .regex(/^\d{4,12}$/)
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    (v) => !(v.password !== undefined || v.pin !== undefined) || !!v.currentPassword,
    'Current password is required',
  );
export const adminUserBody = z
  .object({ role: z.enum(['MANAGER', 'EMPLOYEE']).optional(), active: z.boolean().optional() })
  .strict()
  .refine((v) => v.role !== undefined || v.active !== undefined, 'Choose an update');
export const auditQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    action: z.string().max(100).optional(),
    entity: z.string().max(100).optional(),
  })
  .strict();
export const teamQuery = z
  .object({
    search: z.string().max(100).optional(),
    role: z.enum(['OWNER', 'MANAGER', 'EMPLOYEE']).optional(),
    locationId: id.optional(),
  })
  .strict();

export const requestQuery = z
  .object({
    status: z.enum(['PENDING', 'ACCEPTED', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
    from: date.optional(),
    to: date.optional(),
  })
  .strict()
  .refine(
    (v) => (!v.from && !v.to) || (!!v.from && !!v.to && v.to >= v.from),
    'Provide an ordered date range',
  );
