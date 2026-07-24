import { prisma } from "@arcremit/db";
import {
  normalizeWalletAddress,
  type UserTier,
  type TierLimits,
  type UserUsageMetrics,
} from "@arcremit/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

export type UsageCounterKey =
  | "sponsoredTxCount"
  | "sponsoredUsdMicro"
  | "aiRequestCount"
  | "otpRequestCount"
  | "swapRequestCount"
  | "txSimulationCount"
  | "batchTxCount"
  | "walletCreationCount"
  | "voiceRequestCount"
  | "signatureRequestCount"
  | "connectionCount";

export function getTierLimits(tier: UserTier): TierLimits {
  const envTxLimitDaily = process.env.SPONSORED_TX_LIMIT_DAILY
    ? parseInt(process.env.SPONSORED_TX_LIMIT_DAILY, 10)
    : null;
  const envUsdLimitDaily = process.env.SPONSORED_USD_LIMIT_DAILY
    ? parseInt(process.env.SPONSORED_USD_LIMIT_DAILY, 10)
    : null;
  const envAiLimitDaily = process.env.AI_REQUEST_LIMIT_DAILY
    ? parseInt(process.env.AI_REQUEST_LIMIT_DAILY, 10)
    : null;
  const envOtpLimitHourly = process.env.OTP_LIMIT_HOURLY
    ? parseInt(process.env.OTP_LIMIT_HOURLY, 10)
    : null;

  switch (tier) {
    case "trusted":
      return {
        sponsoredTxDaily: envTxLimitDaily ?? 100,
        sponsoredUsdDaily: envUsdLimitDaily ?? 500,
        aiRequestsDaily: envAiLimitDaily ?? 999999,
        otpRequestsHourly: envOtpLimitHourly ?? 20,
        maxConcurrentTransfers: 10,
      };
    case "wallet_verified":
      return {
        sponsoredTxDaily: envTxLimitDaily ?? 25,
        sponsoredUsdDaily: envUsdLimitDaily ?? 100,
        aiRequestsDaily: envAiLimitDaily ?? 200,
        otpRequestsHourly: envOtpLimitHourly ?? 10,
        maxConcurrentTransfers: 10,
      };
    case "email_verified":
      return {
        sponsoredTxDaily: envTxLimitDaily ?? 10,
        sponsoredUsdDaily: envUsdLimitDaily ?? 25,
        aiRequestsDaily: envAiLimitDaily ?? 50,
        otpRequestsHourly: envOtpLimitHourly ?? 10,
        maxConcurrentTransfers: 3,
      };
    case "anonymous":
    default:
      return {
        sponsoredTxDaily: 0,
        sponsoredUsdDaily: 0,
        aiRequestsDaily: envAiLimitDaily ?? 10,
        otpRequestsHourly: envOtpLimitHourly ?? 3,
        maxConcurrentTransfers: 1,
      };
  }
}

export function determineUserTier(user?: {
  identities?: { type: string; verifiedAt: Date | null }[];
  wallets?: { scaAddress: string }[];
  kycTier?: number;
}): UserTier {
  if (!user) return "anonymous";
  if (user.kycTier && user.kycTier >= 2) return "trusted";
  const walletIdentity = Boolean(
    user.identities?.some((i) => i.type === "wallet" && i.verifiedAt !== null),
  );
  const hasSca = Boolean(user.wallets && user.wallets.length > 0);
  const emailVerified = Boolean(
    user.identities?.some((i) => i.type === "email" && i.verifiedAt !== null),
  );

  if (walletIdentity || hasSca) return "wallet_verified";
  if (emailVerified) return "email_verified";
  return "anonymous";
}

function emptyMetrics(partial: {
  userTier: UserTier;
  walletAddress: string | null;
  live: boolean;
  limits: TierLimits;
}): UserUsageMetrics {
  const now = new Date().toISOString();
  return {
    userTier: partial.userTier,
    walletAddress: partial.walletAddress,
    live: partial.live,
    sponsoredTxCount: 0,
    sponsoredTxLimit: partial.limits.sponsoredTxDaily,
    sponsoredUsdSpent: 0,
    sponsoredUsdLimit: partial.limits.sponsoredUsdDaily,
    aiRequestCount: 0,
    aiRequestLimit: partial.limits.aiRequestsDaily,
    otpRequestCount: 0,
    otpRequestLimit: partial.limits.otpRequestsHourly,
    swapRequestCount: 0,
    swapRequestLimit: 50,
    voiceRequestCount: 0,
    voiceRequestLimit: 100,
    txSimulationCount: 0,
    batchTxCount: 0,
    walletCreationCount: 0,
    signatureRequestCount: 0,
    connectionCount: 0,
    resetInSeconds: 86400,
    lastResetAt: now,
    updatedAt: now,
  };
}

async function maybeResetUserUsage(userId: string) {
  let usage = await prisma.usageRecord.findUnique({ where: { userId } });
  const now = new Date();
  if (!usage) {
    usage = await prisma.usageRecord.create({
      data: { userId, lastResetAt: now },
    });
    return usage;
  }
  const elapsed = now.getTime() - new Date(usage.lastResetAt).getTime();
  if (elapsed >= DAY_MS) {
    usage = await prisma.usageRecord.update({
      where: { userId },
      data: {
        sponsoredTxCount: 0,
        sponsoredUsdMicro: 0n,
        aiRequestCount: 0,
        otpRequestCount: 0,
        swapRequestCount: 0,
        txSimulationCount: 0,
        batchTxCount: 0,
        voiceRequestCount: 0,
        lastResetAt: now,
      },
    });
  }
  return usage;
}

async function maybeResetWalletUsage(walletAddress: string, userId?: string | null) {
  const address = normalizeWalletAddress(walletAddress);
  let usage = await prisma.walletUsageRecord.findUnique({ where: { walletAddress: address } });
  const now = new Date();
  if (!usage) {
    usage = await prisma.walletUsageRecord.create({
      data: {
        walletAddress: address,
        userId: userId ?? null,
        lastResetAt: now,
      },
    });
    return usage;
  }
  const elapsed = now.getTime() - new Date(usage.lastResetAt).getTime();
  if (elapsed >= DAY_MS) {
    usage = await prisma.walletUsageRecord.update({
      where: { walletAddress: address },
      data: {
        sponsoredTxCount: 0,
        sponsoredUsdMicro: 0n,
        aiRequestCount: 0,
        otpRequestCount: 0,
        swapRequestCount: 0,
        txSimulationCount: 0,
        batchTxCount: 0,
        voiceRequestCount: 0,
        signatureRequestCount: 0,
        connectionCount: 0,
        lastResetAt: now,
        ...(userId ? { userId } : {}),
      },
    });
  } else if (userId && usage.userId !== userId) {
    usage = await prisma.walletUsageRecord.update({
      where: { walletAddress: address },
      data: { userId },
    });
  }
  return usage;
}

function toMetricsFromWallet(
  usage: {
    walletAddress: string;
    sponsoredTxCount: number;
    sponsoredUsdMicro: bigint;
    aiRequestCount: number;
    otpRequestCount: number;
    swapRequestCount: number;
    voiceRequestCount: number;
    txSimulationCount: number;
    batchTxCount: number;
    walletCreationCount: number;
    signatureRequestCount: number;
    connectionCount: number;
    lastResetAt: Date;
    updatedAt: Date;
  },
  tier: UserTier,
): UserUsageMetrics {
  const limits = getTierLimits(tier);
  const now = new Date();
  const nextReset = new Date(new Date(usage.lastResetAt).getTime() + DAY_MS);
  const resetInSeconds = Math.max(0, Math.ceil((nextReset.getTime() - now.getTime()) / 1000));
  return {
    userTier: tier,
    walletAddress: usage.walletAddress,
    live: true,
    sponsoredTxCount: usage.sponsoredTxCount,
    sponsoredTxLimit: limits.sponsoredTxDaily,
    sponsoredUsdSpent: Number(usage.sponsoredUsdMicro) / 1_000_000,
    sponsoredUsdLimit: limits.sponsoredUsdDaily,
    aiRequestCount: usage.aiRequestCount,
    aiRequestLimit: limits.aiRequestsDaily,
    otpRequestCount: usage.otpRequestCount,
    otpRequestLimit: limits.otpRequestsHourly,
    swapRequestCount: usage.swapRequestCount,
    swapRequestLimit: 50,
    voiceRequestCount: usage.voiceRequestCount,
    voiceRequestLimit: 100,
    txSimulationCount: usage.txSimulationCount,
    batchTxCount: usage.batchTxCount,
    walletCreationCount: usage.walletCreationCount,
    signatureRequestCount: usage.signatureRequestCount,
    connectionCount: usage.connectionCount,
    resetInSeconds,
    lastResetAt: usage.lastResetAt.toISOString(),
    updatedAt: usage.updatedAt.toISOString(),
  };
}

export async function getWalletUsageMetrics(
  walletAddress: string,
  user?: {
    id: string;
    identities?: { type: string; verifiedAt: Date | null }[];
    wallets?: { scaAddress: string }[];
    kycTier?: number;
  } | null,
): Promise<UserUsageMetrics> {
  const address = normalizeWalletAddress(walletAddress);
  const tier = determineUserTier(user ?? undefined) === "anonymous"
    ? "wallet_verified"
    : determineUserTier(user ?? undefined);
  const usage = await maybeResetWalletUsage(address, user?.id ?? null);
  return toMetricsFromWallet(usage, tier);
}

export async function getUserUsageMetrics(userId: string): Promise<UserUsageMetrics> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { identities: true, wallets: true, usage: true },
  });

  const tier = determineUserTier(user ?? undefined);
  const limits = getTierLimits(tier);

  if (!user) {
    return emptyMetrics({ userTier: "anonymous", walletAddress: null, live: false, limits });
  }

  const walletIdentity = user.identities.find((i) => i.type === "wallet");
  if (walletIdentity) {
    return getWalletUsageMetrics(walletIdentity.normalizedValue, user);
  }

  const usage = await maybeResetUserUsage(userId);
  const now = new Date();
  const nextReset = new Date(new Date(usage.lastResetAt).getTime() + DAY_MS);
  const resetInSeconds = Math.max(0, Math.ceil((nextReset.getTime() - now.getTime()) / 1000));

  return {
    userTier: tier,
    walletAddress: null,
    live: true,
    sponsoredTxCount: usage.sponsoredTxCount,
    sponsoredTxLimit: limits.sponsoredTxDaily,
    sponsoredUsdSpent: Number(usage.sponsoredUsdMicro) / 1_000_000,
    sponsoredUsdLimit: limits.sponsoredUsdDaily,
    aiRequestCount: usage.aiRequestCount,
    aiRequestLimit: limits.aiRequestsDaily,
    otpRequestCount: usage.otpRequestCount,
    otpRequestLimit: limits.otpRequestsHourly,
    swapRequestCount: usage.swapRequestCount,
    swapRequestLimit: 50,
    voiceRequestCount: usage.voiceRequestCount,
    voiceRequestLimit: 100,
    txSimulationCount: usage.txSimulationCount,
    batchTxCount: usage.batchTxCount,
    walletCreationCount: usage.walletCreationCount,
    signatureRequestCount: 0,
    connectionCount: 0,
    resetInSeconds,
    lastResetAt: usage.lastResetAt.toISOString(),
    updatedAt: usage.updatedAt.toISOString(),
  };
}

export async function incrementUsage(
  userId: string,
  key: UsageCounterKey,
  amount: number | bigint = 1,
): Promise<void> {
  // signature/connection are wallet-only counters
  if (key === "signatureRequestCount" || key === "connectionCount") return;

  await maybeResetUserUsage(userId);
  const existing = await prisma.usageRecord.findUnique({ where: { userId } });
  if (!existing) {
    await prisma.usageRecord.create({
      data: { userId, [key]: amount },
    });
  } else {
    await prisma.usageRecord.update({
      where: { userId },
      data: { [key]: { increment: amount } },
    });
  }
}

export async function incrementWalletUsage(
  walletAddress: string,
  key: UsageCounterKey,
  amount: number | bigint = 1,
  userId?: string | null,
): Promise<void> {
  const address = normalizeWalletAddress(walletAddress);
  await maybeResetWalletUsage(address, userId);
  await prisma.walletUsageRecord.update({
    where: { walletAddress: address },
    data: { [key]: { increment: amount } },
  });
}

/** Track usage for a connected wallet (primary) and optionally mirror to user account. */
export async function trackUsageEvent(params: {
  walletAddress?: string | null;
  userId?: string | null;
  key: UsageCounterKey;
  amount?: number | bigint;
}): Promise<void> {
  const amount = params.amount ?? 1;
  if (params.walletAddress) {
    await incrementWalletUsage(params.walletAddress, params.key, amount, params.userId);
    return;
  }
  if (params.userId && params.key !== "signatureRequestCount" && params.key !== "connectionCount") {
    await incrementUsage(params.userId, params.key, amount);
  }
}

export function anonymousUsageMetrics(): UserUsageMetrics {
  return emptyMetrics({
    userTier: "anonymous",
    walletAddress: null,
    live: false,
    limits: getTierLimits("anonymous"),
  });
}
