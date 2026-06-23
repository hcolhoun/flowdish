CREATE TYPE "VatReclaimStatus" AS ENUM (
  'NOT_APPLICABLE',
  'ELIGIBLE',
  'CLAIMED',
  'NOT_CLAIMED'
);

ALTER TABLE "Delivery"
ADD COLUMN "vatRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "vatReclaimStatus" "VatReclaimStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';

CREATE INDEX "Delivery_restaurantId_deliveredAt_idx"
ON "Delivery"("restaurantId", "deliveredAt");

CREATE INDEX "Delivery_restaurantId_vatReclaimStatus_idx"
ON "Delivery"("restaurantId", "vatReclaimStatus");
