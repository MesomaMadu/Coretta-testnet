import { prisma } from "@arcremit/db";
import {
  sendUsdcTransferUserOp,
  createSmartAccountFromOwnerKey,
  createArcPublicClient,
} from "@arcremit/chain";
import { formatMicroToUsdc } from "@arcremit/shared";
import type { Address } from "viem";
import { evaluateTransferPolicy, shouldResetDailyLimits } from "./policy.js";
import {
  resolveRecipientWallet,
  getOwnerKeyForWallet,
} from "./wallet.js";

const client = createArcPublicClient();

export async function createRemittance({
  senderUserId,
  recipientType,
  recipientValue,
  amount,
  idempotencyKey,
}: {
  senderUserId: string;
  recipientType: "email" | "phone" | "wallet";
  recipientValue: string;
  amount: string;
  idempotencyKey: string;
}) {
  const existing = await prisma.transfer.findUnique({
    where: { idempotencyKey },
  });
  if (existing) return existing;

  const sender = await prisma.user.findUniqueOrThrow({
    where: { id: senderUserId },
    include: { wallets: true, limits: true },
  });
  const senderWallet = sender.wallets[0];
  if (!senderWallet) throw new Error("SENDER_WALLET_MISSING");

  const { user: recipientUser, wallet: recipientWallet } =
    await resolveRecipientWallet(recipientType, recipientValue);

  if (senderWallet.scaAddress === recipientWallet.scaAddress) {
    throw new Error("SELF_TRANSFER_NOT_ALLOWED");
  }

  let limits = sender.limits;
  if (limits && shouldResetDailyLimits(limits.lastResetAt)) {
    limits = await prisma.userLimit.update({
      where: { userId: senderUserId },
      data: { dailyTxCount: 0, dailySentMicro: 0n, lastResetAt: new Date() },
    });
  }

  const policy = evaluateTransferPolicy({
    amount,
    senderKycTier: sender.kycTier,
    senderStatus: sender.status,
    limits,
    recipientStatus: recipientUser.status,
  });

  if (!policy.allowed || !policy.amountMicro) {
    return prisma.transfer.create({
      data: {
        idempotencyKey,
        senderUserId,
        recipientUserId: recipientUser.id,
        senderWalletId: senderWallet.id,
        recipientWalletId: recipientWallet.id,
        amountMicro: 0n,
        state: "POLICY_DENIED",
        policyReason: policy.reason,
        riskScore: policy.riskScore,
      },
    });
  }

  const transfer = await prisma.transfer.create({
    data: {
      idempotencyKey,
      senderUserId,
      recipientUserId: recipientUser.id,
      senderWalletId: senderWallet.id,
      recipientWalletId: recipientWallet.id,
      amountMicro: policy.amountMicro,
      state: "POLICY_OK",
      riskScore: policy.riskScore,
    },
  });

  return transfer;
}

export async function executeRemittance(transferId: string) {
  const transfer = await prisma.transfer.findUniqueOrThrow({
    where: { id: transferId },
    include: {
      senderWallet: true,
      recipientWallet: true,
    },
  });

  if (transfer.state === "SETTLED" || transfer.state === "INCLUDED") {
    return transfer;
  }
  if (transfer.state === "POLICY_DENIED") {
    throw new Error(`TRANSFER_DENIED:${transfer.policyReason}`);
  }

  await prisma.transfer.update({
    where: { id: transferId },
    data: { state: "SUBMITTED" },
  });

  try {
    const ownerKey = await getOwnerKeyForWallet(transfer.senderWalletId);
    const { account } = await createSmartAccountFromOwnerKey(ownerKey, client);

    const { userOpHash, transactionHash } = await sendUsdcTransferUserOp({
      account,
      client,
      recipient: transfer.recipientWallet.scaAddress as Address,
      amountMicro: transfer.amountMicro,
    });

    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.transfer.update({
        where: { id: transferId },
        data: {
          state: "SETTLED",
          userOpHash,
          txHash: transactionHash,
        },
      });
      const limits = await tx.userLimit.findUnique({
        where: { userId: transfer.senderUserId },
      });
      if (limits) {
        await tx.userLimit.update({
          where: { userId: transfer.senderUserId },
          data: {
            dailyTxCount: limits.dailyTxCount + 1,
            dailySentMicro: limits.dailySentMicro + transfer.amountMicro,
          },
        });
      }
      return t;
    });

    await prisma.auditLog.create({
      data: {
        actorId: transfer.senderUserId,
        action: "TRANSFER_SETTLED",
        metadata: JSON.stringify({
          transferId,
          userOpHash,
          txHash: transactionHash,
          amount: formatMicroToUsdc(transfer.amountMicro),
        }),
      },
    });

    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    await prisma.transfer.update({
      where: { id: transferId },
      data: { state: "FAILED", failureReason: message },
    });
    throw err;
  }
}
