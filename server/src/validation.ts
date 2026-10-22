import { z } from 'zod';
import { DateTime, IANAZone } from 'luxon';
export const id = z.string().min(1).max(100);
export const idParams = z.object({ id }).strict();
export const timezone = z.string().refine((v) => IANAZone.isValidZone(v), 'Use an IANA timezone');
export const locationBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    timezone: timezone.default('UTC'),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    geofenceRadiusM: z.number().int().min(0).max(10000).default(100),
    clockInGraceMin: z.number().int().min(0).max(60).default(5),
  })
  .strict();
export const availabilityBody = z
  .object({
    availability: z
      .array(
        z
          .object({
            weekday: z.number().int().min(0).max(6),
            startMinute: z.number().int().min(0).max(1439),
            endMinute: z.number().int().min(1).max(1440),
          })
          .strict()
          .refine((v) => v.endMinute > v.startMinute, 'End must be after start'),
      )
      .max(70),
  })
  .strict()
  .superRefine(({ availability }, ctx) => {
    for (let day = 0; day < 7; day++) {
      const windows = availability
        .filter((a) => a.weekday === day)
        .sort((a, b) => a.startMinute - b.startMinute);
      if (windows.some((v, i) => i > 0 && v.startMinute < windows[i - 1].endMinute))
        ctx.addIssue({
          code: 'custom',
          message: 'Availability windows must not overlap.',
          path: ['availability'],
        });
    }
  });
export const shiftBody = z
  .object({
    locationId: id,
    userId: id.nullable(),
    startsAt: z
      .string()
      .datetime({ offset: true })
      .transform((v) => new Date(v)),
    endsAt: z
      .string()
      .datetime({ offset: true })
      .transform((v) => new Date(v)),
    position: z.string().trim().min(1).max(100).default('Team member'),
    notes: z.string().max(1000).nullable().optional(),
    force: z.boolean().default(false),
  })
  .strict()
  .refine(
    (s) => s.endsAt > s.startsAt && s.endsAt.getTime() - s.startsAt.getTime() <= 86400000,
    'Shift must end after it starts and last at most 24 hours',
  );
export const weekString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = DateTime.fromISO(v, { zone: 'UTC' });
    return d.isValid && d.weekday === 1;
  }, 'Week must be a valid Monday (YYYY-MM-DD)');
export const weekQuery = z.object({ week: weekString, locationId: id.optional() }).strict();
export const weekAction = z
  .object({ week: weekString, locationId: id, force: z.boolean().default(false) })
  .strict();
export function weekRange(week: string, zone: string) {
  const start = DateTime.fromISO(week, { zone }).startOf('day');
  return { start: start.toJSDate(), end: start.plus({ weeks: 1 }).toJSDate() };
}
