ALTER TABLE "InventoryLot" ADD COLUMN IF NOT EXISTS "batchCode" TEXT;
ALTER TABLE "InventoryLot" ADD COLUMN "prepBatchId" TEXT;

CREATE TABLE "PrepHaccpRecord" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "prepBatchId" TEXT NOT NULL,
    "cookingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cookingFinishedAt" TIMESTAMP(3),
    "cookingCoreTempC" DOUBLE PRECISION,
    "coolingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "coolingIntoFridgeAt" TIMESTAMP(3),
    "reheatingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reheatingCoreTempC" DOUBLE PRECISION,
    "hotHoldEnabled" BOOLEAN NOT NULL DEFAULT false,
    "hotHoldStartedAt" TIMESTAMP(3),
    "hotHoldCoreTemp1C" DOUBLE PRECISION,
    "hotHoldCoreTemp2C" DOUBLE PRECISION,
    "hotHoldCoreTemp3C" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrepHaccpRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrepHaccpRecord_prepBatchId_key" ON "PrepHaccpRecord"("prepBatchId");
CREATE INDEX "PrepHaccpRecord_restaurantId_idx" ON "PrepHaccpRecord"("restaurantId");
CREATE INDEX "InventoryLot_prepBatchId_idx" ON "InventoryLot"("prepBatchId");

ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_prepBatchId_fkey" FOREIGN KEY ("prepBatchId") REFERENCES "PrepBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrepHaccpRecord" ADD CONSTRAINT "PrepHaccpRecord_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrepHaccpRecord" ADD CONSTRAINT "PrepHaccpRecord_prepBatchId_fkey" FOREIGN KEY ("prepBatchId") REFERENCES "PrepBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
