-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('L1', 'L2', 'L3');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('g', 'ml', 'each');

-- CreateEnum
CREATE TYPE "InventorySourceType" AS ENUM ('DELIVERY', 'PREP');

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemType" "ItemType" NOT NULL,
    "unitType" "UnitType" NOT NULL,
    "shelfLifeDays" INTEGER,
    "sellingPrice" DOUBLE PRECISION,
    "standardBatchOutput" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomL1L2" (
    "id" TEXT NOT NULL,
    "l1ItemId" TEXT NOT NULL,
    "l2ItemId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BomL1L2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomL1L3" (
    "id" TEXT NOT NULL,
    "l1ItemId" TEXT NOT NULL,
    "l3ItemId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BomL1L3_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomL2L3" (
    "id" TEXT NOT NULL,
    "l2ItemId" TEXT NOT NULL,
    "l3ItemId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BomL2L3_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitType" "UnitType" NOT NULL,
    "supplier" TEXT,
    "price" DOUBLE PRECISION,
    "expiryAt" TIMESTAMP(3),

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLot" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qtyInitial" DOUBLE PRECISION NOT NULL,
    "qtyRemaining" DOUBLE PRECISION NOT NULL,
    "expiryAt" TIMESTAMP(3),
    "sourceType" "InventorySourceType" NOT NULL,

    CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepBatch" (
    "id" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL,
    "itemId" TEXT NOT NULL,
    "qtyOutput" DOUBLE PRECISION NOT NULL,
    "expiryAt" TIMESTAMP(3),

    CONSTRAINT "PrepBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waste" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Waste_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Item_sku_key" ON "Item"("sku");

-- AddForeignKey
ALTER TABLE "BomL1L2" ADD CONSTRAINT "BomL1L2_l1ItemId_fkey" FOREIGN KEY ("l1ItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomL1L2" ADD CONSTRAINT "BomL1L2_l2ItemId_fkey" FOREIGN KEY ("l2ItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomL1L3" ADD CONSTRAINT "BomL1L3_l1ItemId_fkey" FOREIGN KEY ("l1ItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomL1L3" ADD CONSTRAINT "BomL1L3_l3ItemId_fkey" FOREIGN KEY ("l3ItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomL2L3" ADD CONSTRAINT "BomL2L3_l2ItemId_fkey" FOREIGN KEY ("l2ItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomL2L3" ADD CONSTRAINT "BomL2L3_l3ItemId_fkey" FOREIGN KEY ("l3ItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepBatch" ADD CONSTRAINT "PrepBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waste" ADD CONSTRAINT "Waste_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
