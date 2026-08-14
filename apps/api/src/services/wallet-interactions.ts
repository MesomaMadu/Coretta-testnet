import { prisma } from "@coretta/db";
import { normalizeWalletAddress } from "@coretta/shared";

export type InteractionKind =
  | "session"
  | "chat"
  | "preview"
  | "transfer"
  | "swap"
  | "navigation"
  | "signature"
  | "other";

export type InteractionStatus = "pending" | "complete" | "failed";

export async function recordWalletInteraction(params: {
  userId: string;
  walletAddress: string;
  kind: InteractionKind;
  label: string;
  status?: InteractionStatus;
  metadata?: Record<string, unknown>;
}) {
  const walletAddress = normalizeWalletAddress(params.walletAddress);
  const row = await prisma.walletInteraction.create({
    data: {
      userId: params.userId,
      walletAddress,
      kind: params.kind,
      label: params.label.slice(0, 500),
      status: params.status ?? "complete",
      metadataJson: params.metadata
        ? JSON.stringify(params.metadata).slice(0, 4000)
        : null,
    },
  });
  return row;
}

export async function listWalletInteractions(params: {
  userId: string;
  walletAddress?: string | null;
  limit?: number;
}) {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const walletAddress = params.walletAddress
    ? normalizeWalletAddress(params.walletAddress)
    : null;

  const rows = await prisma.walletInteraction.findMany({
    where: {
      userId: params.userId,
      ...(walletAddress ? { walletAddress } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    walletAddress: r.walletAddress,
    kind: r.kind,
    label: r.label,
    status: r.status as InteractionStatus,
    metadata: r.metadataJson
      ? (JSON.parse(r.metadataJson) as Record<string, unknown>)
      : null,
    createdAt: r.createdAt.toISOString(),
  }));
}
