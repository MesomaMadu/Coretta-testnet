ALTER TABLE "Transfer" ADD COLUMN "limitReservedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TransferApproval" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transferId" TEXT,
    "approvalId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransactionAuthorizationNonce" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionAuthorizationNonce_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SwapAndSendOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EXECUTING',
    "swapTxHash" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwapAndSendOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransferApproval_transferId_key" ON "TransferApproval"("transferId");
CREATE INDEX "TransferApproval_recipientUserId_status_createdAt_idx" ON "TransferApproval"("recipientUserId", "status", "createdAt");
CREATE INDEX "TransferApproval_senderUserId_status_createdAt_idx" ON "TransferApproval"("senderUserId", "status", "createdAt");
CREATE INDEX "TransferApproval_status_expiresAt_idx" ON "TransferApproval"("status", "expiresAt");
CREATE INDEX "UserNotification_userId_readAt_createdAt_idx" ON "UserNotification"("userId", "readAt", "createdAt");
CREATE INDEX "UserNotification_transferId_idx" ON "UserNotification"("transferId");
CREATE INDEX "UserNotification_approvalId_idx" ON "UserNotification"("approvalId");
CREATE UNIQUE INDEX "TransactionAuthorizationNonce_userId_nonce_key" ON "TransactionAuthorizationNonce"("userId", "nonce");
CREATE INDEX "TransactionAuthorizationNonce_expiresAt_idx" ON "TransactionAuthorizationNonce"("expiresAt");
CREATE UNIQUE INDEX "SwapAndSendOperation_idempotencyKey_key" ON "SwapAndSendOperation"("idempotencyKey");
CREATE INDEX "SwapAndSendOperation_userId_createdAt_idx" ON "SwapAndSendOperation"("userId", "createdAt");
CREATE INDEX "SwapAndSendOperation_status_updatedAt_idx" ON "SwapAndSendOperation"("status", "updatedAt");

ALTER TABLE "TransferApproval" ADD CONSTRAINT "TransferApproval_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransferApproval" ADD CONSTRAINT "TransferApproval_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransferApproval" ADD CONSTRAINT "TransferApproval_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "TransferApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionAuthorizationNonce" ADD CONSTRAINT "TransactionAuthorizationNonce_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SwapAndSendOperation" ADD CONSTRAINT "SwapAndSendOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
