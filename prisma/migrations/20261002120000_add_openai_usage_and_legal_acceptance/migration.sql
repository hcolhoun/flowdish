ALTER TABLE "AiUsageLog"
ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'deepseek',
ADD COLUMN "cachedPromptTokens" INTEGER,
ADD COLUMN "estimatedCostUsd" DOUBLE PRECISION;

-- Preserve the provider for historical rows while making OpenAI the default
-- for any future usage records that do not set it explicitly.
ALTER TABLE "AiUsageLog"
ALTER COLUMN "provider" SET DEFAULT 'openai';

CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "email" TEXT,
    "businessLegalName" TEXT NOT NULL,
    "selectedPlan" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "dpaVersion" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "aiNoticeVersion" TEXT,
    "authorityConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "aiProcessingAccepted" BOOLEAN NOT NULL DEFAULT false,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LegalAcceptance_restaurantId_idx" ON "LegalAcceptance"("restaurantId");
CREATE INDEX "LegalAcceptance_authUserId_idx" ON "LegalAcceptance"("authUserId");
CREATE INDEX "LegalAcceptance_acceptedAt_idx" ON "LegalAcceptance"("acceptedAt");
CREATE UNIQUE INDEX "LegalAcceptance_restaurantId_authUserId_termsVersion_dpaVersion_selectedPlan_key"
ON "LegalAcceptance"("restaurantId", "authUserId", "termsVersion", "dpaVersion", "selectedPlan");

ALTER TABLE "LegalAcceptance"
ADD CONSTRAINT "LegalAcceptance_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
