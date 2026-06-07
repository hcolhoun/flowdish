ALTER TABLE "StaffUser" ADD COLUMN "isAccountPin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StaffUser" ADD COLUMN "accountAuthUserId" TEXT;
ALTER TABLE "StaffUser" ADD COLUMN "accountEmail" TEXT;

CREATE INDEX "StaffUser_restaurantId_isAccountPin_idx" ON "StaffUser"("restaurantId", "isAccountPin");
CREATE INDEX "StaffUser_accountAuthUserId_idx" ON "StaffUser"("accountAuthUserId");
