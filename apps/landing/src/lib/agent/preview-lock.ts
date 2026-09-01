import type { TransactionPreview } from "./types";
import { hashPreview } from "./security";

export async function buildLockedPreview(
  partial: Omit<TransactionPreview, "id" | "previewHash" | "createdAt">,
): Promise<TransactionPreview> {
  const createdAt = Date.now();
  const id = `prev_${createdAt}_${Math.random().toString(36).slice(2, 9)}`;
  const batchCanonical = partial.batch
    ? JSON.stringify(
        partial.batch.map(
          (r) =>
            `${r.name}:${r.amount}:${r.identityType}:${r.destinationChain ?? ""}:${r.destinationChainLabel ?? ""}`,
        ),
      )
    : "";
  const previewHash = await hashPreview({
    action: partial.action,
    recipient: partial.recipient,
    amount: partial.amount,
    asset: partial.asset,
    receiveAsset: partial.receiveAsset ?? "",
    receiveAmount: partial.receiveAmount ?? "",
    swapRoute: partial.swapRoute ?? "",
    sponsorship: partial.sponsorship,
    transactionFee: partial.transactionFee ?? "",
    sourceChain: partial.sourceChain ?? "",
    destinationChain: partial.destinationChain ?? "",
    destinationChainLabel: partial.destinationChainLabel ?? "",
    bridgeOperationId: partial.bridgeOperationId ?? "",
    estimatedBridgeFee: partial.estimatedBridgeFee ?? "",
    batch: batchCanonical,
    totalAmount: partial.totalAmount ?? "",
    allocation: partial.allocation ?? "",
    steps: JSON.stringify(partial.steps),
    quotedAt: partial.quotedAt ?? "",
  });
  return { ...partial, id, previewHash, createdAt };
}

export async function verifyPreviewIntegrity(
  preview: TransactionPreview,
): Promise<boolean> {
  const batchCanonical = preview.batch
    ? JSON.stringify(
        preview.batch.map(
          (r) =>
            `${r.name}:${r.amount}:${r.identityType}:${r.destinationChain ?? ""}:${r.destinationChainLabel ?? ""}`,
        ),
      )
    : "";
  const current = await hashPreview({
    action: preview.action,
    recipient: preview.recipient,
    amount: preview.amount,
    asset: preview.asset,
    receiveAsset: preview.receiveAsset ?? "",
    receiveAmount: preview.receiveAmount ?? "",
    swapRoute: preview.swapRoute ?? "",
    sponsorship: preview.sponsorship,
    transactionFee: preview.transactionFee ?? "",
    sourceChain: preview.sourceChain ?? "",
    destinationChain: preview.destinationChain ?? "",
    destinationChainLabel: preview.destinationChainLabel ?? "",
    bridgeOperationId: preview.bridgeOperationId ?? "",
    estimatedBridgeFee: preview.estimatedBridgeFee ?? "",
    batch: batchCanonical,
    totalAmount: preview.totalAmount ?? "",
    allocation: preview.allocation ?? "",
    steps: JSON.stringify(preview.steps),
    quotedAt: preview.quotedAt ?? "",
  });
  return current === preview.previewHash;
}
