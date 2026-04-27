-- CreateTable
CREATE TABLE "SopDocument" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SopDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SopDocument_itemId_key" ON "SopDocument"("itemId");

-- AddForeignKey
ALTER TABLE "SopDocument" ADD CONSTRAINT "SopDocument_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
