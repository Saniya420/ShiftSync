import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app.js';
import { db } from '../src/db.js';
import { notify } from '../src/services/notifications.js';
import { processEmailOutbox } from '../src/services/email.js';
const owner = request.agent(app),
  manager = request.agent(app),
  employee = request.agent(app),
  foreign = request.agent(app);
const suffix = randomUUID(),
  password = 'PhaseThreePassword2026!';
let org = '',
  otherOrg = '',
  locationId = '',
  foreignLocation = '',
  employeeId = '',
  managerId = '',
  ownerId = '',
  foreignId = '',
  hash = '';
const week = '2026-10-19';
const proposal = () => ({
  userId: employeeId,
  startsAt: '2026-10-19T09:00:00Z',
  endsAt: '2026-10-19T17:00:00Z',
  position: 'Floor',
});
const apply = () => ({ week, locationId, shifts: [proposal()] });
const suggestion = () => ({
  week,
  locationId,
  needs: [{ weekday: 1, start: '09:00', end: '17:00', headcount: 1, position: 'Floor' }],
});
beforeAll(async () => {
  const a = await owner
    .post('/api/auth/signup')
    .send({
      name: 'Owner',
      email: 'phase3-owner-' + suffix + '@test.local',
      password,
      organizationName: 'Phase 3',
    })
    .expect(201);
  org = a.body.user.organizationId;
  ownerId = a.body.user.id;
  const b = await foreign
    .post('/api/auth/signup')
    .send({
      name: 'Other',
      email: 'phase3-foreign-' + suffix + '@test.local',
      password,
      organizationName: 'Other',
    })
    .expect(201);
  otherOrg = b.body.user.organizationId;
  foreignId = b.body.user.id;
  locationId = (
    await owner.post('/api/locations').send({ name: 'Main', timezone: 'UTC' }).expect(201)
  ).body.location.id;
  foreignLocation = (
    await foreign.post('/api/locations').send({ name: 'Foreign', timezone: 'UTC' }).expect(201)
  ).body.location.id;
  hash = await bcrypt.hash(password, 12);
  for (const [agent, label] of [
    [manager, 'manager'],
    [employee, 'employee'],
  ] as const) {
    const email = 'phase3-' + label + '-' + suffix + '@test.local';
    const u = await db.user.create({
      data: {
        organizationId: org,
        name: label,
        email,
        passwordHash: hash,
        role: label === 'manager' ? 'MANAGER' : 'EMPLOYEE',
        hourlyRate: 20,
      },
    });
    await db.userLocation.create({ data: { organizationId: org, userId: u.id, locationId } });
    if (label === 'manager') managerId = u.id;
    else employeeId = u.id;
    await db.availability.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => ({
        organizationId: org,
        userId: u.id,
        weekday,
        startMinute: 0,
        endMinute: 1440,
      })),
    });
    await agent.post('/api/auth/login').send({ email, password }).expect(200);
  }
});
beforeEach(async () => {
  await db.emailOutbox.deleteMany({ where: { organizationId: org } });
  await db.notification.deleteMany({ where: { organizationId: org } });
  await db.shift.deleteMany({ where: { organizationId: org } });
  await db.timeOffRequest.deleteMany({ where: { organizationId: org } });
  await db.user.updateMany({
    where: { organizationId: org, id: employeeId },
    data: {
      active: true,
      emailNotifications: true,
      mustChangePassword: false,
      passwordHash: hash,
      maxWeeklyHours: 40,
      role: 'EMPLOYEE',
      pinHash: null,
    },
  });
});
afterAll(async () => {
  for (const organizationId of [org, otherOrg].filter(Boolean)) {
    await db.auditLog.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
  await db.$disconnect();
});
it('suggests safely without a key, excludes inactive users and does not save', async () => {
  await db.user.updateMany({
    where: { organizationId: org, id: managerId },
    data: { active: false },
  });
  const r = await owner.post('/api/ai/suggest-roster').send(suggestion()).expect(200);
  expect(r.body.source).toBe('heuristic');
  expect(r.body.shifts[0].userId).toBe(employeeId);
  expect(await db.shift.count({ where: { organizationId: org } })).toBe(0);
  await db.user.updateMany({
    where: { organizationId: org, id: managerId },
    data: { active: true },
  });
});
it('denies employee AI and foreign locations; validates needs', async () => {
  await employee.post('/api/ai/suggest-roster').send(suggestion()).expect(403);
  await owner
    .post('/api/ai/suggest-roster')
    .send({ ...suggestion(), locationId: foreignLocation })
    .expect(404);
  await owner
    .post('/api/ai/suggest-roster')
    .send({ ...suggestion(), organizationId: otherOrg })
    .expect(400);
  await owner
    .post('/api/ai/suggest-roster')
    .send({ ...suggestion(), needs: [{ ...suggestion().needs[0], start: '25:00' }] })
    .expect(400);
});
it('applies only drafts atomically with between-suggestion conflicts and explicit override', async () => {
  const r = await owner.post('/api/ai/apply-suggestion').send(apply()).expect(201);
  expect(r.body.shifts[0].status).toBe('DRAFT');
  await owner.post('/api/ai/apply-suggestion').send(apply()).expect(409);
  expect(await db.shift.count({ where: { organizationId: org } })).toBe(1);
  await owner
    .post('/api/ai/apply-suggestion')
    .send({ ...apply(), force: true })
    .expect(201);
  await db.shift.deleteMany({ where: { organizationId: org } });
  await owner
    .post('/api/ai/apply-suggestion')
    .send({ ...apply(), shifts: [proposal(), proposal()] })
    .expect(409);
  expect(await db.shift.count({ where: { organizationId: org } })).toBe(0);
});
it('rejects foreign/inactive assignees, outside-week times, invalid force and employee apply', async () => {
  await owner
    .post('/api/ai/apply-suggestion')
    .send({ ...apply(), shifts: [{ ...proposal(), userId: foreignId }] })
    .expect(404);
  await owner
    .post('/api/ai/apply-suggestion')
    .send({
      ...apply(),
      shifts: [{ ...proposal(), startsAt: '2026-10-18T09:00:00Z', endsAt: '2026-10-18T17:00:00Z' }],
    })
    .expect(400);
  await owner
    .post('/api/ai/apply-suggestion')
    .send({ ...apply(), force: 'true' })
    .expect(400);
  await employee.post('/api/ai/apply-suggestion').send(apply()).expect(403);
  await db.user.updateMany({
    where: { organizationId: org, id: employeeId },
    data: { active: false },
  });
  await owner.post('/api/ai/apply-suggestion').send(apply()).expect(404);
  await owner
    .post('/api/shifts')
    .send({ ...proposal(), locationId })
    .expect(404);
});
it('publishes only selected local days and enqueues mail once', async () => {
  await owner
    .post('/api/ai/apply-suggestion')
    .send({
      ...apply(),
      shifts: [
        proposal(),
        { ...proposal(), startsAt: '2026-10-20T09:00:00Z', endsAt: '2026-10-20T17:00:00Z' },
      ],
    })
    .expect(201);
  const r = await manager
    .post('/api/shifts/publish-days')
    .send({ week, locationId, days: [1] })
    .expect(200);
  expect(r.body.published).toBe(1);
  expect(await db.emailOutbox.count({ where: { organizationId: org } })).toBe(1);
  expect(
    (
      await manager
        .post('/api/shifts/publish-days')
        .send({ week, locationId, days: [1] })
        .expect(200)
    ).body.published,
  ).toBe(0);
  expect(await db.emailOutbox.count({ where: { organizationId: org } })).toBe(1);
  await employee
    .post('/api/shifts/publish-days')
    .send({ week, locationId, days: [2] })
    .expect(403);
  await owner
    .post('/api/shifts/publish-days')
    .send({ week, locationId: foreignLocation, days: [2] })
    .expect(404);
});
it('batch deletes drafts atomically and rejects published or foreign IDs', async () => {
  const r = await owner.post('/api/ai/apply-suggestion').send(apply()).expect(201);
  const id = r.body.shifts[0].id;
  await owner
    .post('/api/shifts/batch-delete')
    .send({ ids: [id, 'foreign'] })
    .expect(404);
  expect(await db.shift.count({ where: { organizationId: org } })).toBe(1);
  await employee
    .post('/api/shifts/batch-delete')
    .send({ ids: [id] })
    .expect(403);
  await db.shift.updateMany({ where: { organizationId: org, id }, data: { status: 'PUBLISHED' } });
  await owner
    .post('/api/shifts/batch-delete')
    .send({ ids: [id] })
    .expect(409);
  await db.shift.updateMany({ where: { organizationId: org, id }, data: { status: 'DRAFT' } });
  expect(
    (
      await owner
        .post('/api/shifts/batch-delete')
        .send({ ids: [id] })
        .expect(200)
    ).body.deleted,
  ).toBe(1);
});
it('batch updates team, validates every ID and protects privileged accounts', async () => {
  await manager
    .post('/api/users/batch')
    .send({ ids: [employeeId], locationId, maxWeeklyHours: 32 })
    .expect(200);
  expect(
    (await db.user.findFirstOrThrow({ where: { organizationId: org, id: employeeId } }))
      .maxWeeklyHours,
  ).toBe(32);
  await manager
    .post('/api/users/batch')
    .send({ ids: [employeeId, foreignId], maxWeeklyHours: 10 })
    .expect(404);
  await manager
    .post('/api/users/batch')
    .send({ ids: [managerId], maxWeeklyHours: 10 })
    .expect(403);
  await owner
    .post('/api/users/batch')
    .send({ ids: [ownerId], maxWeeklyHours: 10 })
    .expect(403);
  await owner
    .post('/api/users/batch')
    .send({ ids: [employeeId], locationId: foreignLocation })
    .expect(404);
  await employee
    .post('/api/users/batch')
    .send({ ids: [employeeId], maxWeeklyHours: 10 })
    .expect(403);
  await owner
    .post('/api/users/batch')
    .send({ ids: [employeeId, employeeId], maxWeeklyHours: 10 })
    .expect(400);
});
it('filters team search, role and location with tenant isolation', async () => {
  const r = await owner
    .get('/api/users')
    .query({ search: 'EMPLOYEE', role: 'EMPLOYEE', locationId })
    .expect(200);
  expect(r.body.users.map((u: { id: string }) => u.id)).toEqual([employeeId]);
  expect(
    (await owner.get('/api/users').query({ locationId: foreignLocation }).expect(200)).body.users,
  ).toEqual([]);
  await owner.get('/api/users').query({ role: 'SUPERUSER' }).expect(400);
});
it('batch decisions return per-item errors and only notify valid own-tenant requests', async () => {
  const r = await db.timeOffRequest.create({
    data: {
      organizationId: org,
      userId: employeeId,
      startsAt: new Date('2026-10-19T00:00Z'),
      endsAt: new Date('2026-10-20T00:00Z'),
      reason: '<script>away</script>',
    },
  });
  const other = await db.timeOffRequest.create({
    data: {
      organizationId: otherOrg,
      userId: foreignId,
      startsAt: new Date('2026-10-19T00:00Z'),
      endsAt: new Date('2026-10-20T00:00Z'),
    },
  });
  const result = await manager
    .post('/api/time-off/batch-decision')
    .send({ ids: [r.id, other.id, 'missing'], status: 'APPROVED' })
    .expect(200);
  expect(result.body.results.map((v: { ok: boolean }) => v.ok)).toEqual([true, false, false]);
  expect(
    (
      await db.timeOffRequest.findFirstOrThrow({
        where: { organizationId: otherOrg, id: other.id },
      })
    ).status,
  ).toBe('PENDING');
  expect(
    (await db.emailOutbox.findFirstOrThrow({ where: { organizationId: org } })).html,
  ).toContain('&lt;script&gt;');
  const again = await manager
    .post('/api/time-off/batch-decision')
    .send({ ids: [r.id], status: 'REJECTED' })
    .expect(200);
  expect(again.body.results[0].error.code).toBe('INVALID_TRANSITION');
  await employee
    .post('/api/time-off/batch-decision')
    .send({ ids: [r.id], status: 'APPROVED' })
    .expect(403);
  expect(
    (
      await owner
        .get('/api/time-off')
        .query({ status: 'APPROVED', from: '2026-10-19', to: '2026-10-19' })
        .expect(200)
    ).body.requests,
  ).toHaveLength(1);
  await owner.get('/api/time-off').query({ from: '2026-10-19' }).expect(400);
  await db.timeOffRequest.deleteMany({ where: { organizationId: otherOrg, id: other.id } });
});
it('profile requires current password for PIN/password and safely updates preferences', async () => {
  await employee.get('/api/profile').expect(200);
  await employee
    .put('/api/profile')
    .send({ name: 'New name', emailNotifications: false })
    .expect(200);
  await employee.put('/api/profile').send({ pin: '1234' }).expect(400);
  await employee.put('/api/profile').send({ pin: '1234', currentPassword: 'wrong' }).expect(403);
  await employee.put('/api/profile').send({ pin: '1234', currentPassword: password }).expect(200);
  let u = await db.user.findFirstOrThrow({ where: { organizationId: org, id: employeeId } });
  expect(await bcrypt.compare('1234', u.pinHash!)).toBe(true);
  expect(u.emailNotifications).toBe(false);
  await employee.put('/api/profile').send({ pin: null, currentPassword: password }).expect(200);
  await employee.put('/api/profile').send({ role: 'OWNER', organizationId: otherOrg }).expect(400);
  await employee
    .put('/api/profile')
    .send({ password: 'ReplacementPassword2026!', currentPassword: password })
    .expect(200);
  u = await db.user.findFirstOrThrow({ where: { organizationId: org, id: employeeId } });
  expect(await bcrypt.compare('ReplacementPassword2026!', u.passwordHash)).toBe(true);
});
it('email enqueue respects preferences and worker uses fake transport with retry/terminal states', async () => {
  await db.$transaction((tx) =>
    notify(tx, org, [employeeId, employeeId], 'Schedule published', 'Ready'),
  );
  expect(await db.emailOutbox.count({ where: { organizationId: org } })).toBe(1);
  const send = vi.fn().mockRejectedValue(new Error('provider secret should not be stored'));
  const now = new Date(Date.now() + 1000);
  await processEmailOutbox(org, { send }, now);
  let row = await db.emailOutbox.findFirstOrThrow({ where: { organizationId: org } });
  expect(row.attempts).toBe(1);
  expect(+row.sendAfter).toBe(+now + 60000);
  expect(row.lastError).toBe('Email transport failed');
  await processEmailOutbox(org, { send }, now);
  expect(send).toHaveBeenCalledTimes(1);
  await processEmailOutbox(otherOrg, { send }, new Date(+now + 60000));
  expect(send).toHaveBeenCalledTimes(1);
  await db.emailOutbox.updateMany({ where: { organizationId: org }, data: { attempts: 4 } });
  await processEmailOutbox(org, { send }, new Date(+now + 60000));
  row = await db.emailOutbox.findFirstOrThrow({ where: { organizationId: org } });
  expect(row.status).toBe('FAILED');
  expect(row.attempts).toBe(5);
  await db.user.updateMany({
    where: { organizationId: org, id: employeeId },
    data: { emailNotifications: false },
  });
  await db.$transaction((tx) => notify(tx, org, [employeeId], 'Time off approved', 'Approved'));
  expect(await db.notification.count({ where: { organizationId: org } })).toBe(2);
  expect(await db.emailOutbox.count({ where: { organizationId: org } })).toBe(1);
});
it('worker marks successful emails SENT and does not send twice even for concurrent runs', async () => {
  await db.$transaction((tx) => notify(tx, org, [employeeId], 'Swap approved', 'Approved'));
  const send = vi.fn().mockResolvedValue(undefined);
  await Promise.all([processEmailOutbox(org, { send }), processEmailOutbox(org, { send })]);
  expect(send).toHaveBeenCalledTimes(1);
  expect((await db.emailOutbox.findFirstOrThrow({ where: { organizationId: org } })).status).toBe(
    'SENT',
  );
});
it('analytics enforces RBAC and tenant/location boundaries', async () => {
  await owner.post('/api/ai/apply-suggestion').send(apply()).expect(201);
  await owner.post('/api/shifts/publish').send({ week, locationId }).expect(200);
  const params = { from: '2026-10-19', to: '2026-10-25' };
  const r = await manager.get('/api/admin/analytics').query(params).expect(200);
  expect(r.body.kpis.scheduledHours).toBe(8);
  expect(r.body.kpis.labourCost).toBe(160);
  expect(r.body.daily).toHaveLength(7);
  expect(
    (await foreign.get('/api/admin/analytics').query(params).expect(200)).body.kpis.scheduledHours,
  ).toBe(0);
  await owner
    .get('/api/admin/analytics')
    .query({ ...params, locationId: foreignLocation })
    .expect(404);
  await employee.get('/api/admin/analytics').query(params).expect(403);
  await owner
    .get('/api/admin/analytics')
    .query({ from: '2026-10-25', to: '2026-10-19' })
    .expect(400);
});
it('audit log is owner-only paginated and filterable within tenant', async () => {
  await db.auditLog.create({
    data: {
      organizationId: org,
      actorId: ownerId,
      action: 'TEST_PHASE3',
      entityType: 'User',
      entityId: employeeId,
    },
  });
  const r = await owner
    .get('/api/admin/audit-log')
    .query({ action: 'TEST_PHASE3', entity: 'User', pageSize: 1 })
    .expect(200);
  expect(r.body.entries).toHaveLength(1);
  expect(r.body.entries[0].organizationId).toBe(org);
  expect(
    (await foreign.get('/api/admin/audit-log').query({ action: 'TEST_PHASE3' }).expect(200)).body
      .total,
  ).toBe(0);
  await manager.get('/api/admin/audit-log').expect(403);
  await employee.get('/api/admin/audit-log').expect(403);
  await owner.get('/api/admin/audit-log').query({ page: 0 }).expect(400);
});
it('owner manages roles/access and inactive accounts lose existing sessions', async () => {
  await manager
    .put('/api/admin/users/' + employeeId)
    .send({ role: 'MANAGER' })
    .expect(403);
  await employee
    .put('/api/admin/users/' + employeeId)
    .send({ active: false })
    .expect(403);
  await owner
    .put('/api/admin/users/' + foreignId)
    .send({ active: false })
    .expect(404);
  await owner
    .put('/api/admin/users/' + ownerId)
    .send({ active: false })
    .expect(403);
  await owner
    .put('/api/admin/users/' + employeeId)
    .send({ role: 'MANAGER', active: false })
    .expect(200);
  await employee.get('/api/auth/me').expect(401);
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'phase3-employee-' + suffix + '@test.local', password })
    .expect(401);
  await owner
    .put('/api/admin/users/' + employeeId)
    .send({ role: 'EMPLOYEE', active: true })
    .expect(200);
  await employee.get('/api/auth/me').expect(200);
});
it('reset passwords are shown once and require a profile password change', async () => {
  await manager
    .post('/api/admin/users/' + employeeId + '/reset-password')
    .send({})
    .expect(403);
  await owner
    .post('/api/admin/users/' + foreignId + '/reset-password')
    .send({})
    .expect(404);
  const r = await owner
    .post('/api/admin/users/' + employeeId + '/reset-password')
    .send({})
    .expect(200);
  expect(r.body.tempPassword).toHaveLength(24);
  expect(r.body.user.passwordHash).toBeUndefined();
  const fresh = request.agent(app);
  await fresh
    .post('/api/auth/login')
    .send({ email: 'phase3-employee-' + suffix + '@test.local', password: r.body.tempPassword })
    .expect(200);
  expect((await fresh.get('/api/locations').expect(403)).body.error.code).toBe(
    'PASSWORD_CHANGE_REQUIRED',
  );
  await fresh
    .put('/api/profile')
    .send({ currentPassword: r.body.tempPassword, password })
    .expect(200);
  await fresh.get('/api/locations').expect(200);
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'phase3-employee-' + suffix + '@test.local', password: r.body.tempPassword })
    .expect(401);
});
it('AI rate limit responds with 429 for the organization', async () => {
  let last = 200;
  for (let i = 0; i < 21; i++) {
    const r = await owner.post('/api/ai/suggest-roster').send(suggestion());
    last = r.status;
    if (last === 429) {
      expect(r.body.error.code).toBe('RATE_LIMITED');
      break;
    }
  }
  expect(last).toBe(429);
});

it('filters swap status and overlapping shift dates without exposing another tenant', async () => {
  const shift = await db.shift.create({
    data: {
      organizationId: org,
      locationId,
      userId: employeeId,
      startsAt: new Date('2026-10-19T09:00Z'),
      endsAt: new Date('2026-10-19T17:00Z'),
    },
  });
  await db.swapRequest.create({
    data: { organizationId: org, shiftId: shift.id, requesterId: employeeId, status: 'REJECTED' },
  });
  const r = await manager
    .get('/api/swaps')
    .query({ status: 'REJECTED', from: '2026-10-19', to: '2026-10-19' })
    .expect(200);
  expect(r.body.swaps).toHaveLength(1);
  expect(
    (
      await manager
        .get('/api/swaps')
        .query({ status: 'APPROVED', from: '2026-10-19', to: '2026-10-19' })
        .expect(200)
    ).body.swaps,
  ).toHaveLength(0);
  expect(
    (
      await foreign
        .get('/api/swaps')
        .query({ status: 'REJECTED', from: '2026-10-19', to: '2026-10-19' })
        .expect(200)
    ).body.swaps,
  ).toHaveLength(0);
  await manager.get('/api/swaps').query({ from: '2026-10-20', to: '2026-10-19' }).expect(400);
});
