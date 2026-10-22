import { Router } from 'express';
import { requireRole } from '../auth.js';
import { db, tenant } from '../db.js';
import { AppError, route } from '../http.js';
import { id, idParams } from '../validation.js';
import { z } from 'zod';
import {
  clockBody,
  correctionBody,
  decisionBody,
  emptyBody,
  emptyQuery,
  forceBody,
  reportQuery,
  swapActionParams,
  swapBody,
  timeOffBody,
} from '../phase2-validation.js';
import {
  actOnSwap,
  changeTimeOff,
  coworkers,
  createSwap,
  createTimeOff,
  listSwaps,
  listTimeOff,
} from '../services/requests.js';
import {
  attendanceBoard,
  clock,
  correctAttendance,
  currentAttendance,
} from '../services/attendance.js';
import { timesheetReport } from '../services/reports.js';
import { timesheetsCsv } from '../domain/timesheets.js';
export const phase2Router = Router();
const managers = requireRole('OWNER', 'MANAGER');
phase2Router.get(
  '/time-off',
  route(async (req, res) => {
    emptyQuery.parse(req.query);
    res.json({ requests: await listTimeOff(req.auth) });
  }),
);
phase2Router.post(
  '/time-off',
  route(async (req, res) => {
    res.status(201).json({ request: await createTimeOff(req.auth, timeOffBody.parse(req.body)) });
  }),
);
phase2Router.post(
  '/time-off/:id/cancel',
  route(async (req, res) => {
    emptyBody.parse(req.body);
    res.json({
      request: await changeTimeOff(req.auth, idParams.parse(req.params).id, 'CANCELLED'),
    });
  }),
);
phase2Router.post(
  '/time-off/:id/decision',
  managers,
  route(async (req, res) => {
    res.json({
      request: await changeTimeOff(
        req.auth,
        idParams.parse(req.params).id,
        decisionBody.parse(req.body).status,
      ),
    });
  }),
);
phase2Router.get(
  '/swaps/coworkers',
  route(async (req, res) => {
    const query = z.object({ shiftId: id }).strict().parse(req.query);
    res.json({ users: await coworkers(req.auth, query.shiftId) });
  }),
);
phase2Router.get(
  '/swaps',
  route(async (req, res) => {
    emptyQuery.parse(req.query);
    res.json({ swaps: await listSwaps(req.auth) });
  }),
);
phase2Router.post(
  '/swaps',
  route(async (req, res) => {
    res.status(201).json({ swap: await createSwap(req.auth, swapBody.parse(req.body)) });
  }),
);
phase2Router.post(
  '/swaps/:id/:action',
  route(async (req, res) => {
    const { id, action } = swapActionParams.parse(req.params);
    if (['approve', 'reject'].includes(action) && req.auth.role === 'EMPLOYEE')
      throw new AppError(403, 'FORBIDDEN', 'Manager approval is required.');
    const force =
      action === 'approve' ? forceBody.parse(req.body).force : (emptyBody.parse(req.body), false);
    res.json(await actOnSwap(req.auth, id, action, force));
  }),
);
phase2Router.get(
  '/attendance/current',
  route(async (req, res) => {
    emptyQuery.parse(req.query);
    res.json(await currentAttendance(req.auth));
  }),
);
for (const out of [false, true])
  phase2Router.post(
    '/attendance/' + (out ? 'clock-out' : 'clock-in'),
    route(async (req, res) => {
      res.json({ record: await clock(req.auth, clockBody.parse(req.body), out) });
    }),
  );
phase2Router.get(
  '/attendance',
  managers,
  route(async (req, res) => {
    emptyQuery.parse(req.query);
    res.json(await attendanceBoard(req.auth));
  }),
);
phase2Router.put(
  '/attendance/:id',
  managers,
  route(async (req, res) => {
    await correctAttendance(
      req.auth,
      idParams.parse(req.params).id,
      correctionBody.parse(req.body),
    );
    res.json({ updated: true });
  }),
);
for (const csv of [false, true])
  phase2Router.get(
    '/timesheets' + (csv ? '.csv' : ''),
    managers,
    route(async (req, res) => {
      const result = await timesheetReport(req.auth, reportQuery.parse(req.query));
      if (csv) res.type('text/csv').attachment('timesheets.csv').send(timesheetsCsv(result.rows));
      else res.json(result);
    }),
  );
phase2Router.get(
  '/notifications',
  route(async (req, res) => {
    emptyQuery.parse(req.query);
    const where = { ...tenant(req.auth.organizationId), userId: req.auth.id };
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
      db.notification.count({ where: { ...where, readAt: null } }),
    ]);
    res.json({ notifications, unreadCount });
  }),
);
phase2Router.post(
  '/notifications/read-all',
  route(async (req, res) => {
    emptyBody.parse(req.body);
    await db.notification.updateMany({
      where: { ...tenant(req.auth.organizationId), userId: req.auth.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(204).end();
  }),
);
phase2Router.post(
  '/notifications/:id/read',
  route(async (req, res) => {
    const { id } = idParams.parse(req.params);
    emptyBody.parse(req.body);
    const result = await db.notification.updateMany({
      where: { ...tenant(req.auth.organizationId), userId: req.auth.id, id },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new AppError(404, 'NOT_FOUND', 'Notification not found.');
    res.status(204).end();
  }),
);
