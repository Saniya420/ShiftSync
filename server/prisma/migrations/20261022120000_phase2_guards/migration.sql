-- Only one pending/accepted handover can own a shift at a time.
CREATE UNIQUE INDEX "SwapRequest_active_shift_key" ON "SwapRequest" ("organizationId", "shiftId")
WHERE "status" IN ('PENDING', 'ACCEPTED');
CREATE INDEX "SwapRequest_organizationId_status_idx" ON "SwapRequest" ("organizationId", "status");
CREATE INDEX "AttendanceRecord_organizationId_userId_idx" ON "AttendanceRecord" ("organizationId", "userId");
