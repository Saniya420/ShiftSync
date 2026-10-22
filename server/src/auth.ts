import type { RequestHandler, Response } from 'express';
import { Router } from 'express';
import type { Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db, publicUser, tenant } from './db.js';
// Login, signup and /me all return the same shape so the client session cache is consistent.
const sessionUser = { ...publicUser, organization: { select: { name: true, timezone: true } } };
import { config } from './config.js';
import { AppError, route } from './http.js';

export interface Session {
  id: string;
  organizationId: string;
  role: Role;
}
declare module 'express-serve-static-core' {
  interface Request {
    auth: Session;
  }
}
const claims = z.object({ sub: z.string(), organizationId: z.string() });
export const credentials = z
  .object({
    email: z
      .string()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z
      .string()
      .min(12)
      .max(72)
      .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must fit within 72 UTF-8 bytes'),
  })
  .strict();
const cookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
function signIn(res: Response, user: Session) {
  res.cookie(
    'shiftsync',
    jwt.sign({ organizationId: user.organizationId }, config.JWT_SECRET, {
      subject: user.id,
      expiresIn: '7d',
      algorithm: 'HS256',
      issuer: 'shiftsync',
      audience: 'shiftsync-web',
    }),
    { ...cookieOptions, maxAge: 7 * 86400000 },
  );
}
export const requireAuth: RequestHandler = (req, res, next) => {
  Promise.resolve(
    (async () => {
      const token: unknown = req.cookies?.shiftsync;
      if (typeof token !== 'string')
        throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
      let data: z.infer<typeof claims>;
      try {
        data = claims.parse(
          jwt.verify(token, config.JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: 'shiftsync',
            audience: 'shiftsync-web',
          }),
        );
      } catch {
        throw new AppError(401, 'UNAUTHENTICATED', 'Your session expired. Please sign in.');
      }
      const user = await db.user.findFirst({
        where: { ...tenant(data.organizationId), id: data.sub, active: true },
        select: { id: true, organizationId: true, role: true, mustChangePassword: true },
      });
      if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
      if (
        user.mustChangePassword &&
        !['/api/profile', '/api/auth/me', '/api/auth/logout'].includes(
          req.originalUrl.split('?')[0],
        )
      )
        throw new AppError(
          403,
          'PASSWORD_CHANGE_REQUIRED',
          'Change your temporary password on the Profile page.',
        );
      req.auth = user;
    })(),
  ).then(() => next(), next);
};
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!roles.includes(req.auth.role)) {
      next(new AppError(403, 'FORBIDDEN', 'You do not have access to this action.'));
      return;
    }
    next();
  };
export const authRouter = Router();
authRouter.post(
  '/signup',
  route(async (req, res) => {
    const body = credentials
      .extend({
        name: z.string().trim().min(1).max(100),
        organizationName: z.string().trim().min(1).max(100),
      })
      .parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, 12);
    const organization = await db.organization.create({
      data: {
        name: body.organizationName,
        users: { create: { email: body.email, name: body.name, passwordHash, role: 'OWNER' } },
      },
      include: { users: { select: sessionUser } },
    });
    const user = organization.users[0];
    signIn(res, user);
    res.status(201).json({ user });
  }),
);
authRouter.post(
  '/login',
  route(async (req, res) => {
    const body = credentials.parse(req.body);
    // Email is globally unique; login must resolve the tenant before a session exists.
    const user = await db.user.findUnique({ where: { email: body.email } });
    if (!user || !user.active || !(await bcrypt.compare(body.password, user.passwordHash)))
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    signIn(res, user);
    const safe = await db.user.findFirstOrThrow({
      where: { ...tenant(user.organizationId), id: user.id },
      select: sessionUser,
    });
    res.json({ user: safe });
  }),
);
authRouter.post(
  '/logout',
  route(async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    res.clearCookie('shiftsync', cookieOptions).status(204).end();
  }),
);
authRouter.get(
  '/me',
  requireAuth,
  route(async (req, res) => {
    const user = await db.user.findFirstOrThrow({
      where: { ...tenant(req.auth.organizationId), id: req.auth.id },
      select: sessionUser,
    });
    res.json({ user });
  }),
);
