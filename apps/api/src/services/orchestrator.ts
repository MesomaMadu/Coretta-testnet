import { sendCircleUsdcTransfer, waitForCircleTransaction } from "./transactions.js";
import { prisma } from "@coretta/db";
import {
  sendUsdcTransferUserOp,
  createSmartAccountFromOwnerKey,
  createArcPublicClient,
} from "@coretta/chain";
import { formatMicroToUsdc } from "@coretta/shared";
import type { Address } from "viem";
import { evaluateTransferPolicy, shouldResetDailyLimits } from "./policy.js";
import {
  resolveRecipientWallet,
  getOwnerKeyForWallet,
} from "./wallet.js";
import { log } from "../lib/log.js";
import { config } from "../config.js";

const client = createArcPublicClient(config.arcRpcUrl);

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

async function markSettledAndBumpLimits(params: {
  transferId: string;
  senderUserId: string;
  amountMicro: bigint;
  txHash: string;
  userOpHash?: string | null;
  circleTxId?: string;
}) {
  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.transfer.update({
      where: { id: params.transferId },
      data: {
        state: "SETTLED",
        txHash: params.txHash,
        ...(params.userOpHash ? { userOpHash: params.userOpHash } : {}),
      },
    });
    const limits = await tx.userLimit.findUnique({
      where: { userId: t.senderUserId },
    });
    if (limits) {
      await tx.userLimit.update({
        where: { userId: t.senderUserId },
        data: {
          dailyTxCount: limits.dailyTxCount + 1,
          dailySentMicro: limits.dailySentMicro + t.amountMicro,
        },
      });
    }
    return t;
  });

  await prisma.auditLog.create({
    data: {
      actorId: params.senderUserId,
      action: "TRANSFER_SETTLED",
      metadata: JSON.stringify({
        transferId: params.transferId,
        txHash: params.txHash,
        userOpHash: params.userOpHash ?? undefined,
        circleTxId: params.circleTxId,
        amount: formatMicroToUsdc(params.amountMicro),
      }),
    },
  });

  return updated;
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

  try {
    // Circle developer-controlled SCA path
    if (
      transfer.senderWallet?.vendor === "circle_modular" &&
      transfer.senderWallet.vendorWalletId
    ) {
      await prisma.transfer.update({
        where: { id: transferId },
        data: { state: "SUBMITTED" },
      });

      const result = await sendCircleUsdcTransfer({
        vendorWalletId: transfer.senderWallet.vendorWalletId,
        recipientAddress: transfer.recipientWallet.scaAddress,
        amountMicro: transfer.amountMicro,
        // Stable key so accidental double-execute of same transfer does not double-spend
        idempotencyKey: transfer.idempotencyKey,
      });

      const final = await waitForCircleTransaction(result.circleTxId);

      return markSettledAndBumpLimits({
        transferId,
        senderUserId: transfer.senderUserId,
        amountMicro: transfer.amountMicro,
        txHash: final.txHash,
        circleTxId: result.circleTxId,
      });
    }

    // Legacy Safe + encrypted owner key + UserOp path
    const ownerKey = await getOwnerKeyForWallet(transfer.senderWalletId);
    const { account } = await createSmartAccountFromOwnerKey(ownerKey, client);

    const { userOpHash, transactionHash } = await sendUsdcTransferUserOp({
      account,
      client,
      recipient: transfer.recipientWallet.scaAddress as Address,
      amountMicro: transfer.amountMicro,
    });

    return markSettledAndBumpLimits({
      transferId,
      senderUserId: transfer.senderUserId,
      amountMicro: transfer.amountMicro,
      txHash: transactionHash,
      userOpHash,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    log.remit("executeRemittance failed", { transferId, message });
    if (/paymaster|permit|sponsorship/i.test(message)) {
      log.paymaster("Paymaster-related failure", { transferId, message });
    }
    if (/rpc|rate limit|ECONN|timeout|Circle/i.test(message)) {
      log.rpc("RPC/Circle-related failure", { transferId, message });
    }
    await prisma.transfer.update({
      where: { id: transferId },
      data: { state: "FAILED", failureReason: message },
    });
    throw err;
  }
}
