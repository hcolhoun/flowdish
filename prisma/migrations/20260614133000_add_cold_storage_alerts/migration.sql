ALTER TABLE "Restaurant"
ADD COLUMN "coldStorageAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "coldStorageAlertEmails" TEXT;

CREATE TABLE "ColdStorageAlertEvent" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "monitorId" TEXT,
  "deviceName" TEXT,
  "target" TEXT,
  "message" TEXT,
  "source" TEXT,
  "emailSent" BOOLEAN NOT NULL DEFAULT false,
  "emailError" TEXT,
  "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ColdStorageAlertEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ColdStorageAlertEvent_restaurantId_idx" ON "ColdStorageAlertEvent"("restaurantId");
CREATE INDEX "ColdStorageAlertEvent_monitorId_idx" ON "ColdStorageAlertEvent"("monitorId");
CREATE INDEX "ColdStorageAlertEvent_triggeredAt_idx" ON "ColdStorageAlertEvent"("triggeredAt");

ALTER TABLE "ColdStorageAlertEvent"
ADD CONSTRAINT "ColdStorageAlertEvent_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ColdStorageAlertEvent"
ADD CONSTRAINT "ColdStorageAlertEvent_monitorId_fkey"
FOREIGN KEY ("monitorId") REFERENCES "ColdStorageMonitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
