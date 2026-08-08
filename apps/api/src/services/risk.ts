import { prisma } from "@coretta/db";

export interface RiskAssessment {
  score: number;
  allowSponsorship: boolean;
  maxBatchSize: number;
  aiLimitMultiplier: number;
}

export async function evaluateUserRisk(userId: string): Promise<RiskAssessment> {
  const profile = await prisma.userRiskProfile.findUnique({
    where: { userId },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { identities: true, wallets: true },
  });

  let score = profile?.score ?? 50;

  if (user) {
    // Increase trust score for verification and account maturity
    const hasEmail = user.identities.some((i) => i.type === "email" && i.verifiedAt !== null);
    const hasWallet = user.wallets.length > 0;
    const accountAgeDays = (Date.now() - new Date(user.createdAt).getTime()) / (24 * 3600 * 1000);

    if (hasEmail) score += 15;
    if (hasWallet) score += 20;
    if (accountAgeDays > 7) score += 10;
    if (accountAgeDays > 30) score += 15;
  }

  if (profile) {
    score -= profile.failedTxCount * 5;
    score -= profile.otpVelocityCount * 10;
    score -= profile.failedSignatures * 8;
    score -= profile.walletSwitches * 5;
    score -= profile.suspiciousBatches * 15;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    allowSponsorship: score >= 20,
    maxBatchSize: score >= 70 ? 10 : score >= 40 ? 5 : 2,
    aiLimitMultiplier: score >= 80 ? 2.0 : score >= 50 ? 1.0 : 0.5,
  };
}

export async function recordRiskEvent(
  userId: string,
  event: "failed_tx" | "otp_velocity" | "failed_sig" | "wallet_switch" | "suspicious_batch"
): Promise<void> {
  const keyMap = {
    failed_tx: "failedTxCount",
    otp_velocity: "otpVelocityCount",
    failed_sig: "failedSignatures",
    wallet_switch: "walletSwitches",
    suspicious_batch: "suspiciousBatches",
  } as const;

  const key = keyMap[event];
  const existing = await prisma.userRiskProfile.findUnique({ where: { userId } });

  if (!existing) {
    await prisma.userRiskProfile.create({
      data: { userId, [key]: 1, score: 50 },
    });
  } else {
    await prisma.userRiskProfile.update({
      where: { userId },
      data: { [key]: { increment: 1 } },
    });
  }
}
