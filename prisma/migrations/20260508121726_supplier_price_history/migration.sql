CREATE TABLE IF NOT EXISTS "SupplierProduct" (
  "id" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "supplierSku" TEXT,
  "name" TEXT NOT NULL,
  "packSize" TEXT,
  "weight" TEXT,
  "packPrice" DOUBLE PRECISION,
  "unitPrice" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "linkedItemId" TEXT,

  CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupplierProduct_supplier_supplierSku_idx"
ON "SupplierProduct"("supplier", "supplierSku");

DO $$
BEGIN
  ALTER TABLE "SupplierProduct"
  ADD CONSTRAINT "SupplierProduct_linkedItemId_fkey"
  FOREIGN KEY ("linkedItemId") REFERENCES "Item"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SupplierImportBatch" (
  "id" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "fileName" TEXT,
  "parsedCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "priceChangeCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupplierImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupplierProductPriceHistory" (
  "id" TEXT NOT NULL,
  "supplierProductId" TEXT NOT NULL,
  "importBatchId" TEXT,
  "oldPackPrice" DOUBLE PRECISION,
  "newPackPrice" DOUBLE PRECISION,
  "oldUnitPrice" DOUBLE PRECISION,
  "newUnitPrice" DOUBLE PRECISION,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupplierProductPriceHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupplierProductPriceHistory_supplierProductId_idx"
ON "SupplierProductPriceHistory"("supplierProductId");

CREATE INDEX IF NOT EXISTS "SupplierProductPriceHistory_importBatchId_idx"
ON "SupplierProductPriceHistory"("importBatchId");

DO $$
BEGIN
  ALTER TABLE "SupplierProductPriceHistory"
  ADD CONSTRAINT "SupplierProductPriceHistory_supplierProductId_fkey"
  FOREIGN KEY ("supplierProductId") REFERENCES "SupplierProduct"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "SupplierProductPriceHistory"
  ADD CONSTRAINT "SupplierProductPriceHistory_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "SupplierImportBatch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;