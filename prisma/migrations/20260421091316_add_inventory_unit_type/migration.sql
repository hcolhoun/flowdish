/*
  Warnings:

  - Added the required column `unitType` to the `InventoryLot` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "InventoryLot" ADD COLUMN     "unitType" "UnitType" NOT NULL;
