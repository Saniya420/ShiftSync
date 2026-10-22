import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app.js';
import { db } from '../src/db.js';
const owner = request.agent(app);
const other = request.agent(app);
const employee = request.agent(app);
const manager = request.agent(app);
const suffix = randomUUID();
const password = 'IntegrationPass2026!';
let orgA: string,
  orgB: string,
  ownerId: string,
  employeeId: string,
  managerId: string,
  locationId: string,
  foreignLocationId: string;
const base = () => ({
  locationId,
  userId: employeeId,
  startsAt: '2026-10-19T09:00:00Z',
  endsAt: '2026-10-19T17:00:00Z',
  position: 'Cashier',
});
const week = () => ({ week: '2026-10-19', locationId });
beforeAll(async () => {
  const a = await owner
    .post('/api/auth/signup')
    .send({
      email: 'owner-' + suffix + '@test.local',
      password,
      name: 'Owner A',
      organizationName: 'Test A',
    })
    .expect(201);
  orgA = a.body.user.organizationId;
  ownerId = a.body.user.id;
  const b = await other
    .post('/api/auth/signup')
    .send({
      email: 'other-' + suffix + '@test.local',
      password,
      name: 'Owner B',
      organizationName: 'Test B',
    })
    .expect(201);
  orgB = b.body.user.organizationId;
  locationId = (
    await owner.post('/api/locations').send({ name: 'Shop A', timezone: 'UTC' }).expect(201)
  ).body.location.id;
  foreignLocationId = (
    await other.post('/api/locations').send({ name: 'Shop B', timezone: 'UTC' }).expect(201)
  ).body.location.id;
  for (const [agent, label] of [
    [employee, 'Employee'],
    [manager, 'Manager'],
  ] as const) {
    const email = label.toLowerCase() + '-' + suffix + '@test.local';
    const result = await owner
      .post('/api/users')
      .send({ name: label, email, hourlyRate: 20, maxWeeklyHours: 40, locationIds: [locationId] })
      .expect(201);
    if (label === 'Employee') employeeId = result.body.user.id;
    else {
      managerId = result.body.user.id;
      await db.user.update({
        where: { organizationId_id: { organizationId: orgA, id: managerId } },
        data: { role: 'MANAGER' },
      });
    }
    await agent
      .post('/api/auth/login')
      .send({ email, password: result.body.tempPassword })
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
  if (orgA) {
    await db.shift.deleteMany({ where: { organizationId: orgA } });
    await db.timeOffRequest.deleteMany({ where: { organizationId: orgA } });
  }
});
afterAll(async () => {
  for (const organizationId of [orgA, orgB].filter(Boolean)) {
    const where = { organizationId };
    await db.auditLog.deleteMany({ where });
    await db.attendanceRecord.deleteMany({ where });
    await db.swapRequest.deleteMany({ where });
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
describe('auth and access', () => {
  it('checks health against PostgreSQL', async () => {
    expect((await request(app).get('/api/health').expect(200)).body.database).toBe('connected');
  });
  it('uses httpOnly SameSite cookies and bcrypt cost 12', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner-' + suffix + '@test.local', password })
      .expect(200);
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(login.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(login.body.user.passwordHash).toBeUndefined();
    const user = await db.user.findFirstOrThrow({ where: { organizationId: orgA, id: ownerId } });
    expect(bcrypt.getRounds(user.passwordHash)).toBe(12);
  });
  it('supports me and logout and rejects bad credentials', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'owner-' + suffix + '@test.local', password })
      .expect(200);
    expect((await agent.get('/api/auth/me').expect(200)).body.user.role).toBe('OWNER');
    await agent.post('/api/auth/logout').send({}).expect(204);
    await agent.get('/api/auth/me').expect(401);
    await agent
      .post('/api/auth/login')
      .send({ email: 'owner-' + suffix + '@test.local', password: 'incorrect-password' })
      .expect(401);
    await request(app).get('/api/shifts').expect(401);
    await request(app).get('/api/auth/me').set('Cookie', 'shiftsync=forged').expect(401);
  });
  it('validates input, duplicate signup and origin', async () => {
    const invalid = await request(app).post('/api/auth/signup').send({ email: 'bad' }).expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    await request(app)
      .post('/api/auth/signup')
      .send({
        email: 'owner-' + suffix + '@test.local',
        password,
        name: 'Duplicate',
        organizationName: 'Duplicate',
      })
      .expect(409);
    await owner
      .post('/api/locations')
      .set('Origin', 'https://evil.example')
      .send({ name: 'Bad' })
      .expect(403);
    await owner.post('/api/locations').send({ name: 'Bad', organizationId: orgB }).expect(400);
    await owner.post('/api/locations').send({ name: 'Bad', timezone: 'No/Such_Zone' }).expect(400);
  });
  it('keeps users and locations tenant scoped', async () => {
    const users = (await owner.get('/api/users').expect(200)).body.users;
    expect(
      users.every(
        (u: { organizationId: string; passwordHash?: string }) =>
          u.organizationId === orgA && u.passwordHash === undefined,
      ),
    ).toBe(true);
    expect(
      (await other.get('/api/locations').expect(200)).body.locations.map(
        (l: { id: string }) => l.id,
      ),
    ).toEqual([foreignLocationId]);
    await other
      .put('/api/locations/' + locationId)
      .send({ name: 'Stolen', timezone: 'UTC' })
      .expect(404);
    await other.delete('/api/locations/' + locationId).expect(404);
    await owner
      .post('/api/users')
      .send({
        name: 'Bad',
        email: 'bad-' + suffix + '@test.local',
        hourlyRate: 1,
        maxWeeklyHours: 40,
        locationIds: [foreignLocationId],
      })
      .expect(404);
    await other
      .put('/api/users/' + employeeId)
      .send({ name: 'Stolen', hourlyRate: 1, maxWeeklyHours: 40, locationIds: [] })
      .expect(404);
  });
  it('enforces role boundaries and owner-only promotion', async () => {
    await employee.get('/api/users').expect(403);
    await employee.post('/api/locations').send({ name: 'Bad' }).expect(403);
    await employee.post('/api/shifts').send(base()).expect(403);
    await manager
      .put('/api/users/' + employeeId)
      .send({
        name: 'Employee',
        hourlyRate: 20,
        maxWeeklyHours: 40,
        locationIds: [locationId],
        role: 'MANAGER',
      })
      .expect(403);
    const result = await manager
      .post('/api/users')
      .send({
        name: 'New Hire',
        email: 'hire-' + suffix + '@test.local',
        hourlyRate: 18,
        maxWeeklyHours: 30,
        locationIds: [locationId],
      })
      .expect(201);
    expect(result.body.user.role).toBe('EMPLOYEE');
    expect(result.body.tempPassword.length).toBeGreaterThanOrEqual(12);
    await manager
      .post('/api/users')
      .send({
        name: 'Bad',
        email: 'bad2-' + suffix + '@test.local',
        hourlyRate: 18,
        maxWeeklyHours: 30,
        locationIds: [],
        role: 'OWNER',
      })
      .expect(400);
  });
  it('replaces only own availability and rejects invalid windows', async () => {
    await employee
      .put('/api/availability')
      .send({ availability: [{ weekday: 1, startMinute: 600, endMinute: 500 }] })
      .expect(400);
    await employee
      .put('/api/availability')
      .send({
        availability: [
          { weekday: 1, startMinute: 600, endMinute: 800 },
          { weekday: 1, startMinute: 700, endMinute: 900 },
        ],
      })
      .expect(400);
    const before = (await manager.get('/api/availability')).body.availability;
    await employee.put('/api/availability').send({ availability: [] }).expect(200);
    expect((await employee.get('/api/availability')).body.availability).toEqual([]);
    expect((await manager.get('/api/availability')).body.availability).toEqual(before);
    await employee
      .put('/api/availability')
      .send({
        availability: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          startMinute: 0,
          endMinute: 1440,
        })),
      })
      .expect(200);
  });
});
describe('roster operations', () => {
  it('creates, reads, edits and deletes a shift with warnings', async () => {
    const created = await owner.post('/api/shifts').send(base()).expect(201);
    expect(created.body.warnings).toEqual([]);
    const id = created.body.shift.id;
    const list = await owner.get('/api/shifts').query(week()).expect(200);
    expect(list.body.shifts[0].id).toBe(id);
    await owner
      .put('/api/shifts/' + id)
      .send({ ...base(), position: 'Floor team' })
      .expect(200);
    await owner.delete('/api/shifts/' + id).expect(204);
    expect((await owner.get('/api/shifts').query(week())).body.shifts).toHaveLength(0);
  });
  it('validates week, timestamps and membership', async () => {
    await owner.get('/api/shifts').query({ week: '2026-10-20' }).expect(400);
    await owner
      .post('/api/shifts')
      .send({ ...base(), endsAt: '2026-10-19T08:00:00Z' })
      .expect(400);
    await owner
      .post('/api/shifts')
      .send({ ...base(), userId: ownerId })
      .expect(404);
    await owner
      .post('/api/shifts')
      .send({ ...base(), organizationId: orgB })
      .expect(400);
    await owner
      .post('/api/shifts')
      .send({ ...base(), locationId: foreignLocationId })
      .expect(404);
    await owner
      .post('/api/shifts')
      .send({ ...base(), userId: null })
      .expect(201);
  });
  it('blocks overlap and supports explicit manager override on create and update', async () => {
    await owner.post('/api/shifts').send(base()).expect(201);
    const overlap = await manager.post('/api/shifts').send(base()).expect(409);
    expect(overlap.body.error.details.warnings[0].type).toBe('OVERLAP');
    const forced = await manager
      .post('/api/shifts')
      .send({ ...base(), force: true })
      .expect(201);
    expect(forced.body.warnings.map((w: { type: string }) => w.type)).toContain('OVERLAP');
    await manager
      .put('/api/shifts/' + forced.body.shift.id)
      .send(base())
      .expect(409);
    await manager
      .put('/api/shifts/' + forced.body.shift.id)
      .send({ ...base(), force: true })
      .expect(200);
  });
  it('rejects concurrent overlapping writes atomically', async () => {
    const results = await Promise.all([
      owner.post('/api/shifts').send(base()),
      manager.post('/api/shifts').send(base()),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.shift.count({ where: { organizationId: orgA } })).toBe(1);
  });
  it('warns about time off, availability and hours without blocking', async () => {
    await db.timeOffRequest.create({
      data: {
        organizationId: orgA,
        userId: employeeId,
        startsAt: new Date(base().startsAt),
        endsAt: new Date(base().endsAt),
        status: 'APPROVED',
      },
    });
    await db.user.update({
      where: { organizationId_id: { organizationId: orgA, id: employeeId } },
      data: { maxWeeklyHours: 1 },
    });
    await employee.put('/api/availability').send({ availability: [] }).expect(200);
    const result = await owner.post('/api/shifts').send(base()).expect(201);
    expect(result.body.warnings.map((w: { type: string }) => w.type)).toEqual(
      expect.arrayContaining(['TIME_OFF', 'OUTSIDE_AVAILABILITY', 'WEEKLY_HOURS']),
    );
    await db.user.update({
      where: { organizationId_id: { organizationId: orgA, id: employeeId } },
      data: { maxWeeklyHours: 40 },
    });
    await employee
      .put('/api/availability')
      .send({
        availability: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          startMinute: 0,
          endMinute: 1440,
        })),
      })
      .expect(200);
  });
  it('isolates cross-tenant shift reads and writes', async () => {
    const id = (await owner.post('/api/shifts').send(base()).expect(201)).body.shift.id;
    expect(
      (await other.get('/api/shifts').query({ week: '2026-10-19' }).expect(200)).body.shifts,
    ).toEqual([]);
    await other.get('/api/shifts').query(week()).expect(404);
    await other
      .put('/api/shifts/' + id)
      .send({ ...base(), locationId: foreignLocationId, userId: null })
      .expect(404);
    await other.delete('/api/shifts/' + id).expect(404);
    await other.post('/api/shifts/publish').send(week()).expect(404);
    await other.post('/api/shifts/copy-previous-week').send(week()).expect(404);
  });
  it('publishes only the selected week and exposes own published shifts', async () => {
    await owner.post('/api/shifts').send(base()).expect(201);
    await owner
      .post('/api/shifts')
      .send({ ...base(), userId: managerId })
      .expect(201);
    expect((await employee.get('/api/shifts').query(week()).expect(200)).body.shifts).toEqual([]);
    const publish = await owner.post('/api/shifts/publish').send(week()).expect(200);
    expect(publish.body.published).toBe(2);
    const list = (await employee.get('/api/shifts').query(week()).expect(200)).body.shifts;
    expect(list).toHaveLength(1);
    expect(list[0].userId).toBe(employeeId);
    expect(list[0].status).toBe('PUBLISHED');
    expect((await owner.post('/api/shifts/publish').send(week()).expect(200)).body.published).toBe(
      0,
    );
    await employee.post('/api/shifts/publish').send(week()).expect(403);
  });
  it('copies previous week as drafts and rolls back a conflicting batch', async () => {
    await owner
      .post('/api/shifts')
      .send({ ...base(), startsAt: '2026-10-12T09:00:00Z', endsAt: '2026-10-12T17:00:00Z' })
      .expect(201);
    const copy = await owner.post('/api/shifts/copy-previous-week').send(week()).expect(201);
    expect(copy.body.shifts).toHaveLength(1);
    expect(copy.body.shifts[0].startsAt).toBe(base().startsAt.replace('Z', '.000Z'));
    expect(copy.body.shifts[0].status).toBe('DRAFT');
    await owner.post('/api/shifts/copy-previous-week').send(week()).expect(409);
    expect((await owner.get('/api/shifts').query(week())).body.shifts).toHaveLength(1);
  });
  it('supports location CRUD and prevents deleting a location in use', async () => {
    const location = (
      await owner
        .post('/api/locations')
        .send({ name: 'Annex', timezone: 'Asia/Karachi' })
        .expect(201)
    ).body.location;
    await owner
      .put('/api/locations/' + location.id)
      .send({ name: 'West Annex', timezone: 'Asia/Karachi' })
      .expect(200);
    await owner.delete('/api/locations/' + location.id).expect(204);
    await owner.post('/api/shifts').send(base()).expect(201);
    await owner.delete('/api/locations/' + locationId).expect(409);
  });
});
