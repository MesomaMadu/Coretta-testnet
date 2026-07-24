"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, ExternalLink } from "lucide-react";
import type { TransactionRecord } from "@/lib/transaction-store";
import { cn } from "@/lib/utils";

interface Props {
  record: TransactionRecord;
}

export default function TransactionStatusCard({ record }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const statusLabel =
    record.status === "pending"
      ? "⏳ Pending"
      : record.status === "settled"
        ? "✅ Settled"
        : "❌ Failed";

  const title =
    record.status === "pending"
      ? "Transaction Submitted"
      : record.status === "settled"
        ? "Transaction Confirmed"
        : "Transaction Failed";

  const message =
    record.status === "pending"
      ? "Your transaction has been submitted and is awaiting confirmation."
      : record.status === "settled"
        ? "Your transaction has been successfully settled."
        : record.failureReason ?? "An unknown execution error occurred.";

  const copyHash = async () => {
    if (!record.txHash) return;
    await navigator.clipboard.writeText(record.txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 text-sm",
        record.status === "pending" && "border-[#8F5CFF]/40 bg-[#8F5CFF]/10",
        record.status === "settled" && "border-[#7C4DFF]/40 bg-[#7C4DFF]/10",
        record.status === "failed" && "border-rose-500/30 bg-rose-500/10",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-semibold text-white">{title}</p>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg p-1 text-white/50 hover:bg-white/10"
          aria-label={expanded ? "Collapse details" : "Expand details"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <p className="text-xs text-white/60">Status: {statusLabel}</p>
      <p className="mt-1 text-xs text-white/70">
        {record.amount} {record.asset} → {record.recipient}
      </p>

      {record.txHash && (
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-[10px] text-white/50 break-all">
            {record.txHash.slice(0, 10)}…{record.txHash.slice(-8)}
          </span>
          <button
            type="button"
            onClick={copyHash}
            className="shrink-0 rounded p-1 text-white/40 hover:text-white"
            aria-label="Copy transaction hash"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          {copied && <span className="text-[10px] text-[#8F5CFF]">Copied!</span>}
          {record.explorerUrl && (
            <a
              href={record.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-white/40 hover:text-white"
              aria-label="View on explorer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      <p className="mt-2 text-xs text-white/45">{message}</p>

      {expanded && (
        <dl className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs">
          <Row label="Network" value={record.network} />
          <Row
            label="Timestamp"
            value={new Date(record.timestamp).toLocaleString()}
          />
          {record.txHash && <Row label="Hash" value={record.txHash} mono />}
        </dl>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-white/40">{label}</dt>
      <dd className={cn("text-right text-white/80", mono && "font-mono text-[10px] break-all")}>
        {value}
      </dd>
    </div>
  );
}
