CREATE TABLE "BridgeBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sourceChain" TEXT NOT NULL DEFAULT 'Arc_Testnet',
    "destinationChain" TEXT NOT NULL,
    "totalAmount" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BridgeBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BridgeOperation"
ADD COLUMN "batchId" TEXT,
ADD COLUMN "legIndex" INTEGER;

CREATE UNIQUE INDEX "BridgeBatch_idempotencyKey_key" ON "BridgeBatch"("idempotencyKey");
CREATE INDEX "BridgeBatch_userId_createdAt_idx" ON "BridgeBatch"("userId", "createdAt");
CREATE INDEX "BridgeBatch_status_updatedAt_idx" ON "BridgeBatch"("status", "updatedAt");
CREATE INDEX "BridgeOperation_batchId_legIndex_idx" ON "BridgeOperation"("batchId", "legIndex");
CREATE UNIQUE INDEX "BridgeOperation_batchId_legIndex_key" ON "BridgeOperation"("batchId", "legIndex");

ALTER TABLE "BridgeBatch" ADD CONSTRAINT "BridgeBatch_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BridgeOperation" ADD CONSTRAINT "BridgeOperation_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "BridgeBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
