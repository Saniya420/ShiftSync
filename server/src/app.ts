import { phase3Router } from './routes/phase3.js';
import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { db } from './db.js';
import { requireAuth, authRouter } from './auth.js';
import { AppError, errorHandler, logger, route } from './http.js';
import { resourceRouter } from './routes/resources.js';
import { shiftRouter } from './routes/shifts.js';
import { phase2Router } from './routes/phase2.js';
import { runEmailSweep, runNoShowSweep } from './jobs.js';
export const app = express();
app.disable('x-powered-by');
// Behind Vercel's proxy the client IP is in X-Forwarded-For (needed for auth rate limiting).
if (process.env.VERCEL) app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.CLIENT_ORIGINS, credentials: true }));
app.use(pinoHttp({ logger }));
app.use((req, _res, next) => {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    req.headers.origin &&
    !config.CLIENT_ORIGINS.includes(req.headers.origin)
  ) {
    next(new AppError(403, 'ORIGIN_REJECTED', 'Request origin is not allowed.'));
    return;
  }
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.get(
  '/api/health',
  route(async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable.');
    }
  }),
);
// Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET"; without a secret it is off.
app.get(
  '/api/cron/run',
  route(async (req, res) => {
    const expected = config.CRON_SECRET && 'Bearer ' + config.CRON_SECRET;
    const given = req.headers.authorization ?? '';
    if (
      !expected ||
      given.length !== expected.length ||
      !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    )
      throw new AppError(401, 'UNAUTHENTICATED', 'Cron secret required.');
    await runNoShowSweep();
    await runEmailSweep();
    res.json({ ok: true });
  }),
);
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.NODE_ENV === 'test' ? 1000 : 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.method === 'GET',
    handler: (_req, res) => {
      res
        .status(429)
        .json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } });
    },
  }),
  authRouter,
);
app.use('/api', requireAuth, phase3Router);
app.use('/api', requireAuth, resourceRouter);
app.use('/api/shifts', requireAuth, shiftRouter);
app.use('/api', requireAuth, phase2Router);
app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Endpoint not found.')));
app.use(errorHandler);
