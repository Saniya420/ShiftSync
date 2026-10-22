import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db.js';
const organizations: string[] = [];
afterAll(async () => {
  for (const id of organizations) {
    await db.userLocation.deleteMany({ where: { organizationId: id } });
    await db.user.deleteMany({ where: { organizationId: id } });
    await db.location.deleteMany({ where: { organizationId: id } });
    await db.organization.deleteMany({ where: { id } });
  }
  await db.$disconnect();
});
describe('database tenant constraints and account updates', () => {
  it('rejects cross-tenant memberships and shift assignees at the database layer', async () => {
    const key = randomUUID();
    const a = await db.organization.create({ data: { name: 'Constraint A ' + key } });
    organizations.push(a.id);
    const b = await db.organization.create({ data: { name: 'Constraint B ' + key } });
    organizations.push(b.id);
    const user = await db.user.create({
      data: {
        organizationId: b.id,
        name: 'Foreign',
        email: key + '@test.local',
        passwordHash: 'unused-fixture',
      },
    });
    const location = await db.location.create({ data: { organizationId: a.id, name: 'A' } });
    await expect(
      db.userLocation.create({
        data: { organizationId: a.id, userId: user.id, locationId: location.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      db.shift.create({
        data: {
          organizationId: a.id,
          locationId: location.id,
          userId: user.id,
          startsAt: new Date('2026-10-19T09:00:00Z'),
          endsAt: new Date('2026-10-19T17:00:00Z'),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(await db.shift.count({ where: { organizationId: a.id } })).toBe(0);
  });
  it('updates employee profiles and lets only owners promote managers', async () => {
    const agent = request.agent(app),
      foreign = request.agent(app);
    const key = randomUUID();
    const a = await agent
      .post('/api/auth/signup')
      .send({
        organizationName: 'Update ' + key,
        name: 'Owner',
        email: key + '-owner@test.local',
        password: 'PasswordForTests2026!',
      })
      .expect(201);
    organizations.push(a.body.user.organizationId);
    const b = await foreign
      .post('/api/auth/signup')
      .send({
        organizationName: 'Foreign ' + key,
        name: 'Foreign',
        email: key + '-foreign@test.local',
        password: 'PasswordForTests2026!',
      })
      .expect(201);
    organizations.push(b.body.user.organizationId);
    const location = (
      await agent.post('/api/locations').send({ name: 'Main', timezone: 'UTC' }).expect(201)
    ).body.location;
    const invited = (
      await agent
        .post('/api/users')
        .send({
          name: 'Employee',
          email: key + '-employee@test.local',
          hourlyRate: 10,
          maxWeeklyHours: 40,
          locationIds: [location.id],
        })
        .expect(201)
    ).body.user;
    const result = await agent
      .put('/api/users/' + invited.id)
      .send({
        name: 'Manager now',
        hourlyRate: 22,
        maxWeeklyHours: 32,
        locationIds: [location.id],
        role: 'MANAGER',
      })
      .expect(200);
    expect(result.body.user.role).toBe('MANAGER');
    expect(Number(result.body.user.hourlyRate)).toBe(22);
    await agent.get('/api/locations/' + location.id).expect(200);
    await foreign.get('/api/locations/' + location.id).expect(404);
    const health = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['access-control-allow-credentials']).toBe('true');
  });
});
