import { randomUUID } from 'node:crypto';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db.js';
import { markNoShows } from '../src/services/attendance.js';
const owner = request.agent(app),
  employee = request.agent(app),
  coworker = request.agent(app),
  third = request.agent(app),
  foreign = request.agent(app);
let org: string,
  otherOrg: string,
  locationId: string,
  employeeId: string,
  coworkerId: string,
  foreignId: string;
const suffix = randomUUID();
beforeAll(async () => {
  const signup = async (agent: typeof owner, label: string) =>
    (
      await agent
        .post('/api/auth/signup')
        .send({
          organizationName: label,
          name: label,
          email: label + suffix + '@test.local',
          password: 'PhaseTwoTests2026!',
        })
        .expect(201)
    ).body.user;
  org = (await signup(owner, 'owner')).organizationId;
  const other = await signup(foreign, 'foreign');
  otherOrg = other.organizationId;
  foreignId = other.id;
  locationId = (
    await owner
      .post('/api/locations')
      .send({ name: 'Main', timezone: 'UTC', lat: 0, lng: 0, geofenceRadiusM: 100 })
      .expect(201)
  ).body.location.id;
  for (const [agent, name] of [
    [employee, 'worker'],
    [coworker, 'coworker'],
    [third, 'third'],
  ] as const) {
    const result = await owner
      .post('/api/users')
      .send({
        name,
        email: name + suffix + '@test.local',
        hourlyRate: 20,
        maxWeeklyHours: 40,
        locationIds: [locationId],
      })
      .expect(201);
    if (name === 'worker') employeeId = result.body.user.id;
    if (name === 'coworker') coworkerId = result.body.user.id;
    await agent
      .post('/api/auth/login')
      .send({ email: result.body.user.email, password: result.body.tempPassword })
      .expect(200);
    await agent
      .put('/api/availability')
      .send({
        availability: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          startMinute: 0,
          endMinute: 1440,
        })),
      })
      .expect(200);
  }
});
beforeEach(async () => {
  await db.shift.deleteMany({ where: { organizationId: org } });
  await db.timeOffRequest.deleteMany({ where: { organizationId: org } });
  await db.notification.deleteMany({ where: { organizationId: org } });
  await db.auditLog.deleteMany({ where: { organizationId: org } });
  await db.user.update({
    where: { organizationId_id: { organizationId: org, id: employeeId } },
    data: { pinHash: null },
  });
});
afterAll(async () => {
  for (const organizationId of [org, otherOrg].filter(Boolean)) {
    const where = { organizationId };
    await db.auditLog.deleteMany({ where });
    await db.shift.deleteMany({ where });
    await db.notification.deleteMany({ where });
    await db.timeOffRequest.deleteMany({ where });
    await db.availability.deleteMany({ where });
    await db.userLocation.deleteMany({ where });
    await db.user.deleteMany({ where });
    await db.location.deleteMany({ where });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
  await db.$disconnect();
});
async function shift(
  start = new Date(Date.now() + 86400000),
  end = new Date(+start + 8 * 3600000),
  userId = employeeId,
) {
  return db.shift.create({
    data: {
      organizationId: org,
      locationId,
      userId,
      startsAt: start,
      endsAt: end,
      status: 'PUBLISHED',
    },
  });
}
async function offer(shiftId: string, targetUserId?: string) {
  return (
    await employee
      .post('/api/swaps')
      .send({ shiftId, ...(targetUserId ? { targetUserId } : {}) })
      .expect(201)
  ).body.swap;
}
describe('time-off workflow', () => {
  it('creates, approves, feeds TIME_OFF conflicts and notifies; employees cannot decide', async () => {
    const s = await shift();
    const r = (
      await employee
        .post('/api/time-off')
        .send({
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          reason: 'Family',
        })
        .expect(201)
    ).body.request;
    await employee
      .post('/api/time-off/' + r.id + '/decision')
      .send({ status: 'APPROVED' })
      .expect(403);
    await owner
      .post('/api/time-off/' + r.id + '/decision')
      .send({ status: 'APPROVED' })
      .expect(200);
    const result = await owner
      .put('/api/shifts/' + s.id)
      .send({
        locationId,
        userId: employeeId,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
      })
      .expect(200);
    expect(result.body.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'TIME_OFF' })]),
    );
    expect((await employee.get('/api/notifications')).body.unreadCount).toBe(1);
    expect((await coworker.get('/api/time-off')).body.requests).toEqual([]);
    await employee
      .post('/api/time-off/' + r.id + '/cancel')
      .send({})
      .expect(200);
    await employee
      .post('/api/time-off/' + r.id + '/cancel')
      .send({})
      .expect(409);
  });
  it('denies and isolates reads, decisions, cancellation and payload tenants', async () => {
    const s = await shift();
    const body = {
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      reason: 'Trip',
    };
    await employee
      .post('/api/time-off')
      .send({ ...body, organizationId: otherOrg })
      .expect(400);
    await employee
      .post('/api/time-off')
      .send({ ...body, endsAt: body.startsAt })
      .expect(400);
    const r = (await employee.post('/api/time-off').send(body).expect(201)).body.request;
    expect((await foreign.get('/api/time-off')).body.requests).toEqual([]);
    await foreign
      .post('/api/time-off/' + r.id + '/decision')
      .send({ status: 'APPROVED' })
      .expect(404);
    await foreign
      .post('/api/time-off/' + r.id + '/cancel')
      .send({})
      .expect(404);
    await coworker
      .post('/api/time-off/' + r.id + '/cancel')
      .send({})
      .expect(404);
    await owner
      .post('/api/time-off/' + r.id + '/decision')
      .send({ status: 'REJECTED' })
      .expect(200);
    await owner
      .post('/api/time-off/' + r.id + '/decision')
      .send({ status: 'APPROVED' })
      .expect(409);
  });
});
describe('swap approval and concurrency', () => {
  it('accepts and atomically reassigns only after manager approval', async () => {
    const s = await shift();
    const r = await offer(s.id);
    await employee.post('/api/swaps').send({ shiftId: s.id }).expect(409);
    await employee
      .post('/api/swaps/' + r.id + '/accept')
      .send({})
      .expect(409);
    await coworker
      .post('/api/swaps/' + r.id + '/accept')
      .send({})
      .expect(200);
    expect(
      (await db.shift.findFirstOrThrow({ where: { organizationId: org, id: s.id } })).userId,
    ).toBe(employeeId);
    await coworker
      .post('/api/swaps/' + r.id + '/approve')
      .send({})
      .expect(403);
    await owner
      .post('/api/swaps/' + r.id + '/approve')
      .send({})
      .expect(200);
    expect(
      (await db.shift.findFirstOrThrow({ where: { organizationId: org, id: s.id } })).userId,
    ).toBe(coworkerId);
    await owner
      .post('/api/swaps/' + r.id + '/approve')
      .send({})
      .expect(409);
    expect(
      (await coworker.get('/api/notifications')).body.notifications.map(
        (n: { title: string }) => n.title,
      ),
    ).toContain('Swap approved');
  });
  it('rechecks all conflicts, rolls back, and allows explicit boolean force', async () => {
    const s = await shift();
    const r = await offer(s.id);
    await coworker
      .post('/api/swaps/' + r.id + '/accept')
      .send({})
      .expect(200);
    await shift(s.startsAt, s.endsAt, coworkerId);
    const result = await owner
      .post('/api/swaps/' + r.id + '/approve')
      .send({})
      .expect(409);
    expect(
      result.body.error.details.warnings.some((w: { type: string }) => w.type === 'OVERLAP'),
    ).toBe(true);
    expect(
      (await db.swapRequest.findFirstOrThrow({ where: { organizationId: org, id: r.id } })).status,
    ).toBe('ACCEPTED');
    expect(
      (await db.shift.findFirstOrThrow({ where: { organizationId: org, id: s.id } })).userId,
    ).toBe(employeeId);
    await owner
      .post('/api/swaps/' + r.id + '/approve')
      .send({ force: 'true' })
      .expect(400);
    await owner
      .post('/api/swaps/' + r.id + '/approve')
      .send({ force: true })
      .expect(200);
  });
  it('directs offers, rejects foreign references, and cancels accepted offers', async () => {
    const s = await shift();
    await employee.post('/api/swaps').send({ shiftId: s.id, targetUserId: foreignId }).expect(404);
    const r = await offer(s.id, coworkerId);
    expect((await third.get('/api/swaps')).body.swaps).toEqual([]);
    await third
      .post('/api/swaps/' + r.id + '/accept')
      .send({})
      .expect(409);
    await foreign
      .post('/api/swaps/' + r.id + '/accept')
      .send({})
      .expect(404);
    await foreign
      .post('/api/swaps/' + r.id + '/approve')
      .send({})
      .expect(404);
    expect((await foreign.get('/api/swaps')).body.swaps).toEqual([]);
    await foreign.get('/api/swaps/coworkers').query({ shiftId: s.id }).expect(404);
    await coworker
      .post('/api/swaps/' + r.id + '/accept')
      .send({})
      .expect(200);
    await employee
      .post('/api/swaps/' + r.id + '/cancel')
      .send({})
      .expect(200);
    await owner
      .post('/api/swaps/' + r.id + '/approve')
      .send({})
      .expect(409);
    await offer(s.id);
  });
  it('serializes competing accepts and prevents duplicate offers at DB level', async () => {
    const s = await shift();
    const r = await offer(s.id);
    await expect(
      db.swapRequest.create({
        data: { organizationId: org, shiftId: s.id, requesterId: employeeId },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    const responses = await Promise.all(
      [coworker, third].map((a) => a.post('/api/swaps/' + r.id + '/accept').send({})),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it('blocks an accepted swap and roster reassignment after an early clock-in', async () => {
    const s = await shift(new Date(Date.now() + 10 * 60000));
    const r = await offer(s.id);
    await coworker
      .post('/api/swaps/' + r.id + '/accept')
      .send({})
      .expect(200);
    await employee.post('/api/attendance/clock-in').send({ shiftId: s.id }).expect(200);
    const result = await owner
      .post('/api/swaps/' + r.id + '/approve')
      .send({ force: true })
      .expect(409);
    expect(result.body.error.code).toBe('ATTENDANCE_EXISTS');
    await owner
      .put('/api/shifts/' + s.id)
      .send({
        locationId,
        userId: coworkerId,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
      })
      .expect(409);
    expect(
      (await db.shift.findFirstOrThrow({ where: { organizationId: org, id: s.id } })).userId,
    ).toBe(employeeId);
  });
  it('rejects started, draft, and reassigned shifts and sends rejection notifications', async () => {
    const old = await shift(new Date(Date.now() - 1000));
    await employee.post('/api/swaps').send({ shiftId: old.id }).expect(404);
    const s = await shift();
    const r = await offer(s.id);
    await owner
      .post('/api/swaps/' + r.id + '/reject')
      .send({})
      .expect(200);
    expect((await employee.get('/api/notifications')).body.notifications[0].title).toBe(
      'Swap rejected',
    );
    const next = await offer(s.id);
    await db.shift.update({
      where: { organizationId_id: { organizationId: org, id: s.id } },
      data: { status: 'DRAFT' },
    });
    await coworker
      .post('/api/swaps/' + next.id + '/accept')
      .send({})
      .expect(409);
  });
});
describe('attendance clock rules, corrections and no-show job', () => {
  it('requires own published shift, the clock-in window, PIN and geofence', async () => {
    const future = await shift(new Date(Date.now() + 16 * 60000));
    await employee.post('/api/attendance/clock-in').send({ shiftId: future.id }).expect(409);
    const s = await shift(new Date(Date.now() - 10 * 60000));
    await foreign.post('/api/attendance/clock-in').send({ shiftId: s.id }).expect(404);
    await coworker.post('/api/attendance/clock-in').send({ shiftId: s.id }).expect(404);
    await employee.post('/api/attendance/clock-out').send({ shiftId: s.id }).expect(409);
    await db.user.update({
      where: { organizationId_id: { organizationId: org, id: employeeId } },
      data: { pinHash: await bcrypt.hash('1234', 12) },
    });
    await employee.post('/api/attendance/clock-in').send({ shiftId: s.id }).expect(403);
    await employee
      .post('/api/attendance/clock-in')
      .send({ shiftId: s.id, pin: '0000' })
      .expect(403);
    await employee
      .post('/api/attendance/clock-in')
      .send({ shiftId: s.id, pin: '1234', lat: 1, lng: 1 })
      .expect(403);
    await employee
      .post('/api/attendance/clock-in')
      .send({ shiftId: s.id, pin: '1234', lat: 0 })
      .expect(400);
    const record = (
      await employee
        .post('/api/attendance/clock-in')
        .send({ shiftId: s.id, pin: '1234', lat: 0, lng: 0 })
        .expect(200)
    ).body.record;
    expect(record.status).toBe('LATE');
    await employee
      .post('/api/attendance/clock-in')
      .send({ shiftId: s.id, pin: '1234' })
      .expect(409);
    const current = await employee.get('/api/attendance/current').expect(200);
    expect(current.body.record.id).toBe(record.id);
    expect((await foreign.get('/api/attendance/current')).body.shift).toBeNull();
    const out = await employee
      .post('/api/attendance/clock-out')
      .send({ shiftId: s.id, pin: '1234' })
      .expect(200);
    expect(out.body.record.status).toBe('EARLY_LEAVE');
    await employee
      .post('/api/attendance/clock-out')
      .send({ shiftId: s.id, pin: '1234' })
      .expect(409);
    await foreign
      .put('/api/attendance/' + record.id)
      .send({
        clockInAt: s.startsAt.toISOString(),
        clockOutAt: s.endsAt.toISOString(),
        note: 'Foreign',
      })
      .expect(404);
    await owner
      .put('/api/attendance/' + record.id)
      .send({ clockInAt: s.startsAt.toISOString(), clockOutAt: s.endsAt.toISOString(), note: ' ' })
      .expect(400);
    await employee
      .put('/api/attendance/' + record.id)
      .send({ clockInAt: null, clockOutAt: null, note: 'No' })
      .expect(403);
    await owner
      .put('/api/attendance/' + record.id)
      .send({
        clockInAt: s.startsAt.toISOString(),
        clockOutAt: s.endsAt.toISOString(),
        note: 'Verified time',
      })
      .expect(200);
    expect(
      await db.auditLog.count({
        where: { organizationId: org, entityId: record.id, action: 'ATTENDANCE_CORRECTED' },
      }),
    ).toBe(1);
  });
  it('allows optional coordinates, rejects ended shifts and prevents concurrent double clocks', async () => {
    const ended = await shift(new Date(Date.now() - 7200000), new Date(Date.now() - 1000));
    await employee.post('/api/attendance/clock-in').send({ shiftId: ended.id }).expect(409);
    const s = await shift(new Date(Date.now() - 60000));
    const results = await Promise.all(
      [1, 2].map(() => employee.post('/api/attendance/clock-in').send({ shiftId: s.id })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (await owner.get('/api/attendance').expect(200)).body.shifts.some(
        (v: { id: string }) => v.id === s.id,
      ),
    ).toBe(true);
    expect((await foreign.get('/api/attendance').expect(200)).body.shifts).toEqual([]);
    await employee.get('/api/attendance').expect(403);
  });
  it('marks no-shows only after 30 minutes, once, within tenant scope', async () => {
    const now = new Date();
    const ended = await shift(new Date(+now - 4 * 3600000), new Date(+now - 31 * 60000));
    await shift(new Date(+now - 3 * 3600000), new Date(+now - 30 * 60000));
    expect(await markNoShows(otherOrg, now)).toBe(0);
    expect(await markNoShows(org, now)).toBe(1);
    expect(await markNoShows(org, now)).toBe(0);
    expect(
      (
        await db.attendanceRecord.findFirstOrThrow({
          where: { organizationId: org, shiftId: ended.id },
        })
      ).status,
    ).toBe('NO_SHOW');
    expect((await employee.get('/api/notifications')).body.unreadCount).toBe(1);
  });
});
describe('reports and notification isolation', () => {
  it('includes work at other locations in the weekly overtime threshold', async () => {
    const otherLocation = await db.location.create({
      data: { organizationId: org, name: 'Annex' },
    });
    await db.user.update({
      where: { organizationId_id: { organizationId: org, id: employeeId } },
      data: { maxWeeklyHours: 8 },
    });
    try {
      const first = await db.shift.create({
        data: {
          organizationId: org,
          locationId: otherLocation.id,
          userId: employeeId,
          startsAt: new Date('2026-10-19T09:00Z'),
          endsAt: new Date('2026-10-19T17:00Z'),
          status: 'PUBLISHED',
        },
      });
      const second = await shift(new Date('2026-10-20T09:00Z'), new Date('2026-10-20T17:00Z'));
      for (const s of [first, second])
        await db.attendanceRecord.create({
          data: {
            organizationId: org,
            shiftId: s.id,
            userId: employeeId,
            clockInAt: s.startsAt,
            clockOutAt: s.endsAt,
          },
        });
      const report = await owner
        .get('/api/timesheets')
        .query({ from: '2026-10-20', to: '2026-10-20', locationId })
        .expect(200);
      const row = report.body.rows.find((r: { userId: string }) => r.userId === employeeId);
      expect(row.actualHours).toBe(8);
      expect(row.overtimeHours).toBe(8);
      expect(row.scheduledHours).toBe(8);
    } finally {
      await db.user.update({
        where: { organizationId_id: { organizationId: org, id: employeeId } },
        data: { maxWeeklyHours: 40 },
      });
      await db.shift.deleteMany({ where: { organizationId: org, locationId: otherLocation.id } });
      await db.location.delete({
        where: { organizationId_id: { organizationId: org, id: otherLocation.id } },
      });
    }
  });
  it('exports completed hours and isolates manager reports and own notifications', async () => {
    const s = await shift(new Date('2026-10-19T09:00Z'), new Date('2026-10-19T17:00Z'));
    await db.attendanceRecord.create({
      data: {
        organizationId: org,
        shiftId: s.id,
        userId: employeeId,
        clockInAt: new Date('2026-10-19T09:10Z'),
        clockOutAt: s.endsAt,
        status: 'LATE',
      },
    });
    const params = { from: '2026-10-19', to: '2026-10-25' };
    const rows = (await owner.get('/api/timesheets').query(params).expect(200)).body.rows;
    const row = rows.find((r: { userId: string }) => r.userId === employeeId);
    expect(row.scheduledHours).toBe(8);
    expect(row.actualHours).toBeCloseTo(7 + 5 / 6);
    expect(row.lateCount).toBe(1);
    expect(row.estimatedCost).toBe(160);
    expect((await owner.get('/api/timesheets.csv').query(params).expect(200)).text).toContain(
      'worker',
    );
    expect(
      (await foreign.get('/api/timesheets').query(params).expect(200)).body.rows.some(
        (r: { userId: string }) => r.userId === employeeId,
      ),
    ).toBe(false);
    await foreign
      .get('/api/timesheets')
      .query({ ...params, locationId })
      .expect(404);
    await foreign
      .get('/api/timesheets.csv')
      .query({ ...params, locationId })
      .expect(404);
    await employee.get('/api/timesheets').query(params).expect(403);
    await employee.get('/api/timesheets.csv').query(params).expect(403);
    await owner.get('/api/timesheets').query({ from: '2026-02-30', to: '2026-03-02' }).expect(400);
    const n = await db.notification.create({
      data: { organizationId: org, userId: employeeId, title: 'Private', message: 'Employee only' },
    });
    expect((await foreign.get('/api/notifications')).body.notifications).toEqual([]);
    await foreign
      .post('/api/notifications/' + n.id + '/read')
      .send({})
      .expect(404);
    await owner
      .post('/api/notifications/' + n.id + '/read')
      .send({})
      .expect(404);
    await employee
      .post('/api/notifications/' + n.id + '/read')
      .send({})
      .expect(204);
    expect((await employee.get('/api/notifications')).body.unreadCount).toBe(0);
    await employee.post('/api/notifications/read-all').send({}).expect(204);
    await foreign.post('/api/notifications/read-all').send({}).expect(204);
  });
});
