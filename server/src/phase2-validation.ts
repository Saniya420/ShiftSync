import { z } from 'zod';
import { DateTime } from 'luxon';
import { id } from './validation.js';
export const emptyBody = z.object({}).strict();
export const emptyQuery = emptyBody;
export const instant = z
  .string()
  .datetime({ offset: true })
  .transform((v) => new Date(v));
export const timeOffBody = z
  .object({ startsAt: instant, endsAt: instant, reason: z.string().trim().min(1).max(1000) })
  .strict()
  .refine((v) => v.endsAt > v.startsAt, 'End must be after start');
export const decisionBody = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).strict();
export const swapBody = z.object({ shiftId: id, targetUserId: id.optional() }).strict();
export const swapActionParams = z
  .object({ id, action: z.enum(['accept', 'approve', 'reject', 'cancel']) })
  .strict();
export const forceBody = z.object({ force: z.boolean().default(false) }).strict();
export const clockBody = z
  .object({
    shiftId: id,
    pin: z
      .string()
      .regex(/^\d{4,12}$/)
      .optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .strict()
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), 'Provide both coordinates');
export const correctionBody = z
  .object({
    clockInAt: instant.nullable(),
    clockOutAt: instant.nullable(),
    note: z.string().trim().min(1).max(1000),
  })
  .strict()
  .refine(
    (v) => !v.clockOutAt || (v.clockInAt && v.clockOutAt > v.clockInAt),
    'Clock-out requires an earlier clock-in',
  );
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => DateTime.fromISO(v).isValid, 'Use a valid date');
export const reportQuery = z
  .object({ from: date, to: date, locationId: id.optional() })
  .strict()
  .refine(
    (v) =>
      v.to >= v.from && DateTime.fromISO(v.to).diff(DateTime.fromISO(v.from), 'days').days <= 366,
    'Range must be ordered and at most one year',
  );
