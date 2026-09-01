import {
  MAX_TRANSFER_MICRO,
  DEFAULT_DAILY_SEND_LIMIT_MICRO,
  DEFAULT_DAILY_TX_LIMIT,
  parseUsdcToMicro,
} from "@coretta/shared";
import type { UserLimit } from "@coretta/db";

export interface PolicyInput {
  amount: string;
  senderKycTier: number;
  senderStatus: string;
  limits: UserLimit | null;
  recipientStatus: string;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  amountMicro?: bigint;
  riskScore: number;
}

export function evaluateTransferPolicy(input: PolicyInput): PolicyResult {
  if (input.senderStatus !== "ACTIVE") {
    return { allowed: false, reason: "SENDER_NOT_ACTIVE", riskScore: 100 };
  }
  if (input.recipientStatus !== "ACTIVE") {
    return { allowed: false, reason: "RECIPIENT_NOT_ACTIVE", riskScore: 80 };
  }
  if (input.senderKycTier < 1) {
    return { allowed: false, reason: "KYC_REQUIRED", riskScore: 90 };
  }

  let amountMicro: bigint;
  try {
    amountMicro = parseUsdcToMicro(input.amount);
  } catch {
    return { allowed: false, reason: "INVALID_AMOUNT", riskScore: 0 };
  }

  if (amountMicro <= 0n) {
    return { allowed: false, reason: "AMOUNT_TOO_SMALL", riskScore: 0 };
  }
  if (amountMicro > MAX_TRANSFER_MICRO) {
    return { allowed: false, reason: "AMOUNT_EXCEEDS_MAX", riskScore: 50 };
  }

  const limits = input.limits;
  if (limits) {
    if (limits.dailyTxCount >= limits.dailyTxLimit) {
      return { allowed: false, reason: "DAILY_TX_LIMIT", riskScore: 40 };
    }
    const dailyCap =
      limits.dailySendMicro > 0n
        ? limits.dailySendMicro
        : DEFAULT_DAILY_SEND_LIMIT_MICRO;
    const sent = limits.dailySentMicro ?? 0n;
    if (sent + amountMicro > dailyCap) {
      return { allowed: false, reason: "DAILY_SEND_LIMIT", riskScore: 40 };
    }
  }

  return { allowed: true, amountMicro, riskScore: 5 };
}

export function shouldResetDailyLimits(lastResetAt: Date): boolean {
  const now = new Date();
  return (
    lastResetAt.getUTCFullYear() !== now.getUTCFullYear() ||
    lastResetAt.getUTCMonth() !== now.getUTCMonth() ||
    lastResetAt.getUTCDate() !== now.getUTCDate()
  );
}

export async function getDefaultLimits() {
  return {
    dailySendMicro: DEFAULT_DAILY_SEND_LIMIT_MICRO,
    dailyTxLimit: DEFAULT_DAILY_TX_LIMIT,
    dailyTxCount: 0,
  };
}
