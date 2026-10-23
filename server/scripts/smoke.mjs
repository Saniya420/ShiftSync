// End-to-end smoke test of the main user journey against a running API.
// Usage: node server/scripts/smoke.mjs [baseUrl]   (default http://127.0.0.1:3001/api)
// Creates a fresh throwaway organization, so it is safe to run against a dev database.
import { randomBytes } from 'node:crypto';

const base = process.argv[2] ?? 'http://127.0.0.1:3001/api';
const results = [];

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const started = performance.now();
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, json, ms: Math.round(performance.now() - started) };
  };
}

async function step(name, fn, expectStatus, check = () => true) {
  let r;
  try {
    r = await fn();
    const ok = r.status === expectStatus && check(r.json);
    results.push({ name, status: r.status, ms: r.ms, ok });
  } catch (error) {
    // Print only the first network error; later ones are usually the same cause.
    if (!results.some((x) => x.error)) console.error(name, error);
    results.push({ name, status: 'ERR', ms: 0, ok: false, error: String(error) });
  }
  return r?.json;
}

const owner = client();
const employee = client();
const stamp = Date.now();
const ownerPassword = 'Smoke-' + randomBytes(9).toString('hex');
const employeePassword = 'Smoke-' + randomBytes(9).toString('hex');
const tz = 'Asia/Karachi';

// Monday of the current week in the location time zone.
const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
const monday = new Date(localNow);
monday.setDate(localNow.getDate() - ((localNow.getDay() + 6) % 7));
const week = monday.toLocaleDateString('en-CA');
const nextMonday = new Date(monday);
nextMonday.setDate(monday.getDate() + 7);
const nextWeek = nextMonday.toLocaleDateString('en-CA');

await step('Health check (API + DB)', () => owner('GET', '/health'), 200);
await step(
  'Owner signs up (new organization)',
  () =>
    owner('POST', '/auth/signup', {
      organizationName: 'Smoke Test Bakery ' + stamp,
      name: 'Smoke Owner',
      email: `owner+${stamp}@smoke.test`,
      password: ownerPassword,
    }),
  201,
);
await step(
  'Session restored (/auth/me)',
  () => owner('GET', '/auth/me'),
  200,
  (j) => j.user.role === 'OWNER',
);
const loc = await step(
  'Owner creates location',
  () => owner('POST', '/locations', { name: 'Smoke Branch', timezone: tz }),
  201,
);
const locationId = loc?.location?.id;
const invite = await step(
  'Owner invites employee (temp password)',
  () =>
    owner('POST', '/users', {
      name: 'Smoke Employee',
      email: `emp+${stamp}@smoke.test`,
      hourlyRate: 15,
      maxWeeklyHours: 40,
      locationIds: [locationId],
    }),
  201,
  (j) => typeof j.tempPassword === 'string',
);
const employeeId = invite?.user?.id;
const start = new Date(Date.now() + 5 * 60000);
const end = new Date(Date.now() + 4 * 3600000);
const shift = await step(
  'Owner creates shift starting in 5 min',
  () =>
    owner('POST', '/shifts', {
      locationId,
      userId: employeeId,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      position: 'Counter',
    }),
  201,
);
await step(
  'Overlapping shift is blocked (409)',
  () =>
    owner('POST', '/shifts', {
      locationId,
      userId: employeeId,
      startsAt: new Date(+start + 3600000).toISOString(),
      endsAt: new Date(+end + 3600000).toISOString(),
    }),
  409,
  (j) => j.error.code === 'SHIFT_OVERLAP',
);
await step(
  'Owner publishes week',
  () => owner('POST', '/shifts/publish', { week, locationId }),
  200,
  (j) => j.published >= 1,
);
await step(
  'Employee logs in with temp password',
  () =>
    employee('POST', '/auth/login', {
      email: `emp+${stamp}@smoke.test`,
      password: invite.tempPassword,
    }),
  200,
);
await step(
  'Temp password forces change (403)',
  () => employee('GET', '/shifts?week=' + week),
  403,
  (j) => j.error.code === 'PASSWORD_CHANGE_REQUIRED',
);
await step(
  'Employee sets own password',
  () =>
    employee('PUT', '/profile', {
      currentPassword: invite.tempPassword,
      password: employeePassword,
    }),
  200,
);
await step(
  'Employee sees published shift',
  () => employee('GET', '/shifts?week=' + week),
  200,
  (j) => j.shifts.some((s) => s.id === shift.shift.id),
);
await step(
  'Employee clocks in',
  () => employee('POST', '/attendance/clock-in', { shiftId: shift.shift.id }),
  200,
  (j) => j.record.status === 'ON_TIME',
);
await step(
  'Manager attendance board shows arrival',
  () => owner('GET', '/attendance'),
  200,
  (j) => j.shifts.some((s) => s.id === shift.shift.id),
);
await step(
  'Employee clocks out early (EARLY_LEAVE)',
  () => employee('POST', '/attendance/clock-out', { shiftId: shift.shift.id }),
  200,
  (j) => j.record.status === 'EARLY_LEAVE',
);
const timeOff = await step(
  'Employee requests time off',
  () =>
    employee('POST', '/time-off', {
      startsAt: new Date(+nextMonday + 86400000).toISOString(),
      endsAt: new Date(+nextMonday + 2 * 86400000).toISOString(),
      reason: 'Smoke test',
    }),
  201,
);
await step(
  'Owner approves time off',
  () => owner('POST', `/time-off/${timeOff.request.id}/decision`, { status: 'APPROVED' }),
  200,
  (j) => j.request.status === 'APPROVED',
);
await step(
  'Employee receives notifications',
  () => employee('GET', '/notifications'),
  200,
  (j) => j.unreadCount >= 1,
);
await step(
  'Timesheet includes actual hours',
  () => owner('GET', `/timesheets?from=${week}&to=${nextWeek}&locationId=${locationId}`),
  200,
  (j) => j.rows.some((r) => r.actualHours > 0 || r.actualHours === 0),
);
await step(
  'AI roster suggestion (Gemini or fallback)',
  () =>
    owner('POST', '/ai/suggest-roster', {
      week: nextWeek,
      locationId,
      needs: [{ weekday: 3, start: '09:00', end: '13:00', headcount: 1, position: 'Counter' }],
    }),
  200,
  (j) => ['gemini', 'heuristic'].includes(j.source),
);
await step(
  'Owner analytics dashboard',
  () => owner('GET', `/admin/analytics?from=${week}&to=${nextWeek}`),
  200,
);
await step(
  'Employee blocked from analytics (403)',
  () => employee('GET', `/admin/analytics?from=${week}&to=${week}`),
  403,
);
await step(
  'Tenant isolation: other org location hidden (404)',
  () => employee('GET', '/locations/demo-main-street'),
  404,
);
await step('Logout', () => owner('POST', '/auth/logout', {}), 204);
await step('Session cleared after logout (401)', () => owner('GET', '/auth/me'), 401);

const passed = results.filter((r) => r.ok).length;
console.log('| # | Step | HTTP | Time (ms) | Result |');
console.log('|---|---|---|---|---|');
results.forEach((r, i) =>
  console.log(`| ${i + 1} | ${r.name} | ${r.status} | ${r.ms} | ${r.ok ? 'PASS' : 'FAIL'} |`),
);
console.log(`\n${passed}/${results.length} steps passed.`);
process.exitCode = passed === results.length ? 0 : 1;
