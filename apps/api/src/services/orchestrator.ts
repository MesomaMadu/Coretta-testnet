import {
  getCircleTransactionStatus,
  sendCircleTokenTransfer,
  waitForCircleTransaction,
} from "./transactions.js";
import { prisma } from "@coretta/db";
import {
  sendTokenTransferUserOp,
  createSmartAccountFromOwnerKey,
  createArcPublicClient,
} from "@coretta/chain";
import {
  EURC_ADDRESS,
  formatMicroToUsdc,
  normalizeWalletAddress,
  USDC_ADDRESS,
} from "@coretta/shared";
import type { Address } from "viem";
import { evaluateTransferPolicy, shouldResetDailyLimits } from "./policy.js";
import {
  resolveRecipientWallet,
  getOwnerKeyForWallet,
} from "./wallet.js";
import { log } from "../lib/log.js";
import { config } from "../config.js";
import { trackUsageEvent } from "./limits.js";
import { createUserNotification } from "./approvals.js";
import type { Prisma } from "@coretta/db";

const client = createArcPublicClient(config.arcRpcUrl);
const circleReconciliationJobs = new Map<string, Promise<void>>();

async function createTransferIdempotently(data: Prisma.TransferUncheckedCreateInput) {
  try {
    return await prisma.transfer.create({ data });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const existing = await prisma.transfer.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing && existing.senderUserId === data.senderUserId) return existing;
      if (existing) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
    }
    throw error;
  }
}

export async function createRemittance({
  senderUserId,
  recipientType,
  recipientValue,
  amount,
  asset = "USDC",
  idempotencyKey,
}: {
  senderUserId: string;
  recipientType: "email" | "phone" | "wallet";
  recipientValue: string;
  amount: string;
  asset?: "USDC" | "EURC";
  idempotencyKey: string;
}) {
  const existing = await prisma.transfer.findUnique({
    where: { idempotencyKey },
  });
  if (existing && existing.senderUserId === senderUserId) return existing;
  if (existing) throw new Error("IDEMPOTENCY_KEY_CONFLICT");

  const sender = await prisma.user.findUniqueOrThrow({
    where: { id: senderUserId },
    include: { wallets: true, limits: true },
  });
  const senderWallet = sender.wallets[0];
  if (!senderWallet) throw new Error("SENDER_WALLET_MISSING");

  let recipientUser: Awaited<ReturnType<typeof prisma.user.findFirst>> = null;
  let recipientWallet: Awaited<ReturnType<typeof prisma.wallet.findFirst>> = null;
  let destinationAddress: string;

  if (recipientType === "wallet") {
    destinationAddress = normalizeWalletAddress(recipientValue);
    const exactWallet = await prisma.wallet.findFirst({
      where: { scaAddress: { equals: destinationAddress, mode: "insensitive" } },
      include: { user: true },
    });
    if (exactWallet) {
      recipientWallet = exactWallet;
      recipientUser = exactWallet.user;
    } else {
      const identity = await prisma.identity.findUnique({
        where: {
          type_normalizedValue: {
            type: "wallet",
            normalizedValue: destinationAddress.toLowerCase(),
          },
        },
        include: { user: true },
      });
      recipientUser = identity?.user ?? null;
    }
  } else {
    const resolved = await resolveRecipientWallet(recipientType, recipientValue);
    recipientUser = resolved.user;
    recipientWallet = resolved.wallet;
    destinationAddress = resolved.wallet.scaAddress;
  }

  if (senderWallet.scaAddress.toLowerCase() === destinationAddress.toLowerCase()) {
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
    recipientStatus: recipientUser?.status ?? "ACTIVE",
  });

  if (!policy.allowed || !policy.amountMicro) {
    return createTransferIdempotently({
      idempotencyKey,
      senderUserId,
      recipientUserId: recipientUser?.id ?? null,
      senderWalletId: senderWallet.id,
      recipientWalletId: recipientWallet?.id ?? null,
      destinationAddress,
      amountMicro: 0n,
      asset,
      state: "POLICY_DENIED",
      policyReason: policy.reason,
      riskScore: policy.riskScore,
    });
  }

  const transfer = await createTransferIdempotently({
    idempotencyKey,
    senderUserId,
    recipientUserId: recipientUser?.id ?? null,
    senderWalletId: senderWallet.id,
    recipientWalletId: recipientWallet?.id ?? null,
    destinationAddress,
    amountMicro: policy.amountMicro,
    asset,
    state: "POLICY_OK",
    riskScore: policy.riskScore,
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
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.transfer.findUniqueOrThrow({
      where: { id: params.transferId },
    });
    if (existing.state === "SETTLED" || existing.state === "INCLUDED") {
      return { transfer: existing, newlySettled: false };
    }
    const t = await tx.transfer.update({
      where: { id: params.transferId },
      data: {
        state: "SETTLED",
        txHash: params.txHash,
        ...(params.userOpHash ? { userOpHash: params.userOpHash } : {}),
        ...(params.circleTxId ? { circleTxId: params.circleTxId } : {}),
        failureReason: null,
        settledAt: new Date(),
        limitReservedAt: null,
      },
    });
    await tx.wallet.updateMany({
      where: {
        id: t.senderWalletId,
        counterfactual: true,
      },
      data: { counterfactual: false },
    });
    const limits = await tx.userLimit.findUnique({
      where: { userId: t.senderUserId },
    });
    if (limits && !existing.limitReservedAt) {
      await tx.userLimit.update({
        where: { userId: t.senderUserId },
        data: {
          dailyTxCount: { increment: 1 },
          dailySentMicro: { increment: t.amountMicro },
        },
      });
    }
    if (t.destinationAddress) {
      await tx.savedRecipient.updateMany({
        where: {
          userId: t.senderUserId,
          normalizedAddress: t.destinationAddress.toLowerCase(),
          network: t.network,
          deletedAt: null,
        },
        data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
      });
    }
    return { transfer: t, newlySettled: true };
  });

  if (!result.newlySettled) return result.transfer;

  const sender = await prisma.user.findUnique({
    where: { id: params.senderUserId },
    include: { identities: true, wallets: true },
  });
  const eoaRaw =
    sender?.identities.find((identity) => identity.type === "wallet")?.normalizedValue ??
    sender?.wallets.find((wallet) => wallet.ownerAddress)?.ownerAddress ??
    null;
  let usageWallet: string | null = null;
  if (eoaRaw) {
    try {
      usageWallet = normalizeWalletAddress(eoaRaw);
    } catch {
      usageWallet = eoaRaw.toLowerCase();
    }
  }
  await trackUsageEvent({
    walletAddress: usageWallet,
    userId: params.senderUserId,
    key: "sponsoredTxCount",
  });
  await trackUsageEvent({
    walletAddress: usageWallet,
    userId: params.senderUserId,
    key: "sponsoredUsdMicro",
    amount: params.amountMicro,
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
        asset: result.transfer.asset,
      }),
    },
  });

  const approval = await prisma.transferApproval.findUnique({
    where: { transferId: params.transferId },
  });
  if (approval) {
    await Promise.all([
      createUserNotification({
        userId: result.transfer.senderUserId,
        transferId: result.transfer.id,
        approvalId: approval.id,
        type: "TRANSFER_SETTLED",
        title: "Payment settled",
        body: `${formatMicroToUsdc(result.transfer.amountMicro)} ${result.transfer.asset} settled on Arc Testnet.`,
      }),
      result.transfer.recipientUserId
        ? createUserNotification({
            userId: result.transfer.recipientUserId,
            transferId: result.transfer.id,
            approvalId: approval.id,
            type: "TRANSFER_RECEIVED",
            title: "Payment received",
            body: `${formatMicroToUsdc(result.transfer.amountMicro)} ${result.transfer.asset} settled in your Coretta wallet.`,
          })
        : Promise.resolve(),
    ]);
  }

  return result.transfer;
}

function sameUtcDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

async function releaseReservedLimits(transferId: string) {
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.findUnique({ where: { id: transferId } });
    if (!transfer?.limitReservedAt) return;
    const limits = await tx.userLimit.findUnique({
      where: { userId: transfer.senderUserId },
    });
    if (limits && sameUtcDay(transfer.limitReservedAt, limits.lastResetAt)) {
      await tx.userLimit.update({
        where: { userId: transfer.senderUserId },
        data: {
          dailyTxCount: Math.max(0, limits.dailyTxCount - 1),
          dailySentMicro:
            limits.dailySentMicro >= transfer.amountMicro
              ? limits.dailySentMicro - transfer.amountMicro
              : 0n,
        },
      });
    }
    await tx.transfer.update({
      where: { id: transferId },
      data: { limitReservedAt: null },
    });
  });
}

async function markCircleTransferFailed(transferId: string, reason: string) {
  const updated = await prisma.transfer.updateMany({
    where: {
      id: transferId,
      state: { notIn: ["SETTLED", "INCLUDED", "FAILED"] },
    },
    data: { state: "FAILED", failureReason: reason },
  });
  if (updated.count > 0) {
    await releaseReservedLimits(transferId);
    const transfer = await prisma.transfer.findUnique({
      where: { id: transferId },
      include: { approval: true },
    });
    if (transfer?.approval) {
      await createUserNotification({
        userId: transfer.senderUserId,
        transferId,
        approvalId: transfer.approval.id,
        type: "TRANSFER_FAILED",
        title: "Payment failed",
        body: `The ${formatMicroToUsdc(transfer.amountMicro)} ${transfer.asset} payment failed after approval.`,
      });
    }
  }
}

/** Refresh a submitted Circle transfer without resubmitting or double-counting it. */
export async function refreshCircleRemittance(transferId: string) {
  const transfer = await prisma.transfer.findUniqueOrThrow({
    where: { id: transferId },
  });
  if (
    !transfer.circleTxId ||
    transfer.state === "SETTLED" ||
    transfer.state === "INCLUDED" ||
    transfer.state === "FAILED"
  ) {
    return transfer;
  }

  try {
    const status = await getCircleTransactionStatus(transfer.circleTxId);
    if (status.state === "COMPLETE" && status.txHash) {
      return markSettledAndBumpLimits({
        transferId: transfer.id,
        senderUserId: transfer.senderUserId,
        amountMicro: transfer.amountMicro,
        txHash: status.txHash,
        circleTxId: transfer.circleTxId,
      });
    }
    if (["FAILED", "DENIED", "CANCELLED"].includes(status.state)) {
      const reason = [status.errorReason, status.errorDetails].filter(Boolean).join(": ");
      await markCircleTransferFailed(
        transfer.id,
        `Circle transaction ${status.state}${reason ? `: ${reason}` : ""}`,
      );
    } else if (status.state === "STUCK") {
      await prisma.transfer.update({
        where: { id: transfer.id },
        data: {
          state: "SUBMITTED",
          failureReason: "Circle transaction is still pending and may require acceleration.",
        },
      });
    }
  } catch (error) {
    log.rpc("Circle reconciliation check failed; transfer remains submitted", {
      transferId,
      message: error instanceof Error ? error.message : "CIRCLE_STATUS_FAILED",
    });
  }
  return prisma.transfer.findUniqueOrThrow({ where: { id: transferId } });
}

function scheduleCircleReconciliation(params: {
  transferId: string;
  senderUserId: string;
  amountMicro: bigint;
  circleTxId: string;
}) {
  if (circleReconciliationJobs.has(params.transferId)) return;
  const job = (async () => {
    try {
      const final = await waitForCircleTransaction(params.circleTxId);
      await markSettledAndBumpLimits({
        transferId: params.transferId,
        senderUserId: params.senderUserId,
        amountMicro: params.amountMicro,
        txHash: final.txHash,
        circleTxId: params.circleTxId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "CIRCLE_RECONCILIATION_FAILED";
      if (/timed out/i.test(message)) {
        log.rpc("Circle reconciliation timed out; transfer remains submitted", {
          transferId: params.transferId,
          circleTxId: params.circleTxId,
        });
        return;
      }
      await markCircleTransferFailed(params.transferId, message);
    }
  })().finally(() => {
    circleReconciliationJobs.delete(params.transferId);
  });
  circleReconciliationJobs.set(params.transferId, job);
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
  if (["PENDING_APPROVAL", "REJECTED", "EXPIRED"].includes(transfer.state)) {
    throw new Error(`TRANSFER_NOT_EXECUTABLE:${transfer.state}`);
  }

  const destinationAddress =
    transfer.destinationAddress ?? transfer.recipientWallet?.scaAddress;
  if (!destinationAddress) throw new Error("RECIPIENT_ADDRESS_MISSING");

  try {
    // Circle developer-controlled SCA path
    if (
      transfer.senderWallet?.vendor === "circle_modular" &&
      transfer.senderWallet.vendorWalletId
    ) {
      if (transfer.circleTxId) {
        scheduleCircleReconciliation({
          transferId,
          senderUserId: transfer.senderUserId,
          amountMicro: transfer.amountMicro,
          circleTxId: transfer.circleTxId,
        });
        return refreshCircleRemittance(transferId);
      }

      const result = await sendCircleTokenTransfer({
        vendorWalletId: transfer.senderWallet.vendorWalletId,
        recipientAddress: destinationAddress,
        amountMicro: transfer.amountMicro,
        asset: transfer.asset === "EURC" ? "EURC" : "USDC",
        // Stable key so accidental double-execute of same transfer does not double-spend
        idempotencyKey: transfer.idempotencyKey,
      });

      const submitted = await prisma.transfer.update({
        where: { id: transferId },
        data: {
          state: "SUBMITTED",
          circleTxId: result.circleTxId,
          failureReason: null,
        },
      });
      void prisma.auditLog
        .create({
          data: {
            actorId: transfer.senderUserId,
            action: "TRANSFER_SUBMITTED",
            metadata: JSON.stringify({
              transferId,
              circleTxId: result.circleTxId,
              amount: formatMicroToUsdc(transfer.amountMicro),
            }),
          },
        })
        .catch((error) => {
          log.remit("Could not write transfer submission audit", {
            transferId,
            message: error instanceof Error ? error.message : "AUDIT_WRITE_FAILED",
          });
        });
      scheduleCircleReconciliation({
        transferId,
        senderUserId: transfer.senderUserId,
        amountMicro: transfer.amountMicro,
        circleTxId: result.circleTxId,
      });
      return submitted;
    }

    // Legacy Safe + encrypted owner key + UserOp path
    const ownerKey = await getOwnerKeyForWallet(transfer.senderWalletId);
    const { account } = await createSmartAccountFromOwnerKey(ownerKey, client);

    const { userOpHash, transactionHash } = await sendTokenTransferUserOp({
      account,
      client,
      recipient: destinationAddress as Address,
      amountMicro: transfer.amountMicro,
      tokenAddress: (transfer.asset === "EURC" ? EURC_ADDRESS : USDC_ADDRESS) as Address,
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
    const current = await prisma.transfer.findUnique({ where: { id: transferId } });
    if (!current?.circleTxId) {
      await prisma.transfer.update({
        where: { id: transferId },
        data: { state: "FAILED", failureReason: message },
      });
      await releaseReservedLimits(transferId);
      const approval = await prisma.transferApproval.findUnique({
        where: { transferId },
      });
      if (approval) {
        await createUserNotification({
          userId: transfer.senderUserId,
          transferId,
          approvalId: approval.id,
          type: "TRANSFER_FAILED",
          title: "Payment failed",
          body: `The ${formatMicroToUsdc(transfer.amountMicro)} ${transfer.asset} payment failed after approval.`,
        });
      }
    }
    throw err;
  }
}
