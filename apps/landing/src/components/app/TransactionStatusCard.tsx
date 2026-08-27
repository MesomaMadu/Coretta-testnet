"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  ExternalLink,
  XCircle,
} from "lucide-react";
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
      ? "Pending"
      : record.status === "settled"
        ? "Success"
        : "Failure";

  const title =
    record.status === "pending"
      ? "Transaction Submitted"
      : record.status === "settled"
        ? "Transaction successful"
        : "Transaction failure";

  const message =
    record.status === "pending"
      ? "Your transaction has been submitted and is awaiting confirmation."
      : record.status === "settled"
        ? "Your transaction has been successfully settled."
        : record.failureReason ?? "An unknown execution error occurred.";

  const StatusIcon =
    record.status === "pending"
      ? Clock3
      : record.status === "settled"
        ? CheckCircle2
        : XCircle;

  const copyHash = async () => {
    if (!record.txHash) return;
    await navigator.clipboard.writeText(record.txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-4 text-sm shadow-sm",
        record.status === "pending" && "border-black/20",
        record.status === "settled" && "border-black/30",
        record.status === "failed" && "border-rose-500/35",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusIcon
            className={cn(
              "h-4 w-4 shrink-0",
              record.status === "failed" ? "text-rose-600" : "text-[#7C3AED]",
            )}
            aria-hidden="true"
          />
          <p className="font-semibold text-black">{title}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg p-1 text-black/40 hover:bg-black/5"
          aria-label={expanded ? "Collapse details" : "Expand details"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <p className="text-xs text-black/55">Status: {statusLabel}</p>
      <p className="mt-1 text-xs text-black/70">
        {record.amount} {record.asset} → {record.recipient}
      </p>

      {record.txHash && (
        <div className="mt-2 flex items-center gap-2">
          <span className="break-all font-mono text-[10px] text-black/45">
            {record.txHash.slice(0, 10)}…{record.txHash.slice(-8)}
          </span>
          <button
            type="button"
            onClick={copyHash}
            className="shrink-0 rounded p-1 text-black/35 hover:text-black"
            aria-label="Copy transaction hash"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          {copied && <span className="text-[10px] text-black">Copied!</span>}
          {record.explorerUrl && (
            <a
              href={record.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-black/35 hover:text-black"
              aria-label="View on explorer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      <p className="mt-2 text-xs text-black/50">{message}</p>

      {expanded && (
        <dl className="mt-3 space-y-1 border-t border-black/10 pt-3 text-xs">
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
      <dt className="text-black/40">{label}</dt>
      <dd className={cn("text-right text-black/80", mono && "break-all font-mono text-[10px]")}>
        {value}
      </dd>
    </div>
  );
}
