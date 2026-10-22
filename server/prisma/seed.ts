import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient, type Role } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaPg } from '@prisma/adapter-pg';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Demo seed is disabled in production.');
  const organizationId = 'demo-corner-mart';
  const locationId = 'demo-main-street';
  const timezone = 'Asia/Karachi';
  const passwordHash = await bcrypt.hash('CornerMart2026!', 12);
  await db.organization.upsert({
    where: { id: organizationId },
    update: {},
    create: { id: organizationId, name: 'Corner Mart', timezone },
  });
  await db.location.upsert({
    where: { organizationId_id: { organizationId, id: locationId } },
    update: {},
    create: { id: locationId, organizationId, name: 'Main Street', timezone },
  });
  const accounts: { id: string; name: string; email: string; role: Role; hourlyRate: number }[] = [
    {
      id: 'demo-owner',
      name: 'Sam Taylor',
      email: 'owner@cornermart.demo',
      role: 'OWNER',
      hourlyRate: 25,
    },
    {
      id: 'demo-manager',
      name: 'Maya Chen',
      email: 'manager@cornermart.demo',
      role: 'MANAGER',
      hourlyRate: 22,
    },
    ...['Alex Rivera', 'Jordan Ellis', 'Aisha Khan', 'Noah Brooks', 'Priya Shah', 'Leo Martin'].map(
      (name, i) => ({
        id: 'demo-employee-' + (i + 1),
        name,
        email: 'employee' + (i + 1) + '@cornermart.demo',
        role: 'EMPLOYEE' as const,
        hourlyRate: 15 + i,
      }),
    ),
  ];
  const monday = DateTime.now().setZone(timezone).startOf('week');
  for (const account of accounts) {
    const { id, ...data } = account;
    await db.user.upsert({
      where: { organizationId_id: { organizationId, id } },
      update: {},
      create: { id, ...data, organizationId, passwordHash, maxWeeklyHours: 40 },
    });
    await db.userLocation.upsert({
      where: { organizationId_userId_locationId: { organizationId, userId: id, locationId } },
      update: {},
      create: { organizationId, userId: id, locationId },
    });
    for (let weekday = 0; weekday < 7; weekday++)
      await db.availability.upsert({
        where: {
          organizationId_userId_weekday_startMinute: {
            organizationId,
            userId: id,
            weekday,
            startMinute: 360,
          },
        },
        update: {},
        create: { organizationId, userId: id, weekday, startMinute: 360, endMinute: 1380 },
      });
    if (account.role !== 'EMPLOYEE') continue;
    for (let day = 0; day < 5; day++) {
      const startsAt = monday
        .plus({ days: day })
        .set({ hour: 8 + (accounts.indexOf(account) % 3) * 2 });
      const shiftId = id + '-' + monday.toISODate() + '-' + day;
      await db.shift.upsert({
        where: { organizationId_id: { organizationId, id: shiftId } },
        update: {},
        create: {
          id: shiftId,
          organizationId,
          locationId,
          userId: id,
          startsAt: startsAt.toJSDate(),
          endsAt: startsAt.plus({ hours: 7 }).toJSDate(),
          position: day % 2 ? 'Customer service' : 'Floor team',
          status: 'PUBLISHED',
        },
      });
    }
  }
  console.info('Corner Mart demo is ready. See prisma/SEED_ACCOUNTS.md for logins.');
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
