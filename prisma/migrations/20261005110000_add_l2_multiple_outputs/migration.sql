-- CreateTable
CREATE TABLE "BomL2Output" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "parentL2ItemId" TEXT NOT NULL,
    "outputL2ItemId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BomL2Output_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BomL2Output_parentL2ItemId_outputL2ItemId_key" ON "BomL2Output"("parentL2ItemId", "outputL2ItemId");

-- CreateIndex
CREATE INDEX "BomL2Output_restaurantId_idx" ON "BomL2Output"("restaurantId");

-- CreateIndex
CREATE INDEX "BomL2Output_parentL2ItemId_idx" ON "BomL2Output"("parentL2ItemId");

-- CreateIndex
CREATE INDEX "BomL2Output_outputL2ItemId_idx" ON "BomL2Output"("outputL2ItemId");

-- AddForeignKey
ALTER TABLE "BomL2Output" ADD CONSTRAINT "BomL2Output_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomL2Output" ADD CONSTRAINT "BomL2Output_parentL2ItemId_fkey" FOREIGN KEY ("parentL2ItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomL2Output" ADD CONSTRAINT "BomL2Output_outputL2ItemId_fkey" FOREIGN KEY ("outputL2ItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
