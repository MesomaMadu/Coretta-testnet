"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getApiToken } from "@/lib/api";
import {
  subscribeTransactions,
  type TransactionRecord,
} from "@/lib/transaction-store";
import { useWalletSession } from "@/hooks/useWalletSession";

const ARC_EXPLORER = "https://testnet.arcscan.app";

interface ActivityItem {
  id: string;
  label: string;
  status: "pending" | "complete" | "failed";
  time: string;
  timestamp?: number;
  asset?: string;
  amount?: string;
  recipient?: string;
  txHash?: string;
  failureReason?: string;
  network?: string;
  explorerUrl?: string;
  state?: string;
}

function formatRelativeTime(ts?: number) {
  if (!ts) return "Just now";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function formatAbsoluteTime(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Chatbot remits/swaps only — sourced from AIAgentPanel via transaction-store. */
function txToItem(tx: TransactionRecord): ActivityItem {
  const isSwap =
    /^your wallet$/i.test(tx.recipient.trim()) ||
    tx.id.startsWith("swap_");
  const verb = isSwap ? "Swap" : "Send";
  const action =
    tx.status === "failed"
      ? `Failed ${verb}: ${tx.amount} ${tx.asset}`
      : tx.status === "settled"
        ? `${verb} ${tx.amount} ${tx.asset}`
        : `Pending ${verb}: ${tx.amount} ${tx.asset}`;
  return {
    id: tx.id,
    label: action,
    status:
      tx.status === "settled"
        ? "complete"
        : tx.status === "failed"
          ? "failed"
          : "pending",
    time: formatRelativeTime(tx.timestamp),
    timestamp: tx.timestamp,
    asset: tx.asset,
    amount: tx.amount,
    recipient: tx.recipient,
    txHash: tx.txHash,
    failureReason: tx.failureReason,
    network: tx.network,
    explorerUrl: tx.explorerUrl,
    state: tx.status,
  };
}

function DetailRow({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  href?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 border-t border-black/5 pt-1.5 first:border-0 first:pt-0">
      <span className="text-[9px] font-medium uppercase tracking-wide text-black/40">
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center gap-1 break-all text-[10px] text-black underline-offset-2 hover:underline",
            mono && "font-mono",
          )}
        >
          {value}
          <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
        </a>
      ) : (
        <span
          className={cn(
            "break-all text-[10px] text-black/80",
            mono && "font-mono",
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}

interface Props {
  onClose: () => void;
  variant?: "sidebar" | "main";
}

/**
 * Activity = chatbot remits/swaps only (transaction-store from AIAgentPanel).
 * No session/chat/navigation interactions and no separate history merge.
 */
export default function ActivityPanel({ onClose, variant = "sidebar" }: Props) {
  const isMain = variant === "main";
  const { address, isConnected } = useAccount();
  const { verified } = useWalletSession();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const canShowHistory = Boolean(
    isConnected && verified && address && getApiToken(),
  );

  useEffect(() => {
    if (!canShowHistory) {
      setItems([]);
      setExpandedId(null);
      return;
    }
    // Chatbot txs only — success or failure (no pending rows).
    return subscribeTransactions((records) => {
      setItems(
        records
          .filter((r) => r.status === "settled" || r.status === "failed")
          .map(txToItem)
          .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
          .slice(0, 50),
      );
    });
  }, [canShowHistory]);

  return (
    <aside
      id="activity"
      className={cn(
        "flex h-full flex-col bg-[#F5F5F5] p-4",
        isMain
          ? "w-full flex-1"
          : "fixed right-0 top-0 z-30 w-80 shrink-0 border-l border-black/10 bg-white shadow-2xl md:relative md:z-auto md:shadow-none",
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
            {!isConnected
              ? "Connect your wallet to see activity."
              : !verified
                ? "Verify wallet ownership to load chatbot transactions."
                : "No chatbot transactions yet. Confirm a send or swap with Damian."}
          </li>
        )}
        {items.map((item) => {
          const open = expandedId === item.id;
          const explorer =
            item.explorerUrl ??
            (item.txHash ? `${ARC_EXPLORER}/tx/${item.txHash}` : undefined);
          return (
            <li
              key={item.id}
              className="rounded-2xl border border-black/10 bg-white px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                {item.status === "complete" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-black" />
                ) : item.status === "failed" ? (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                ) : (
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-black/55" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-black">{item.label}</p>
                  {item.amount && item.asset && (
                    <p className="text-[10px] text-black/55">
                      {item.amount} {item.asset}
                      {item.recipient
                        ? ` → ${item.recipient.slice(0, 12)}${item.recipient.length > 12 ? "…" : ""}`
                        : ""}
                    </p>
                  )}
                  <p className="mt-0.5 text-[10px] text-black/40">
                    {item.time}
                    {item.timestamp
                      ? ` · ${formatAbsoluteTime(item.timestamp)}`
                      : ""}
                  </p>
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : item.id)}
                    className="mt-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-black underline-offset-2 hover:underline"
                  >
                    {open ? (
                      <>
                        Hide details <ChevronUp className="h-3 w-3" />
                      </>
                    ) : (
                      <>
                        View details <ChevronDown className="h-3 w-3" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {open && (
                <div className="mt-2 space-y-1.5 rounded-xl bg-[#F5F5F5] px-2.5 py-2">
                  <DetailRow label="Status" value={item.status} />
                  <DetailRow label="Label" value={item.label} />
                  <DetailRow label="State" value={item.state} />
                  <DetailRow
                    label="Amount"
                    value={
                      item.amount && item.asset
                        ? `${item.amount} ${item.asset}`
                        : item.amount
                    }
                  />
                  <DetailRow label="Recipient" value={item.recipient} mono />
                  <DetailRow
                    label="Network"
                    value={item.network ?? "Arc Testnet"}
                  />
                  <DetailRow
                    label="Timestamp"
                    value={formatAbsoluteTime(item.timestamp)}
                  />
                  <DetailRow
                    label="Relative"
                    value={formatRelativeTime(item.timestamp)}
                  />
                  <DetailRow
                    label="Transaction hash"
                    value={item.txHash}
                    mono
                    href={explorer}
                  />
                  <DetailRow
                    label="Explorer"
                    value={explorer ? "Open on Arcscan" : undefined}
                    href={explorer}
                  />
                  <DetailRow label="Failure reason" value={item.failureReason} />
                  <DetailRow label="Activity ID" value={item.id} mono />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[10px] text-black/40">
        Chatbot remits and swaps only (completed or failed). Expand a row for
        full details.
      </p>
    </aside>
  );
}
