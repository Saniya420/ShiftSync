import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: [
    'req.headers.cookie',
    'req.headers.authorization',
    'res.headers.set-cookie',
    'password',
    'passwordHash',
    'tempPassword',
  ],
});
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const route =
  (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    handler(req, res).catch(next);
  };
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    res
      .status(400)
      .json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please check your input.',
          details: error.flatten(),
        },
      });
    return;
  }
  if (error instanceof AppError) {
    res
      .status(error.status)
      .json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const messages: Record<string, [number, string, string]> = {
      P2002: [409, 'ALREADY_EXISTS', 'A record with these details already exists.'],
      P2003: [409, 'IN_USE', 'This record is still in use.'],
      P2025: [404, 'NOT_FOUND', 'Record not found.'],
      P2034: [409, 'CONCURRENT_UPDATE', 'The roster changed. Refresh and try again.'],
    };
    const mapped = messages[error.code];
    if (mapped) {
      res.status(mapped[0]).json({ error: { code: mapped[1], message: mapped[2] } });
      return;
    }
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body.' } });
    return;
  }
  logger.error(
    { err: error instanceof Prisma.PrismaClientValidationError ? { name: error.name } : error },
    'Request failed',
  );
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
}
