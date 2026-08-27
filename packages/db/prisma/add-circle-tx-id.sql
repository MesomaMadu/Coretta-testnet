-- Additive tracking field for restart-safe Circle transaction reconciliation.
ALTER TABLE "Transfer"
ADD COLUMN IF NOT EXISTS "circleTxId" TEXT;
