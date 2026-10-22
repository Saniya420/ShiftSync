import { Router } from 'express';
import { requireRole } from '../auth.js';
import { route } from '../http.js';
import { idParams } from '../validation.js';
import { emptyBody, emptyQuery, reportQuery } from '../phase2-validation.js';
import {
  adminUserBody,
  applySuggestionBody,
  auditQuery,
  decisionBatchBody,
  deleteBatchBody,
  profileBody,
  publishDaysBody,
  suggestBody,
  teamBatchBody,
} from '../phase3-validation.js';
import { suggestRoster } from '../services/ai.js';
import { applyShifts, deleteDrafts, publishWeek } from '../services/roster.js';
import {
  getProfile,
  analytics,
  auditLog,
  batchTeam,
  updateAdminUser,
  updateProfile,
} from '../services/admin.js';
import { batchTimeOff } from '../services/requests.js';
export const phase3Router = Router();
const managers = requireRole('OWNER', 'MANAGER');
const owner = requireRole('OWNER');
phase3Router.post(
  '/ai/suggest-roster',
  managers,
  route(async (req, res) => {
    res.json(await suggestRoster(req.auth, suggestBody.parse(req.body)));
  }),
);
phase3Router.post(
  '/ai/apply-suggestion',
  managers,
  route(async (req, res) => {
    const b = applySuggestionBody.parse(req.body);
    res.status(201).json(await applyShifts(req.auth, b.week, b.locationId, b.shifts, b.force));
  }),
);
phase3Router.put(
  '/profile',
  route(async (req, res) => {
    res.json({ user: await updateProfile(req.auth, profileBody.parse(req.body)) });
  }),
);
phase3Router.get(
  '/profile',
  route(async (req, res) => {
    emptyQuery.parse(req.query);
    res.json({ user: await getProfile(req.auth) });
  }),
);
phase3Router.post(
  '/users/batch',
  managers,
  route(async (req, res) => {
    res.json(await batchTeam(req.auth, teamBatchBody.parse(req.body)));
  }),
);
phase3Router.post(
  '/time-off/batch-decision',
  managers,
  route(async (req, res) => {
    const b = decisionBatchBody.parse(req.body);
    res.json(await batchTimeOff(req.auth, b.ids, b.status));
  }),
);
phase3Router.post(
  '/shifts/batch-delete',
  managers,
  route(async (req, res) => {
    res.json(await deleteDrafts(req.auth, deleteBatchBody.parse(req.body).ids));
  }),
);
phase3Router.post(
  '/shifts/publish-days',
  managers,
  route(async (req, res) => {
    const b = publishDaysBody.parse(req.body);
    res.json(await publishWeek(req.auth, b.week, b.locationId, b.force, b.days));
  }),
);
phase3Router.get(
  '/admin/analytics',
  managers,
  route(async (req, res) => {
    res.json(await analytics(req.auth, reportQuery.parse(req.query)));
  }),
);
phase3Router.get(
  '/admin/audit-log',
  owner,
  route(async (req, res) => {
    res.json(await auditLog(req.auth, auditQuery.parse(req.query)));
  }),
);
phase3Router.put(
  '/admin/users/:id',
  owner,
  route(async (req, res) => {
    res.json(
      await updateAdminUser(req.auth, idParams.parse(req.params).id, adminUserBody.parse(req.body)),
    );
  }),
);
phase3Router.post(
  '/admin/users/:id/reset-password',
  owner,
  route(async (req, res) => {
    emptyBody.parse(req.body);
    res.json(await updateAdminUser(req.auth, idParams.parse(req.params).id, 'reset'));
  }),
);
