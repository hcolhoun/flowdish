CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "errorText" TEXT,
  "pageUrl" TEXT,
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "createdByName" TEXT,
  "createdByEmail" TEXT,
  "createdByAuthUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicket_restaurantId_idx" ON "SupportTicket"("restaurantId");
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

ALTER TABLE "SupportTicket"
ADD CONSTRAINT "SupportTicket_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
