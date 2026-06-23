CREATE TYPE "SupplierCreditClaimStatus" AS ENUM ('OPEN', 'CREDIT_RECEIVED', 'CLOSED');

CREATE TABLE "SupplierCreditClaim" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "supplierSku" TEXT,
  "productName" TEXT NOT NULL,
  "qty" DOUBLE PRECISION,
  "unitType" "UnitType",
  "chargedAmount" DOUBLE PRECISION,
  "docketNumber" TEXT,
  "chargedAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "status" "SupplierCreditClaimStatus" NOT NULL DEFAULT 'OPEN',
  "followUpCount" INTEGER NOT NULL DEFAULT 0,
  "nextFollowUpAt" TIMESTAMP(3),
  "lastFollowUpAt" TIMESTAMP(3),
  "lastEmailError" TEXT,
  "createdByName" TEXT,
  "createdByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupplierCreditClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierCreditConfig" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "supplierEmail" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "firstFollowUpDays" INTEGER NOT NULL DEFAULT 3,
  "repeatEveryDays" INTEGER NOT NULL DEFAULT 3,
  "maxFollowUps" INTEGER NOT NULL DEFAULT 5,
  "ccEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupplierCreditConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierCreditClaim_restaurantId_idx" ON "SupplierCreditClaim"("restaurantId");
CREATE INDEX "SupplierCreditClaim_restaurantId_status_idx" ON "SupplierCreditClaim"("restaurantId", "status");
CREATE INDEX "SupplierCreditClaim_nextFollowUpAt_idx" ON "SupplierCreditClaim"("nextFollowUpAt");
CREATE INDEX "SupplierCreditConfig_restaurantId_idx" ON "SupplierCreditConfig"("restaurantId");
CREATE UNIQUE INDEX "SupplierCreditConfig_restaurantId_supplier_key" ON "SupplierCreditConfig"("restaurantId", "supplier");

ALTER TABLE "SupplierCreditClaim"
ADD CONSTRAINT "SupplierCreditClaim_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierCreditConfig"
ADD CONSTRAINT "SupplierCreditConfig_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
