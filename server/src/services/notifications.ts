import type { Prisma } from '@prisma/client';
import { tenant } from '../db.js';
import { emailTemplate } from '../domain/email.js';
export async function notify(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userIds: string[],
  title: string,
  message: string,
) {
  const users = await tx.user.findMany({
    where: { ...tenant(organizationId), id: { in: [...new Set(userIds)] } },
    select: { id: true, name: true, email: true, emailNotifications: true, active: true },
  });
  await tx.notification.createMany({
    data: users.map((u) => ({ organizationId, userId: u.id, title, message })),
  });
  await tx.emailOutbox.createMany({
    data: users
      .filter((u) => u.emailNotifications && u.active)
      .map((u) => ({
        organizationId,
        userId: u.id,
        to: u.email,
        subject: title,
        ...emailTemplate(u.name, title, message),
      })),
  });
}
