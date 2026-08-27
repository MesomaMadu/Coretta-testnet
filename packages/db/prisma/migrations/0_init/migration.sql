-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "kycTier" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "preferredName" TEXT,
    "preferredNameUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Identity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL DEFAULT 5042002,
    "scaAddress" TEXT NOT NULL,
    "ownerAddress" TEXT,
    "ownerKeyRef" TEXT,
    "vendorWalletId" TEXT,
    "vendor" TEXT NOT NULL DEFAULT 'circle_modular',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "counterfactual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLimit" (
    "userId" TEXT NOT NULL,
    "dailySendMicro" BIGINT NOT NULL DEFAULT 500000000,
    "dailySentMicro" BIGINT NOT NULL DEFAULT 0,
    "dailyTxCount" INTEGER NOT NULL DEFAULT 0,
    "dailyTxLimit" INTEGER NOT NULL DEFAULT 50,
    "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLimit_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "senderWalletId" TEXT NOT NULL,
    "recipientWalletId" TEXT NOT NULL,
    "amountMicro" BIGINT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'REQUESTED',
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "policyReason" TEXT,
    "userOpHash" TEXT,
    "circleTxId" TEXT,
    "txHash" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "transferId" TEXT,
    "signal" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiActor" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'user',
    "actorHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiActor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "conversationId" TEXT,
    "role" TEXT NOT NULL,
    "contentEnc" TEXT NOT NULL,
    "contentSummary" TEXT,
    "clientMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeedback" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "messageId" TEXT,
    "rating" INTEGER,
    "kind" TEXT NOT NULL,
    "issueType" TEXT,
    "commentEnc" TEXT,
    "contextJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AiFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMemory" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT,
    "summary" TEXT NOT NULL,
    "dataJson" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "source" TEXT NOT NULL DEFAULT 'explicit',
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AiMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiPreference" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AiPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInteraction" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "conversationId" TEXT,
    "userMessageId" TEXT,
    "assistantMessageId" TEXT,
    "intentJson" TEXT,
    "previewHash" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "userId" TEXT NOT NULL,
    "sponsoredTxCount" INTEGER NOT NULL DEFAULT 0,
    "sponsoredUsdMicro" BIGINT NOT NULL DEFAULT 0,
    "aiRequestCount" INTEGER NOT NULL DEFAULT 0,
    "otpRequestCount" INTEGER NOT NULL DEFAULT 0,
    "swapRequestCount" INTEGER NOT NULL DEFAULT 0,
    "txSimulationCount" INTEGER NOT NULL DEFAULT 0,
    "batchTxCount" INTEGER NOT NULL DEFAULT 0,
    "walletCreationCount" INTEGER NOT NULL DEFAULT 0,
    "voiceRequestCount" INTEGER NOT NULL DEFAULT 0,
    "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WalletUsageRecord" (
    "walletAddress" TEXT NOT NULL,
    "userId" TEXT,
    "sponsoredTxCount" INTEGER NOT NULL DEFAULT 0,
    "sponsoredUsdMicro" BIGINT NOT NULL DEFAULT 0,
    "aiRequestCount" INTEGER NOT NULL DEFAULT 0,
    "otpRequestCount" INTEGER NOT NULL DEFAULT 0,
    "swapRequestCount" INTEGER NOT NULL DEFAULT 0,
    "txSimulationCount" INTEGER NOT NULL DEFAULT 0,
    "batchTxCount" INTEGER NOT NULL DEFAULT 0,
    "walletCreationCount" INTEGER NOT NULL DEFAULT 0,
    "voiceRequestCount" INTEGER NOT NULL DEFAULT 0,
    "signatureRequestCount" INTEGER NOT NULL DEFAULT 0,
    "connectionCount" INTEGER NOT NULL DEFAULT 0,
    "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletUsageRecord_pkey" PRIMARY KEY ("walletAddress")
);

-- CreateTable
CREATE TABLE "WalletInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'complete',
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRiskProfile" (
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 50,
    "failedTxCount" INTEGER NOT NULL DEFAULT 0,
    "otpVelocityCount" INTEGER NOT NULL DEFAULT 0,
    "failedSignatures" INTEGER NOT NULL DEFAULT 0,
    "walletSwitches" INTEGER NOT NULL DEFAULT 0,
    "suspiciousBatches" INTEGER NOT NULL DEFAULT 0,
    "lastAssessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRiskProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "OtpToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "purpose" TEXT NOT NULL DEFAULT 'LOGIN',
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Identity_userId_idx" ON "Identity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Identity_type_normalizedValue_key" ON "Identity"("type", "normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_scaAddress_key" ON "Wallet"("scaAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_vendorWalletId_key" ON "Wallet"("vendorWalletId");

-- CreateIndex
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_idempotencyKey_key" ON "Transfer"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Transfer_senderWalletId_createdAt_idx" ON "Transfer"("senderWalletId", "createdAt");

-- CreateIndex
CREATE INDEX "Transfer_recipientWalletId_createdAt_idx" ON "Transfer"("recipientWalletId", "createdAt");

-- CreateIndex
CREATE INDEX "Transfer_state_idx" ON "Transfer"("state");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "FraudSignal_userId_idx" ON "FraudSignal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AiActor_actorHash_key" ON "AiActor"("actorHash");

-- CreateIndex
CREATE INDEX "AiActor_userId_idx" ON "AiActor"("userId");

-- CreateIndex
CREATE INDEX "AiActor_createdAt_idx" ON "AiActor"("createdAt");

-- CreateIndex
CREATE INDEX "AiConversation_actorId_createdAt_idx" ON "AiConversation"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AiConversation_deletedAt_idx" ON "AiConversation"("deletedAt");

-- CreateIndex
CREATE INDEX "AiMessage_actorId_createdAt_idx" ON "AiMessage"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiMessage_clientMessageId_idx" ON "AiMessage"("clientMessageId");

-- CreateIndex
CREATE INDEX "AiFeedback_actorId_createdAt_idx" ON "AiFeedback"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AiFeedback_kind_createdAt_idx" ON "AiFeedback"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "AiFeedback_issueType_idx" ON "AiFeedback"("issueType");

-- CreateIndex
CREATE INDEX "AiMemory_actorId_updatedAt_idx" ON "AiMemory"("actorId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiMemory_category_idx" ON "AiMemory"("category");

-- CreateIndex
CREATE INDEX "AiMemory_key_idx" ON "AiMemory"("key");

-- CreateIndex
CREATE INDEX "AiMemory_deletedAt_idx" ON "AiMemory"("deletedAt");

-- CreateIndex
CREATE INDEX "AiPreference_deletedAt_idx" ON "AiPreference"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiPreference_actorId_key_key" ON "AiPreference"("actorId", "key");

-- CreateIndex
CREATE INDEX "AiInteraction_actorId_createdAt_idx" ON "AiInteraction"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AiInteraction_outcome_idx" ON "AiInteraction"("outcome");

-- CreateIndex
CREATE INDEX "WalletUsageRecord_userId_idx" ON "WalletUsageRecord"("userId");

-- CreateIndex
CREATE INDEX "WalletInteraction_userId_createdAt_idx" ON "WalletInteraction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletInteraction_walletAddress_createdAt_idx" ON "WalletInteraction"("walletAddress", "createdAt");

-- CreateIndex
CREATE INDEX "WalletInteraction_kind_createdAt_idx" ON "WalletInteraction"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "OtpToken_email_purpose_idx" ON "OtpToken"("email", "purpose");

-- AddForeignKey
ALTER TABLE "Identity" ADD CONSTRAINT "Identity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLimit" ADD CONSTRAINT "UserLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_senderWalletId_fkey" FOREIGN KEY ("senderWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_recipientWalletId_fkey" FOREIGN KEY ("recipientWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiActor" ADD CONSTRAINT "AiActor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AiActor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AiActor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AiActor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AiMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMemory" ADD CONSTRAINT "AiMemory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AiActor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiPreference" ADD CONSTRAINT "AiPreference_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AiActor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInteraction" ADD CONSTRAINT "AiInteraction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AiActor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRiskProfile" ADD CONSTRAINT "UserRiskProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

