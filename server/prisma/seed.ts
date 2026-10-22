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
      if (startsAt.plus({ hours: 7 }) < DateTime.now()) {
        const index = accounts.indexOf(account) % 3;
        const status = index === 0 ? 'NO_SHOW' : index === 1 ? 'LATE' : 'ON_TIME';
        await db.attendanceRecord.upsert({
          where: { organizationId_shiftId_userId: { organizationId, shiftId, userId: id } },
          update: {},
          create: {
            organizationId,
            shiftId,
            userId: id,
            status,
            clockInAt:
              status === 'NO_SHOW'
                ? null
                : startsAt.plus({ minutes: status === 'LATE' ? 12 : 0 }).toJSDate(),
            clockOutAt: status === 'NO_SHOW' ? null : startsAt.plus({ hours: 7 }).toJSDate(),
          },
        });
      }
    }
  }
  const requestId = 'demo-time-off-' + monday.toISODate();
  await db.timeOffRequest.upsert({
    where: { organizationId_id: { organizationId, id: requestId } },
    update: {},
    create: {
      id: requestId,
      organizationId,
      userId: 'demo-employee-2',
      startsAt: monday.plus({ days: 5 }).toJSDate(),
      endsAt: monday.plus({ days: 7 }).toJSDate(),
      reason: 'Family visiting for the weekend',
    },
  });
  // Create a future offer even when seeding late in the workweek.
  const offerStart = DateTime.now()
    .setZone(timezone)
    .plus({ days: 1 })
    // 07:00-11:00 so it doesn't overlap demo-employee-1's regular 12:00-19:00 shift.
    .set({ hour: 7, minute: 0, second: 0, millisecond: 0 });
  const offerShiftId = 'demo-offer-' + monday.toISODate();
  const offered = await db.shift.upsert({
    where: { organizationId_id: { organizationId, id: offerShiftId } },
    update: { startsAt: offerStart.toJSDate(), endsAt: offerStart.plus({ hours: 4 }).toJSDate() },
    create: {
      id: offerShiftId,
      organizationId,
      locationId,
      userId: 'demo-employee-1',
      startsAt: offerStart.toJSDate(),
      endsAt: offerStart.plus({ hours: 4 }).toJSDate(),
      status: 'PUBLISHED',
      position: 'Weekend cover',
    },
  });
  const swapId = 'demo-swap-' + monday.toISODate();
  if (
    !(await db.swapRequest.findFirst({
      where: {
        organizationId,
        OR: [{ id: swapId }, { shiftId: offered.id, status: { in: ['PENDING', 'ACCEPTED'] } }],
      },
    }))
  ) {
    await db.swapRequest.create({
      data: { id: swapId, organizationId, shiftId: offered.id, requesterId: 'demo-employee-1' },
    });
  }
  for (const account of accounts) {
    const notificationId = 'demo-notification-' + account.id + '-' + monday.toISODate();
    if (!(await db.notification.findFirst({ where: { organizationId, id: notificationId } })))
      await db.notification.create({
        data: {
          id: notificationId,
          organizationId,
          userId: account.id,
          title: 'Welcome to your week',
          message: 'Your schedule is ready. Check your shifts and team requests.',
        },
      });
  }
  console.info('Corner Mart demo is ready. See prisma/SEED_ACCOUNTS.md for logins.');
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
