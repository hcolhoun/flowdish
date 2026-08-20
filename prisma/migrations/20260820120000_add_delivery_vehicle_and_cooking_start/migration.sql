ALTER TABLE "Delivery"
ADD COLUMN "deliveryVehicleOk" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PrepHaccpRecord"
ADD COLUMN "cookingStartedAt" TIMESTAMP(3);
