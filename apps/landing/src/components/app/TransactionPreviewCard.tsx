"use client";

import { Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TransactionPreview } from "@/lib/agent/types";
import type { AgentPhase } from "@/lib/agent/types";

interface Props {
  preview: TransactionPreview;
  phase: AgentPhase;
  onConfirm: () => void;
  onCancel: () => void;
  connected: boolean;
  ownershipVerified?: boolean;
  smartWalletActive?: boolean;
}

export default function TransactionPreviewCard({
  preview,
  phase,
  onConfirm,
  onCancel,
  connected,
  ownershipVerified = false,
  smartWalletActive = false,
}: Props) {
  const locked = phase === "preview" || phase === "awaiting_signature";

  return (
    <div
      className="rounded-2xl border border-black/15 bg-white p-4 shadow-sm"
      data-preview-hash={preview.previewHash}
      data-locked={locked ? "true" : "false"}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-black">
          <Shield className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Locked preview
          </span>
        </div>
        {phase === "preview" && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-1 text-black/40 hover:bg-black/5 hover:text-black"
            aria-label="Cancel preview"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {preview.riskWarning && (
        <p className="mb-3 rounded-lg border border-amber-400/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {preview.riskWarning}
        </p>
      )}

      <dl className="space-y-2 text-sm">
        <Row label="Action" value={preview.action} />
        {preview.batch && preview.batch.length > 1 ? (
          <>
            <Row
              label="Recipients"
              value={`${preview.recipientCount ?? preview.batch.length}`}
            />
            <Row label="Total" value={`${preview.totalAmount ?? preview.amount} ${preview.asset}`} />
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-black/10 bg-[#F5F5F5] p-2">
              {preview.batch.map((r) => (
                <div
                  key={`${r.name}-${r.amount}`}
                  className="flex justify-between gap-2 border-b border-black/5 pb-2 text-xs last:border-0 last:pb-0"
                >
                  <span className="text-black/70">
                    {r.name}{" "}
                    <span className="text-black/40">({r.identityType})</span>
                  </span>
                  <span className="font-medium text-black">
                    {r.amount} {preview.asset}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <Row label="Amount" value={`${preview.amount} ${preview.asset}`} />
            {preview.receiveAsset && (
              <Row
                label="Receive"
                value={`${preview.receiveAmount} ${preview.receiveAsset}`}
              />
            )}
            <Row label="Recipient" value={preview.recipient} />
          </>
        )}
        {preview.swapRoute && <Row label="Route" value={preview.swapRoute} />}
        <Row label="Network" value={preview.network} />
        <Row label="Gas" value={preview.sponsorship} />
        <Row label="Path" value={preview.executionPath} />
      </dl>

      <p className="mt-3 break-all font-mono text-[10px] text-black/40">
        Hash: {preview.previewHash.slice(0, 24)}…
      </p>

      {phase === "preview" && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            variant="primary"
            className="flex-1"
            onClick={onConfirm}
            disabled={!connected}
          >
            {!connected
              ? "Connect wallet first"
              : !ownershipVerified
                ? "Verify ownership first"
                : !smartWalletActive
                  ? "Activate smart wallet"
                  : "Confirm & Sign"}
          </Button>
          <Button variant="glass" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}

      {phase === "awaiting_signature" && (
        <p className="mt-3 text-center text-xs text-amber-700">
          Approve in your wallet…
        </p>
      )}

      {!connected && phase === "preview" && (
        <p className="mt-2 text-center text-xs text-black/45">
          Connect a wallet on Arc Testnet to enable signing.
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-black/5 pb-2 last:border-0">
      <dt className="text-black/45">{label}</dt>
      <dd className="text-right font-medium text-black">{value}</dd>
    </div>
  );
}
