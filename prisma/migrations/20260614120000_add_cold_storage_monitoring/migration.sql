CREATE TABLE "ColdStorageMonitor" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "storageType" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "minTempC" DOUBLE PRECISION,
    "maxTempC" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ColdStorageMonitor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ColdStorageReading" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "temperatureC" DOUBLE PRECISION NOT NULL,
    "humidity" DOUBLE PRECISION,
    "source" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ColdStorageReading_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ColdStorageMonitor_deviceKey_key" ON "ColdStorageMonitor"("deviceKey");
CREATE INDEX "ColdStorageMonitor_restaurantId_idx" ON "ColdStorageMonitor"("restaurantId");
CREATE INDEX "ColdStorageMonitor_active_idx" ON "ColdStorageMonitor"("active");
CREATE INDEX "ColdStorageReading_restaurantId_idx" ON "ColdStorageReading"("restaurantId");
CREATE INDEX "ColdStorageReading_monitorId_idx" ON "ColdStorageReading"("monitorId");
CREATE INDEX "ColdStorageReading_recordedAt_idx" ON "ColdStorageReading"("recordedAt");

ALTER TABLE "ColdStorageMonitor" ADD CONSTRAINT "ColdStorageMonitor_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ColdStorageReading" ADD CONSTRAINT "ColdStorageReading_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ColdStorageReading" ADD CONSTRAINT "ColdStorageReading_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "ColdStorageMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
