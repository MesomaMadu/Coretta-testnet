-- DropForeignKey
ALTER TABLE "Transfer" DROP CONSTRAINT "Transfer_recipientUserId_fkey";

-- DropForeignKey
ALTER TABLE "Transfer" DROP CONSTRAINT "Transfer_recipientWalletId_fkey";

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "asset" TEXT NOT NULL DEFAULT 'USDC',
ADD COLUMN     "destinationAddress" TEXT,
ADD COLUMN     "network" TEXT NOT NULL DEFAULT 'arc-testnet',
ADD COLUMN     "settledAt" TIMESTAMP(3),
ALTER COLUMN "recipientWalletId" DROP NOT NULL,
ALTER COLUMN "recipientUserId" DROP NOT NULL;

-- Preserve the exact historical destination and best-known settlement time.
UPDATE "Transfer" AS transfer
SET "destinationAddress" = wallet."scaAddress"
FROM "Wallet" AS wallet
WHERE transfer."recipientWalletId" = wallet."id"
  AND transfer."destinationAddress" IS NULL;

UPDATE "Transfer"
SET "settledAt" = "updatedAt"
WHERE "state" IN ('SETTLED', 'INCLUDED')
  AND "settledAt" IS NULL;

-- CreateTable
CREATE TABLE "SavedRecipient" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "normalizedLabel" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "normalizedAddress" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'arc-testnet',
    "source" TEXT NOT NULL DEFAULT 'USER_CONFIRMED',
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdFromTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SavedRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedRecipient_userId_normalizedLabel_deletedAt_idx" ON "SavedRecipient"("userId", "normalizedLabel", "deletedAt");

-- CreateIndex
CREATE INDEX "SavedRecipient_userId_normalizedAddress_network_idx" ON "SavedRecipient"("userId", "normalizedAddress", "network");

-- CreateIndex
CREATE INDEX "SavedRecipient_userId_lastUsedAt_idx" ON "SavedRecipient"("userId", "lastUsedAt");

-- CreateIndex
CREATE INDEX "Transfer_senderUserId_createdAt_idx" ON "Transfer"("senderUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Transfer_recipientUserId_createdAt_idx" ON "Transfer"("recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Transfer_destinationAddress_createdAt_idx" ON "Transfer"("destinationAddress", "createdAt");

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_recipientWalletId_fkey" FOREIGN KEY ("recipientWalletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedRecipient" ADD CONSTRAINT "SavedRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
