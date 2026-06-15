CREATE TABLE "SalesModifierAdjustment" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "soldAt" TIMESTAMP(3) NOT NULL,
  "itemId" TEXT NOT NULL,
  "qtyDelta" DOUBLE PRECISION NOT NULL,
  "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sourceCode" TEXT,
  "sourceName" TEXT,
  "modifierType" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SalesModifierAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesModifierAdjustment_restaurantId_idx" ON "SalesModifierAdjustment"("restaurantId");
CREATE INDEX "SalesModifierAdjustment_itemId_idx" ON "SalesModifierAdjustment"("itemId");
CREATE INDEX "SalesModifierAdjustment_soldAt_idx" ON "SalesModifierAdjustment"("soldAt");

ALTER TABLE "SalesModifierAdjustment"
ADD CONSTRAINT "SalesModifierAdjustment_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesModifierAdjustment"
ADD CONSTRAINT "SalesModifierAdjustment_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
