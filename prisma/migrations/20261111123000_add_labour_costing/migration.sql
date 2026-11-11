ALTER TABLE "Restaurant"
ADD COLUMN "labourCostingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "blendedLabourRatePerHour" DOUBLE PRECISION,
ADD COLUMN "labourRateUpdatedAt" TIMESTAMP(3);

ALTER TABLE "Item"
ADD COLUMN "serviceBatchSize" DOUBLE PRECISION,
ADD COLUMN "serviceSetupMinutes" DOUBLE PRECISION,
ADD COLUMN "serviceActiveMinutes" DOUBLE PRECISION,
ADD COLUMN "serviceCleanupMinutes" DOUBLE PRECISION,
ADD COLUMN "servicePassiveMinutes" DOUBLE PRECISION,
ADD COLUMN "serviceHandsOnMinutes" DOUBLE PRECISION,
ADD COLUMN "serviceElapsedMinutes" DOUBLE PRECISION,
ADD COLUMN "serviceTimeConfidence" DOUBLE PRECISION,
ADD COLUMN "serviceTimeAssumptions" JSONB,
ADD COLUMN "serviceTimeStatus" "PrepTimeStatus" NOT NULL DEFAULT 'MISSING',
ADD COLUMN "serviceTimeFingerprint" TEXT,
ADD COLUMN "serviceTimeCalculatedAt" TIMESTAMP(3),
ADD COLUMN "serviceTimeConfirmedAt" TIMESTAMP(3),
ADD COLUMN "serviceTimeConfirmedBy" TEXT;
