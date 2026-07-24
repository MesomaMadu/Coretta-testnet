"use client";

import { useEffect, useState } from "react";
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
  const [items, setItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    return subscribeTransactions((records) => {
      setItems(records.map(txToItem));
    });
  }, []);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
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
  }, []);

  return (
    <aside
      id="activity"
      className={cn(
        "flex h-full flex-col bg-[var(--ar-surface)] p-4 backdrop-blur-xl",
        isMain
          ? "damian-chat-bg w-full flex-1"
          : "w-72 shrink-0 border-l border-[var(--ar-border)] fixed right-0 top-0 z-30 shadow-2xl md:relative md:z-auto md:shadow-none",
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ar-fg)]">
          <Activity className="h-4 w-4 text-[#8F5CFF]" />
          Activity
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-[var(--ar-fg-subtle)] hover:bg-[var(--ar-input-bg)] hover:text-[var(--ar-fg)]"
          aria-label="Close activity panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {items.length === 0 && (
          <li className="rounded-xl border border-[var(--ar-border)] bg-[var(--ar-input-bg)] px-3 py-6 text-center text-xs text-[var(--ar-fg-subtle)]">
            No transactions yet. Confirm a transfer in Damian to see activity here.
          </li>
        )}
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2 rounded-xl border border-[var(--ar-border)] bg-[var(--ar-input-bg)] px-3 py-2.5"
          >
            {item.status === "complete" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8F5CFF]" />
            ) : item.status === "failed" ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            ) : (
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#8F5CFF]/70" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[var(--ar-fg)]">{item.label}</p>
              {item.recipient && (
                <p className="text-[10px] text-[var(--ar-fg-muted)]">To: {item.recipient}</p>
              )}
              {item.txHash && (
                <p className="font-mono text-[10px] text-[var(--ar-fg-subtle)] break-all">
                  Hash: {item.txHash.slice(0, 10)}…
                </p>
              )}
              {item.failureReason && (
                <p className="text-[10px] text-rose-300/80">{item.failureReason}</p>
              )}
              <p className="text-[10px] text-[var(--ar-fg-subtle)]">{item.time}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[10px] text-[var(--ar-fg-subtle)]">
        Status updates automatically as transactions progress.
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
