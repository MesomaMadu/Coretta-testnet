import { prisma } from "@coretta/db";
import { formatMicroToUsdc } from "@coretta/shared";
import { evaluateTransferPolicy, shouldResetDailyLimits } from "./policy.js";

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export function getApprovalDecisionError(
  status: string,
  expiresAt: Date,
  now = new Date(),
) {
  if (status !== "PENDING") return `APPROVAL_${status}`;
  if (expiresAt <= now) return "APPROVAL_EXPIRED";
  return null;
}

export async function createUserNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  transferId?: string;
  approvalId?: string;
}) {
  return prisma.userNotification.create({ data: params });
}

export async function queueRecipientApproval(transferId: string) {
  const transfer = await prisma.transfer.findUniqueOrThrow({
    where: { id: transferId },
    include: { approval: true },
  });
  if (!transfer.recipientUserId) return null;
  if (transfer.approval) return transfer.approval;
  if (transfer.state !== "POLICY_OK") {
    throw new Error(`APPROVAL_NOT_ALLOWED:${transfer.state}`);
  }

  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS);
  return prisma.$transaction(async (tx) => {
    const moved = await tx.transfer.updateMany({
      where: { id: transferId, state: "POLICY_OK" },
      data: { state: "PENDING_APPROVAL" },
    });
    if (moved.count !== 1) {
      const concurrent = await tx.transferApproval.findUnique({
        where: { transferId },
      });
      if (concurrent) return concurrent;
      throw new Error("APPROVAL_STATE_CHANGED");
    }
    const approval = await tx.transferApproval.create({
      data: {
        transferId,
        senderUserId: transfer.senderUserId,
        recipientUserId: transfer.recipientUserId!,
        expiresAt,
      },
    });
    await tx.userNotification.create({
      data: {
        userId: transfer.recipientUserId!,
        transferId,
        approvalId: approval.id,
        type: "TRANSFER_APPROVAL_REQUESTED",
        title: "Payment approval requested",
        body: `${formatMicroToUsdc(transfer.amountMicro)} ${transfer.asset} is waiting for your approval.`,
      },
    });
    return approval;
  });
}

export async function expirePendingApprovals(userId?: string) {
  const now = new Date();
  const expired = await prisma.transferApproval.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: now },
      ...(userId
        ? { OR: [{ senderUserId: userId }, { recipientUserId: userId }] }
        : {}),
    },
    select: { id: true, transferId: true, senderUserId: true },
  });
  if (!expired.length) return;
  await prisma.$transaction(async (tx) => {
    for (const item of expired) {
      const claimed = await tx.transferApproval.updateMany({
        where: { id: item.id, status: "PENDING" },
        data: { status: "EXPIRED", decidedAt: now },
      });
      if (claimed.count !== 1) continue;
      await tx.transfer.updateMany({
        where: { id: item.transferId, state: "PENDING_APPROVAL" },
        data: { state: "EXPIRED", failureReason: "Recipient approval expired." },
      });
      await tx.userNotification.create({
        data: {
          userId: item.senderUserId,
          transferId: item.transferId,
          approvalId: item.id,
          type: "TRANSFER_APPROVAL_EXPIRED",
          title: "Payment request expired",
          body: "The recipient did not approve this payment before it expired.",
        },
      });
    }
  });
}

export async function listApprovalsForUser(userId: string) {
  await expirePendingApprovals(userId);
  return prisma.transferApproval.findMany({
    where: { OR: [{ senderUserId: userId }, { recipientUserId: userId }] },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      transfer: { include: { senderWallet: true, recipientWallet: true } },
      sender: { include: { identities: true } },
      recipient: { include: { identities: true } },
    },
  });
}

export async function acceptApproval(params: { approvalId: string; recipientUserId: string }) {
  const owned = await prisma.transferApproval.findFirst({
    where: { id: params.approvalId, recipientUserId: params.recipientUserId },
    select: { senderUserId: true },
  });
  if (!owned) throw new Error("APPROVAL_NOT_FOUND");
  await prisma.userLimit.upsert({
    where: { userId: owned.senderUserId },
    update: {},
    create: { userId: owned.senderUserId },
  });
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const approval = await tx.transferApproval.findFirst({
      where: { id: params.approvalId, recipientUserId: params.recipientUserId },
      include: {
        transfer: {
          include: {
            sender: { include: { limits: true } },
            recipient: true,
          },
        },
      },
    });
    if (!approval) throw new Error("APPROVAL_NOT_FOUND");
    if (
      approval.status === "ACCEPTED" &&
      ["POLICY_OK", "SUBMITTED", "SETTLED", "INCLUDED"].includes(
        approval.transfer.state,
      )
    ) {
      return {
        expired: false as const,
        policyDenied: false as const,
        transfer: approval.transfer,
      };
    }
    const decisionError = getApprovalDecisionError(approval.status, approval.expiresAt, now);
    if (decisionError === "APPROVAL_EXPIRED") {
      await tx.transferApproval.update({
        where: { id: approval.id },
        data: { status: "EXPIRED", decidedAt: now },
      });
      await tx.transfer.updateMany({
        where: { id: approval.transferId, state: "PENDING_APPROVAL" },
        data: { state: "EXPIRED", failureReason: "Recipient approval expired." },
      });
      await tx.userNotification.create({
        data: {
          userId: approval.senderUserId,
          transferId: approval.transferId,
          approvalId: approval.id,
          type: "TRANSFER_APPROVAL_EXPIRED",
          title: "Payment request expired",
          body: "The recipient approval window expired before this payment was accepted.",
        },
      });
      return { expired: true as const, transfer: approval.transfer };
    }
    if (decisionError) throw new Error(decisionError);

    await tx.$queryRaw`SELECT "userId" FROM "UserLimit" WHERE "userId" = ${approval.transfer.senderUserId} FOR UPDATE`;
    let limits = await tx.userLimit.findUnique({
      where: { userId: approval.transfer.senderUserId },
    });
    if (limits && shouldResetDailyLimits(limits.lastResetAt)) {
      limits = await tx.userLimit.update({
        where: { userId: approval.transfer.senderUserId },
        data: { dailyTxCount: 0, dailySentMicro: 0n, lastResetAt: now },
      });
    }
    const policy = evaluateTransferPolicy({
      amount: formatMicroToUsdc(approval.transfer.amountMicro),
      senderKycTier: approval.transfer.sender.kycTier,
      senderStatus: approval.transfer.sender.status,
      limits,
      recipientStatus: approval.transfer.recipient?.status ?? "ACTIVE",
    });
    if (!policy.allowed) {
      await tx.transferApproval.update({
        where: { id: approval.id },
        data: { status: "POLICY_DENIED", decidedAt: now },
      });
      await tx.transfer.update({
        where: { id: approval.transferId },
        data: {
          state: "POLICY_DENIED",
          policyReason: policy.reason,
          riskScore: policy.riskScore,
        },
      });
      await tx.userNotification.create({
        data: {
          userId: approval.senderUserId,
          transferId: approval.transferId,
          approvalId: approval.id,
          type: "TRANSFER_POLICY_DENIED",
          title: "Payment could not be submitted",
          body: "Account or daily policy limits changed before the recipient accepted this payment.",
        },
      });
      return { expired: false as const, policyDenied: true as const, transfer: approval.transfer };
    }
    const amountMicro = policy.amountMicro!;
    if (limits) {
      await tx.userLimit.update({
        where: { userId: approval.transfer.senderUserId },
        data: {
          dailyTxCount: { increment: 1 },
          dailySentMicro: { increment: amountMicro },
        },
      });
    } else {
      await tx.userLimit.create({
        data: {
          userId: approval.transfer.senderUserId,
          dailyTxCount: 1,
          dailySentMicro: amountMicro,
        },
      });
    }
    const claimed = await tx.transferApproval.updateMany({
      where: { id: approval.id, status: "PENDING", expiresAt: { gt: now } },
      data: { status: "ACCEPTED", decidedAt: now },
    });
    if (claimed.count !== 1) throw new Error("APPROVAL_ALREADY_DECIDED");
    const transferMoved = await tx.transfer.updateMany({
      where: { id: approval.transferId, state: "PENDING_APPROVAL" },
      data: { state: "POLICY_OK", failureReason: null, limitReservedAt: now },
    });
    if (transferMoved.count !== 1) throw new Error("TRANSFER_STATE_CHANGED");
    await tx.userNotification.create({
      data: {
        userId: approval.senderUserId,
        transferId: approval.transferId,
        approvalId: approval.id,
        type: "TRANSFER_APPROVAL_ACCEPTED",
        title: "Payment approved",
        body: `${formatMicroToUsdc(approval.transfer.amountMicro)} ${approval.transfer.asset} was approved and is being submitted.`,
      },
    });
    return { expired: false as const, policyDenied: false as const, transfer: approval.transfer };
  });
  if (result.expired) throw new Error("APPROVAL_EXPIRED");
  if (result.policyDenied) throw new Error("TRANSFER_POLICY_CHANGED");
  return result.transfer;
}

export async function rejectApproval(params: { approvalId: string; recipientUserId: string }) {
  await expirePendingApprovals(params.recipientUserId);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const approval = await tx.transferApproval.findFirst({
      where: { id: params.approvalId, recipientUserId: params.recipientUserId },
      include: { transfer: true },
    });
    if (!approval) throw new Error("APPROVAL_NOT_FOUND");
    const decisionError = getApprovalDecisionError(approval.status, approval.expiresAt, now);
    if (decisionError) throw new Error(decisionError);
    const rejected = await tx.transferApproval.updateMany({
      where: { id: approval.id, status: "PENDING", expiresAt: { gt: now } },
      data: { status: "REJECTED", decidedAt: now },
    });
    if (rejected.count !== 1) throw new Error("APPROVAL_ALREADY_DECIDED");
    await tx.transfer.updateMany({
      where: { id: approval.transferId, state: "PENDING_APPROVAL" },
      data: { state: "REJECTED", failureReason: "Recipient rejected the payment." },
    });
    await tx.userNotification.create({
      data: {
        userId: approval.senderUserId,
        transferId: approval.transferId,
        approvalId: approval.id,
        type: "TRANSFER_APPROVAL_REJECTED",
        title: "Payment rejected",
        body: `The recipient rejected the ${formatMicroToUsdc(approval.transfer.amountMicro)} ${approval.transfer.asset} payment.`,
      },
    });
    return approval.transfer;
  });
}

export async function listNotifications(userId: string) {
  await expirePendingApprovals(userId);
  const [items, unreadCount] = await Promise.all([
    prisma.userNotification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.userNotification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unreadCount };
}

export async function markNotificationRead(params: { notificationId: string; userId: string }) {
  const result = await prisma.userNotification.updateMany({
    where: { id: params.notificationId, userId: params.userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count > 0;
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.userNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
