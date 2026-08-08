import { prisma } from "@coretta/db";

export type AuditAction =
  | "SMART_WALLET_ACTIVATED"
  | "WALLET_BOUND"
  | "WALLET_REPLACED"
  | "RECOVERY_INITIATED"
  | "RECOVERY_COMPLETED"
  | "TRANSACTION_PREPARED"
  | "TRANSACTION_SUBMITTED"
  | "WALLET_PROVISIONED"
  | "TRANSFER_SETTLED";

export async function createAuditEvent(params: {
  actorId?: string | null;
  action: AuditAction | string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      action: params.action,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}
