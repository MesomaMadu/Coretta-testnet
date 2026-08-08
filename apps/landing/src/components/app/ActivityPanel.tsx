"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Activity, CheckCircle2, Clock, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch, getApiToken } from "@/lib/api";
import {
  subscribeTransactions,
  upsertTransaction,
  type TransactionRecord,
} from "@/lib/transaction-store";
import { mapTransferStateToLifecycle } from "@/lib/tx-errors";

interface ActivityItem {
  id: string;
  label: string;
  status: "pending" | "complete" | "failed";
  time: string;
  asset?: string;
  amount?: string;
  recipient?: string;
  txHash?: string;
  failureReason?: string;
}

function formatTime(ts?: number) {
  if (!ts) return "Just now";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

function txToItem(tx: TransactionRecord): ActivityItem {
  const action =
    tx.status === "failed"
      ? `Failed: ${tx.amount} ${tx.asset}`
      : tx.status === "settled"
        ? `Send ${tx.amount} ${tx.asset}`
        : `Pending: ${tx.amount} ${tx.asset}`;
  return {
    id: tx.id,
    label: action,
    status:
      tx.status === "settled"
        ? "complete"
        : tx.status === "failed"
          ? "failed"
          : "pending",
    time: formatTime(tx.timestamp),
    asset: tx.asset,
    amount: tx.amount,
    recipient: tx.recipient,
    txHash: tx.txHash,
    failureReason: tx.failureReason,
  };
}

interface Props {
  onClose: () => void;
  variant?: "sidebar" | "main";
}

export default function ActivityPanel({ onClose, variant = "sidebar" }: Props) {
  const isMain = variant === "main";
  const { isConnected } = useAccount();
  const [items, setItems] = useState<ActivityItem[]>([]);

  // Hide all activity when wallet is disconnected (including prior failed txs).
  useEffect(() => {
    if (!isConnected) {
      setItems([]);
      return;
    }
    return subscribeTransactions((records) => {
      setItems(records.map(txToItem));
    });
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) return;
    const token = getApiToken();
    if (!token) return;

    const loadTransfers = async () => {
      try {
        const transfers = await apiFetch<
          Array<{
            id: string;
            direction: string;
            amountUsdc: string;
            state: string;
            createdAt: string;
            txHash?: string;
            explorerUrl?: string;
            counterpartyAddress?: string;
          }>
        >("/v1/transfers");

        for (const t of transfers) {
          const lifecycle = mapTransferStateToLifecycle(t.state);
          upsertTransaction({
            id: t.id,
            status: lifecycle,
            asset: "USDC",
            amount: t.amountUsdc,
            recipient:
              t.direction === "out"
                ? `${t.counterpartyAddress?.slice(0, 8) ?? ""}…`
                : "Inbound",
            txHash: t.txHash,
            network: "Arc Testnet",
            timestamp: new Date(t.createdAt).getTime(),
            explorerUrl: t.explorerUrl,
          });
        }
      } catch {
        /* keep local events */
      }
    };

    void loadTransfers();
    const interval = window.setInterval(() => void loadTransfers(), 8000);
    return () => window.clearInterval(interval);
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) return;
    const onActivity = (e: CustomEvent<ActivityItem>) => {
      setItems((prev) => {
        const existing = prev.find((p) => p.id === e.detail.id);
        if (existing) {
          return prev.map((p) => (p.id === e.detail.id ? { ...p, ...e.detail } : p));
        }
        return [e.detail, ...prev].slice(0, 50);
      });
    };
    window.addEventListener("Coretta-activity", onActivity as EventListener);
    return () =>
      window.removeEventListener("Coretta-activity", onActivity as EventListener);
  }, [isConnected]);

  return (
    <aside
      id="activity"
      className={cn(
        "flex h-full flex-col bg-[#F5F5F5] p-4",
        isMain
          ? "w-full flex-1"
          : "fixed right-0 top-0 z-30 w-72 shrink-0 border-l border-black/10 bg-white shadow-2xl md:relative md:z-auto md:shadow-none",
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-black">
          <Activity className="h-4 w-4 text-black" />
          Activity
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-black/40 hover:bg-black/5 hover:text-black"
          aria-label="Close activity panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {items.length === 0 && (
          <li className="rounded-2xl border border-black/10 bg-white px-3 py-6 text-center text-xs text-black/45">
            {isConnected
              ? "No transactions yet. Confirm a transfer in Damian to see activity here."
              : "Connect your wallet to see activity."}
          </li>
        )}
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2 rounded-2xl border border-black/10 bg-white px-3 py-2.5"
          >
            {item.status === "complete" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-black" />
            ) : item.status === "failed" ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
            ) : (
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-black/55" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-black">
                {item.status === "complete"
                  ? "Transaction successful"
                  : item.status === "failed"
                    ? "Transaction failure"
                    : item.label}
              </p>
              {item.recipient && (
                <p className="text-[10px] text-black/50">To: {item.recipient}</p>
              )}
              {item.txHash && (
                <p className="break-all font-mono text-[10px] text-black/40">
                  Hash: {item.txHash.slice(0, 10)}…
                </p>
              )}
              {item.failureReason && (
                <p className="text-[10px] text-rose-600/90">{item.failureReason}</p>
              )}
              <p className="text-[10px] text-black/40">{item.time}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[10px] text-black/40">
        Outcomes show as transaction successful or transaction failure.
      </p>
    </aside>
  );
}

export function emitActivity(
  label: string,
  status: ActivityItem["status"] = "complete",
  extra?: Partial<ActivityItem>,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("Coretta-activity", {
      detail: {
        id: extra?.txHash ? `act_${extra.txHash}` : `act_${Date.now()}`,
        label,
        status,
        time: "Just now",
        ...extra,
      },
    }),
  );
}
