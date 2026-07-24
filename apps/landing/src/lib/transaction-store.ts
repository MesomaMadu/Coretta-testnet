export type TxLifecycleStatus = "pending" | "settled" | "failed";

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
