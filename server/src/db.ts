import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from './config.js';
export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.DATABASE_URL }),
});
export const tenant = (organizationId: string) => ({ organizationId });
export const publicUser = {
  id: true,
  organizationId: true,
  email: true,
  name: true,
  role: true,
  hourlyRate: true,
  maxWeeklyHours: true,
} as const;
