import { Router } from 'express';
import { requireRole } from '../auth.js';
import { route } from '../http.js';
import { idParams, shiftBody, weekAction, weekQuery } from '../validation.js';
import { copyWeek, deleteShift, listShifts, publishWeek, saveShift } from '../services/roster.js';
export const shiftRouter = Router();
const managers = requireRole('OWNER', 'MANAGER');
shiftRouter.get(
  '/',
  route(async (req, res) => {
    const query = weekQuery.parse(req.query);
    res.json(await listShifts(req.auth, query.week, query.locationId));
  }),
);
shiftRouter.post(
  '/copy-previous-week',
  managers,
  route(async (req, res) => {
    const body = weekAction.parse(req.body);
    res.status(201).json(await copyWeek(req.auth, body.week, body.locationId, body.force));
  }),
);
shiftRouter.post(
  '/publish',
  managers,
  route(async (req, res) => {
    const body = weekAction.parse(req.body);
    res.json(await publishWeek(req.auth, body.week, body.locationId, body.force));
  }),
);
shiftRouter.post(
  '/',
  managers,
  route(async (req, res) => {
    const body = shiftBody.parse(req.body);
    res.status(201).json(await saveShift(req.auth, body));
  }),
);
shiftRouter.put(
  '/:id',
  managers,
  route(async (req, res) => {
    const { id } = idParams.parse(req.params);
    res.json(await saveShift(req.auth, shiftBody.parse(req.body), id));
  }),
);
shiftRouter.delete(
  '/:id',
  managers,
  route(async (req, res) => {
    const { id } = idParams.parse(req.params);
    await deleteShift(req.auth, id);
    res.status(204).end();
  }),
);
