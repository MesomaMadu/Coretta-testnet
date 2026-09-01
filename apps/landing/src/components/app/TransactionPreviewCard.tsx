"use client";

import { ArrowDown, Check, Shield, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { TransactionPreview } from "@/lib/agent/types";
import type { AgentPhase } from "@/lib/agent/types";

interface Props {
  preview: TransactionPreview;
  phase: AgentPhase;
  onConfirm: () => void;
  onCancel: () => void;
  connected: boolean;
  walletConnected?: boolean;
  canTransact?: boolean;
  requiresWalletSignature?: boolean;
  ownershipVerified?: boolean;
  smartWalletActive?: boolean;
}

export default function TransactionPreviewCard({
  preview,
  phase,
  onConfirm,
  onCancel,
  connected,
  walletConnected = false,
  canTransact = false,
  requiresWalletSignature = true,
  ownershipVerified = false,
  smartWalletActive = false,
}: Props) {
  const locked = phase === "preview" || phase === "awaiting_signature";
  const reduceMotion = useReducedMotion();
  const paymentAsset =
    preview.action === "swapAndSend" || preview.action === "swapAndBridge"
      ? preview.receiveAsset
      : preview.asset;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
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
        <Row
          label="Action"
          value={
            preview.action === "swapAndSend"
              ? "Swap and send"
              : preview.action === "swapAndBridge"
                ? "Swap and bridge"
              : preview.action === "bridgeUSDC"
                ? preview.bridgeOperationId
                  ? "Resume CCTP transfer"
                  : "Bridge with CCTP"
              : preview.action.startsWith("swap")
                ? "Swap"
                : "Send"
          }
        />
        <div className="rounded-xl border border-black/10 bg-[#F7F7F7] p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-black/40">
            Execution plan
          </p>
          <ol className="space-y-1.5">
            {preview.steps.map((step, index) => (
              <li key={step.id} className="flex gap-2 text-xs">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black text-[10px] text-white">
                  {phase === "awaiting_signature" ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                <span>
                  <span className="block font-medium text-black">{step.label}</span>
                  <span className="text-black/50">{step.detail}</span>
                </span>
                {index < preview.steps.length - 1 && <ArrowDown className="ml-auto h-3 w-3 text-black/25" />}
              </li>
            ))}
          </ol>
        </div>
        {preview.batch && preview.batch.length > 1 ? (
          <>
            <Row
              label="Wallets"
              value={`${preview.recipientCount ?? preview.batch.length}`}
            />
            <Row
              label="Total"
              value={`${preview.totalAmount ?? preview.amount} ${paymentAsset}`}
            />
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-black/10 bg-[#F5F5F5] p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">
                Amount per wallet
              </p>
              {preview.batch.map((r, i) => (
                <div
                  key={`${r.name}-${r.amount}-${i}`}
                  className="flex flex-col gap-0.5 border-b border-black/5 pb-2 text-xs last:border-0 last:pb-0"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-black">
                      Wallet {i + 1}
                      <span className="ml-1 font-normal text-black/40">
                        ({r.identityType})
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-black">
                      {r.amount} {paymentAsset}
                    </span>
                  </div>
                  <span
                    className={
                      r.identityType === "address"
                        ? "break-all font-mono text-[10px] text-black/60"
                        : "break-all text-[11px] text-black/70"
                    }
                  >
                    {r.name}
                  </span>
                  {r.destinationChainLabel ? (
                    <span className="text-[10px] text-black/45">
                      {r.destinationChainLabel}
                    </span>
                  ) : null}
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
                value={`${preview.receiveAmount ?? "Quote unavailable"} ${preview.receiveAsset}`}
              />
            )}
            {(preview.action === "sendUSDC" ||
              preview.action === "sendEURC" ||
              preview.action === "swapAndSend" ||
              preview.action === "swapAndBridge" ||
              preview.action === "bridgeUSDC") && (
              <Row label="Recipient" value={preview.recipient} />
            )}
            {preview.action === "swapAndSend" && preview.totalAmount && (
              <Row label="Payment" value={`${preview.totalAmount} ${preview.receiveAsset}`} />
            )}
            {preview.action === "swapAndBridge" && preview.totalAmount && (
              <Row label="Bridge" value={`${preview.totalAmount} ${preview.receiveAsset}`} />
            )}
          </>
        )}
        {preview.swapRoute && <Row label="Route" value={preview.swapRoute} />}
        {preview.destinationChainLabel && (
          <Row label="Destination" value={preview.destinationChainLabel} />
        )}
        {preview.estimatedBridgeFee && (
          <Row label="Estimated CCTP fees" value={`${preview.estimatedBridgeFee} USDC`} />
        )}
        {preview.quotedAt && (
          <Row
            label="Quote"
            value={`Live at ${new Date(preview.quotedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}`}
          />
        )}
        <Row label="Network" value={preview.network} />
        {preview.sponsorship === "user-paid" && preview.transactionFee && (
          <Row label="Transaction fee" value={preview.transactionFee} />
        )}
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
            disabled={!canTransact}
          >
            {!connected
              ? "Sign in or connect first"
              : requiresWalletSignature && !walletConnected
                ? "Connect wallet first"
                : requiresWalletSignature && !ownershipVerified
                ? "Verify ownership first"
                : !smartWalletActive
                  ? "Activate smart wallet"
                  : !canTransact
                    ? "Preparing account..."
                    : requiresWalletSignature
                      ? "Confirm & Sign"
                      : "Confirm"}
          </Button>
          <Button variant="glass" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}

      {phase === "awaiting_signature" && (
        <p className="mt-3 text-center text-xs text-amber-700">
          {requiresWalletSignature ? "Approve in your wallet…" : "Confirming…"}
        </p>
      )}

      {!connected && phase === "preview" && (
        <p className="mt-2 text-center text-xs text-black/45">
          Sign in with Privy email or connect a wallet to continue.
        </p>
      )}
    </motion.div>
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
