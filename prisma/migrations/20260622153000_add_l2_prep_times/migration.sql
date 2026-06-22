CREATE TYPE "PrepTimeStatus" AS ENUM ('MISSING', 'ESTIMATED', 'CONFIRMED', 'STALE');

ALTER TABLE "Item"
ADD COLUMN "prepSetupMinutes" DOUBLE PRECISION,
ADD COLUMN "prepActiveMinutes" DOUBLE PRECISION,
ADD COLUMN "prepCleanupMinutes" DOUBLE PRECISION,
ADD COLUMN "prepPassiveMinutes" DOUBLE PRECISION,
ADD COLUMN "prepHandsOnMinutes" DOUBLE PRECISION,
ADD COLUMN "prepElapsedMinutes" DOUBLE PRECISION,
ADD COLUMN "prepTimeConfidence" DOUBLE PRECISION,
ADD COLUMN "prepTimeAssumptions" JSONB,
ADD COLUMN "prepTimeStatus" "PrepTimeStatus" NOT NULL DEFAULT 'MISSING',
ADD COLUMN "prepTimeFingerprint" TEXT,
ADD COLUMN "prepTimeCalculatedAt" TIMESTAMP(3),
ADD COLUMN "prepTimeConfirmedAt" TIMESTAMP(3),
ADD COLUMN "prepTimeConfirmedBy" TEXT;

UPDATE "Item"
SET "prepTimeStatus" = 'MISSING'
WHERE "itemType" = 'L2';
