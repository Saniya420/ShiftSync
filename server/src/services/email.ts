import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { db, tenant } from '../db.js';
import { logger } from '../http.js';
import { retryDelay } from '../domain/email.js';
export interface EmailMessage {
  id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}
export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}
export function createEmailTransport(): EmailTransport {
  // Tests can inject a fake transport; configured credentials never trigger test network calls.
  if (config.NODE_ENV !== 'test' && config.RESEND_API_KEY)
    return {
      async send(message) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          signal: AbortSignal.timeout(20000),
          headers: {
            Authorization: 'Bearer ' + config.RESEND_API_KEY,
            'Content-Type': 'application/json',
            'Idempotency-Key': message.id,
          },
          body: JSON.stringify({
            from: config.EMAIL_FROM,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
        });
        if (!response.ok) throw new Error('Resend HTTP ' + response.status);
      },
    };
  if (config.NODE_ENV !== 'test' && config.SMTP_URL) {
    const url = new URL(config.SMTP_URL);
    const smtp = nodemailer.createTransport({
      host: url.hostname,
      port: Number(url.port || (url.protocol === 'smtps:' ? 465 : 587)),
      secure: url.protocol === 'smtps:',
      ...(url.username
        ? {
            auth: {
              user: decodeURIComponent(url.username),
              pass: decodeURIComponent(url.password),
            },
          }
        : {}),
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000,
    });
    return {
      async send(message) {
        await smtp.sendMail({
          from: config.EMAIL_FROM,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          messageId: '<' + message.id + '@shiftsync.local>',
        });
      },
    };
  }
  return {
    async send(message) {
      logger.info({ email: message }, 'Email log transport');
    },
  };
}
export async function processEmailOutbox(
  organizationId: string,
  transport: EmailTransport = createEmailTransport(),
  now = new Date(),
) {
  // Separate worker lock, shared across processes. Keep the claim and status write atomic.
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(1397968463, hashtext(${organizationId}))::text`;
      const scope = tenant(organizationId);
      const messages = await tx.emailOutbox.findMany({
        where: { ...scope, status: 'PENDING', sendAfter: { lte: now } },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      for (const message of messages) {
        const user = await tx.user.findFirst({
          where: { ...scope, id: message.userId, active: true, emailNotifications: true },
        });
        if (!user) {
          await tx.emailOutbox.updateMany({
            where: { ...scope, id: message.id },
            data: { status: 'FAILED', lastError: 'Email disabled for this account' },
          });
          continue;
        }
        try {
          await transport.send(message);
          await tx.emailOutbox.updateMany({
            where: { ...scope, id: message.id },
            data: { status: 'SENT', sentAt: now, attempts: message.attempts + 1, lastError: null },
          });
        } catch {
          const attempts = message.attempts + 1;
          await tx.emailOutbox.updateMany({
            where: { ...scope, id: message.id },
            data: {
              attempts,
              status: attempts >= 5 ? 'FAILED' : 'PENDING',
              lastError: 'Email transport failed',
              sendAfter: new Date(+now + retryDelay(attempts)),
            },
          });
        }
      }
      return messages.length;
    },
    { timeout: 240000 },
  );
}
