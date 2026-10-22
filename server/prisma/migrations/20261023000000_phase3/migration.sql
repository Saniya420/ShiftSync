ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TABLE "EmailOutbox" (
"id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL,
"to" TEXT NOT NULL, "subject" TEXT NOT NULL, "html" TEXT NOT NULL, "text" TEXT NOT NULL,
"status" "EmailStatus" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
"lastError" TEXT, "sendAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sentAt" TIMESTAMP(3),
CONSTRAINT "EmailOutbox_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
CONSTRAINT "EmailOutbox_user_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE CASCADE);
CREATE INDEX "EmailOutbox_organizationId_status_sendAfter_idx" ON "EmailOutbox"("organizationId", "status", "sendAfter");