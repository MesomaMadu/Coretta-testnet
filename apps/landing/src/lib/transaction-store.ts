export type TxLifecycleStatus = "pending" | "settled" | "partial" | "failed";

export interface TransactionRecord {
  id: string;
  status: TxLifecycleStatus;
  asset: string;
  amount: string;
  recipient: string;
  txHash?: string;
  network: string;
  timestamp: number;
  failureReason?: string;
  explorerUrl?: string;
  transferId?: string;
  approvalId?: string;
  operationKind?:
    | "send"
    | "swap"
    | "swap_and_send"
    | "swap_and_bridge"
    | "batch"
    | "bridge";
  outputAmount?: string;
  outputAsset?: string;
  pendingReason?: string;
}

export interface ApprovalTransferSnapshot {
  id: string;
  transferId: string;
  direction: "incoming" | "outgoing";
  status: string;
  transferState: string;
  txHash?: string;
  explorerUrl?: string;
  failureReason?: string;
}

function approvalFailureReason(approval: ApprovalTransferSnapshot): string {
  if (approval.failureReason) return approval.failureReason;
  if (approval.transferState === "REJECTED" || approval.status === "REJECTED") {
    return "The recipient rejected this payment request.";
  }
  if (approval.transferState === "EXPIRED" || approval.status === "EXPIRED") {
    return "The recipient approval window expired.";
  }
  if (approval.transferState === "POLICY_DENIED" || approval.status === "POLICY_DENIED") {
    return "This transfer was denied by policy limits.";
  }
  return "The approved payment could not be completed.";
}

export function reconcileTransactionApproval(
  record: TransactionRecord,
  approval: ApprovalTransferSnapshot,
): TransactionRecord {
  if (
    approval.direction !== "outgoing" ||
    (record.approvalId !== approval.id && record.transferId !== approval.transferId)
  ) {
    return record;
  }

  const settled = approval.transferState === "SETTLED" || approval.transferState === "INCLUDED";
  const failed = ["FAILED", "POLICY_DENIED", "REJECTED", "EXPIRED"].includes(
    approval.transferState,
  );
  const status: TxLifecycleStatus = settled ? "settled" : failed ? "failed" : "pending";
  const pendingReason =
    status !== "pending"
      ? undefined
      : approval.status === "ACCEPTED" || approval.transferState !== "PENDING_APPROVAL"
        ? "Recipient accepted. The payment is being submitted on Arc Testnet."
        : "Waiting for the recipient to approve this Coretta-to-Coretta payment.";
  const failureReason = status === "failed" ? approvalFailureReason(approval) : undefined;

  const next: TransactionRecord = {
    ...record,
    transferId: approval.transferId,
    approvalId: approval.id,
    status,
    txHash: approval.txHash ?? record.txHash,
    explorerUrl: approval.explorerUrl ?? record.explorerUrl,
    pendingReason,
    failureReason,
  };

  if (
    next.status === record.status &&
    next.txHash === record.txHash &&
    next.explorerUrl === record.explorerUrl &&
    next.pendingReason === record.pendingReason &&
    next.failureReason === record.failureReason &&
    next.transferId === record.transferId &&
    next.approvalId === record.approvalId
  ) {
    return record;
  }
  return next;
}

type Listener = (records: TransactionRecord[]) => void;

const records: TransactionRecord[] = [];
const listeners = new Set<Listener>();

function emit() {
  const snapshot = [...records];
  listeners.forEach((l) => l(snapshot));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("coretta-transactions", { detail: snapshot }));
  }
}

export function subscribeTransactions(listener: Listener) {
  listeners.add(listener);
  listener([...records]);
  return () => {
    listeners.delete(listener);
  };
}

export function upsertTransaction(record: TransactionRecord) {
  const idx = records.findIndex((r) => r.id === record.id);
  if (idx >= 0) records[idx] = { ...records[idx], ...record };
  else records.unshift(record);
  if (records.length > 50) records.pop();
  emit();
}

export function getTransactions() {
  return [...records];
}
