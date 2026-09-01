"use client";

import { Check, Copy, ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TransactionRecord } from "@/lib/transaction-store";

interface Props {
  record: TransactionRecord | null;
  onClose: () => void;
}

export default function TransactionReceiptModal({ record, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!record) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose, record]);
  if (!record) return null;

  const copyHash = async () => {
    if (!record.txHash) return;
    await navigator.clipboard.writeText(record.txHash);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-receipt-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
              Arc Testnet receipt
            </p>
            <h2 id="transaction-receipt-title" className="mt-1 text-lg font-semibold text-black">
              {record.status === "settled" ? "Transaction settled" : "Transaction details"}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-black/45 hover:bg-black/5 hover:text-black"
            aria-label="Close receipt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <ReceiptRow label="Status" value={record.status} />
          <ReceiptRow label="Amount" value={`${record.amount} ${record.asset}`} />
          {record.outputAmount && record.outputAsset && (
            <ReceiptRow label="Estimated output" value={`${record.outputAmount} ${record.outputAsset}`} />
          )}
          <ReceiptRow label="Recipient" value={record.recipient} />
          <ReceiptRow label="Network" value={record.network} />
          <ReceiptRow label="Created" value={new Date(record.timestamp).toLocaleString()} />
          {record.transferId && <ReceiptRow label="Transfer ID" value={record.transferId} mono />}
          {record.approvalId && <ReceiptRow label="Approval ID" value={record.approvalId} mono />}
        </dl>

        {record.txHash && (
          <div className="mt-5 rounded-xl border border-black/10 bg-[#F7F7F7] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">Transaction hash</p>
            <p className="mt-1 break-all font-mono text-xs text-black/70">{record.txHash}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={copyHash}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-black hover:border-black/25"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy hash"}
              </button>
              {record.explorerUrl && (
                <a
                  href={record.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-black px-3 py-1.5 text-xs text-white hover:bg-black/80"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Arc explorer
                </a>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ReceiptRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-black/5 pb-3 last:border-0">
      <dt className="text-black/45">{label}</dt>
      <dd className={`${mono ? "break-all font-mono text-[11px]" : "break-words"} text-right text-black`}>
        {value}
      </dd>
    </div>
  );
}
