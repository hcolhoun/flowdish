CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsageLog_restaurantId_idx" ON "AiUsageLog"("restaurantId");
CREATE INDEX "AiUsageLog_feature_idx" ON "AiUsageLog"("feature");
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
