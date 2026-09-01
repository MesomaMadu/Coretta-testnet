CREATE TABLE "BridgeOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sourceChain" TEXT NOT NULL DEFAULT 'Arc_Testnet',
    "destinationChain" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EXECUTING',
    "resultJson" TEXT,
    "sourceTxHash" TEXT,
    "destinationTxHash" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BridgeOperation_idempotencyKey_key" ON "BridgeOperation"("idempotencyKey");
CREATE INDEX "BridgeOperation_userId_createdAt_idx" ON "BridgeOperation"("userId", "createdAt");
CREATE INDEX "BridgeOperation_status_updatedAt_idx" ON "BridgeOperation"("status", "updatedAt");

ALTER TABLE "BridgeOperation" ADD CONSTRAINT "BridgeOperation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
