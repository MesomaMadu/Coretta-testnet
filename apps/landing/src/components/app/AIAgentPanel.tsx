"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2 } from "lucide-react";
import { useAccount, useSignMessage } from "wagmi";
import AIOrb from "@/components/ai/AIOrb";
import ChatBubble from "@/components/ai/ChatBubble";
import TransactionPreviewCard from "./TransactionPreviewCard";
import TransactionStatusCard from "./TransactionStatusCard";
import SmartWalletActivation from "./SmartWalletActivation";
import { SmartWalletBalanceBubble } from "./SmartWalletBalanceBubble";
import { useAgentChat } from "@/hooks/useAgentChat";
import { useProfile } from "@/hooks/useProfile";
import { useVoice } from "@/hooks/useVoice";
import { useWalletSession } from "@/hooks/useWalletSession";
import { useWalletTracking } from "@/hooks/useWalletTracking";
import { useI18n } from "@/lib/i18n/context";
import { AGENT_NAME, AGENT_TAGLINE } from "@/lib/brand";
import { apiFetch, getApiToken } from "@/lib/api";
import { buildTransactionAuthMessage } from "@/lib/wallet-session";
import { upsertTransaction } from "@/lib/transaction-store";
import { humanizeTxFailure, mapTransferStateToLifecycle } from "@/lib/tx-errors";
import {
  buildRemitTargets,
  MAX_REMIT_RECIPIENTS,
  type RemitTarget,
} from "@/lib/agent/remit-targets";
import { Button } from "@/components/ui/button";

interface Props {
  onRequestWallet: () => void;
}

export default function AIAgentPanel({ onRequestWallet }: Props) {
  const [input, setInput] = useState("");
  const [voiceDraft, setVoiceDraft] = useState<string | null>(null);
  const [showBoundBanner, setShowBoundBanner] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasDisconnectedRef = useRef(false);
  const boundBannerShownRef = useRef(false);
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { profile, hydrated } = useProfile();
  const { t } = useI18n();
  const {
    verified,
    smartWalletActive,
    verifying,
    activating,
    verifyOwnership,
    activateSmartWallet,
    canTransact,
    isBoundMismatch,
    verifyError,
    refreshUsage,
  } = useWalletSession();
  const { track } = useWalletTracking();

  /** Push a single chatbot tx into the activity store (one row per txId). */
  const pushActivity = useCallback(
    (
      base: {
        id: string;
        asset: string;
        amount: string;
        recipient: string;
        network?: string;
        timestamp?: number;
      },
      patch: {
        status: "pending" | "settled" | "failed";
        txHash?: string;
        explorerUrl?: string;
        failureReason?: string;
      },
    ) => {
      upsertTransaction({
        id: base.id,
        asset: base.asset,
        amount: base.amount,
        recipient: base.recipient,
        network: base.network ?? "Arc Testnet",
        timestamp: base.timestamp ?? Date.now(),
        status: patch.status,
        txHash: patch.txHash,
        explorerUrl: patch.explorerUrl,
        failureReason: patch.failureReason,
      });
    },
    [],
  );

  const notifyUsageRefresh = useCallback(() => {
    if (address) void refreshUsage(address);
  }, [address, refreshUsage]);

  const greeting =
    hydrated && profile.preferredName && (isConnected || profile.linkedEmail)
      ? `${t("welcomeBack", { name: profile.preferredName })}\n${t("readyTransfer")}`
      : undefined;

  const {
    messages,
    phase,
    preview,
    txCards,
    submitUserMessage,
    confirmAndSign,
    markExecuting,
    completeExecution,
    failExecution,
    updateTxCard,
    cancelPreview,
    setPhase,
  } = useAgentChat(greeting);

  const onTranscript = useCallback((text: string) => {
    setVoiceDraft(text);
    setInput(text);
  }, []);

  // Voice input + optional TTS hint only — never speak on tx success/failure.
  const { listening, supported, startListening, stopListening, speak } = useVoice({
    onTranscript,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, preview, txCards]);

  useEffect(() => {
    if (!isConnected) wasDisconnectedRef.current = true;
  }, [isConnected]);

  useEffect(() => {
    if (!verified || !isConnected || !greeting || !wasDisconnectedRef.current) return;
    wasDisconnectedRef.current = false;
    window.dispatchEvent(
      new CustomEvent("coretta-session-restored", { detail: { message: greeting } }),
    );
  }, [verified, isConnected, greeting]);

  // "Smart wallet bound" banner: show once per bind, auto-hide after 5s.
  useEffect(() => {
    if (!isConnected || !verified || !smartWalletActive || isBoundMismatch) {
      if (!isConnected || !verified) {
        boundBannerShownRef.current = false;
        setShowBoundBanner(false);
      }
      return;
    }
    if (boundBannerShownRef.current) return;
    boundBannerShownRef.current = true;
    setShowBoundBanner(true);
    const t = window.setTimeout(() => setShowBoundBanner(false), 5000);
    return () => window.clearTimeout(t);
  }, [isConnected, verified, smartWalletActive, isBoundMismatch]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || phase === "executing" || phase === "awaiting_signature") return;
    setInput("");
    setVoiceDraft(null);
    if (verified && address) {
      void track({
        kind: "chat",
        label: `Chat: ${text.slice(0, 120)}`,
        metadata: { length: text.length },
      });
    }
    await submitUserMessage(text);
  };

  const pollTransfer = async (
    transferId: string,
    txId: string,
    base: {
      id: string;
      asset: string;
      amount: string;
      recipient: string;
      network?: string;
      timestamp?: number;
    },
  ) => {
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const t = await apiFetch<{
          state: string;
          txHash?: string;
          failureReason?: string;
          explorerUrl?: string;
        }>(`/v1/transfers/${transferId}`);
        const lifecycle = mapTransferStateToLifecycle(t.state);
        const failureReason = t.failureReason
          ? humanizeTxFailure(new Error(t.failureReason))
          : lifecycle === "failed"
            ? humanizeTxFailure(new Error(t.state))
            : undefined;
        const record = {
          id: txId,
          status: lifecycle as "pending" | "settled" | "failed",
          asset: base.asset,
          amount: base.amount,
          recipient: base.recipient,
          txHash: t.txHash,
          network: base.network ?? "Arc Testnet",
          timestamp: base.timestamp ?? Date.now(),
          explorerUrl: t.explorerUrl,
          failureReason,
        };
        updateTxCard(record);
        pushActivity(base, {
          status: record.status,
          txHash: t.txHash,
          explorerUrl: t.explorerUrl,
          failureReason,
        });
        if (lifecycle !== "pending") {
          if (verified && address) {
            void track({
              kind: "transfer",
              label:
                lifecycle === "settled"
                  ? `Transfer settled ${record.amount} ${record.asset}`
                  : `Transfer failed ${record.amount} ${record.asset}`,
              status: lifecycle === "settled" ? "complete" : "failed",
              metadata: {
                transferId,
                txHash: record.txHash,
                recipient: record.recipient,
                amount: record.amount,
                asset: record.asset,
              },
            });
          }
          if (lifecycle === "settled") {
            completeExecution(t.txHash, txId);
            notifyUsageRefresh();
          } else {
            failExecution(txId, failureReason ?? "Transfer failed.", t.txHash);
          }
          return;
        }
      } catch {
        /* retry */
      }
    }
  };

  const handleConfirm = async () => {
    if (!isConnected || !address) {
      onRequestWallet();
      return;
    }
    if (!verified) {
      const ok = await verifyOwnership();
      if (!ok) return;
    }
    if (!canTransact) return;

    const ok = await confirmAndSign();
    if (!ok || !preview) return;

    const isSwap =
      preview.action === "swapUSDCtoEURC" || preview.action === "swapEURCtoUSDC";
    const txId = `${isSwap ? "swap" : "tx"}_${Date.now()}`;
    const pendingRecord = {
      id: txId,
      status: "pending" as const,
      asset: preview.asset,
      amount: preview.amount,
      recipient: preview.recipient,
      network: preview.network,
      timestamp: Date.now(),
    };
    const activityBase = {
      id: txId,
      asset: preview.asset,
      amount: preview.amount,
      recipient: preview.recipient,
      network: preview.network,
      timestamp: pendingRecord.timestamp,
    };
    updateTxCard(pendingRecord);
    pushActivity(activityBase, { status: "pending" });
    void track({
      kind: "preview",
      label: `Confirmed ${preview.action} ${preview.amount} ${preview.asset}`,
      status: "pending",
      metadata: {
        action: preview.action,
        amount: preview.amount,
        asset: preview.asset,
        recipient: preview.recipient,
      },
    });

    try {
      const authMessage = buildTransactionAuthMessage({
        address,
        previewHash: preview.previewHash,
        action: preview.action,
        amount: preview.amount,
        asset: preview.asset,
        recipient: preview.recipient,
      });
      await signMessageAsync({ message: authMessage });
    } catch (err) {
      const reason = humanizeTxFailure(err);
      failExecution(txId, reason);
      pushActivity(activityBase, { status: "failed", failureReason: reason });
      return;
    }

    markExecuting();
    setPhase("executing");

    const token = getApiToken();
    if (!token) {
      const reason =
        "Wallet session missing. Reconnect your wallet and approve the ownership signature.";
      failExecution(txId, reason);
      pushActivity(activityBase, { status: "failed", failureReason: reason });
      return;
    }

    // Circle App Kit swap path (server-side /v1/swap)
    if (isSwap) {
      const tokenIn = preview.action === "swapUSDCtoEURC" ? "USDC" : "EURC";
      const tokenOut = preview.action === "swapUSDCtoEURC" ? "EURC" : "USDC";
      try {
        const res = await apiFetch<{
          ok: boolean;
          code?: string;
          message?: string;
          txHash?: string;
          explorerUrl?: string;
          amountOut?: string;
        }>("/v1/swap", {
          method: "POST",
          body: JSON.stringify({
            tokenIn,
            tokenOut,
            amountIn: preview.amount,
          }),
        });

        if (!res.ok) {
          const reason = res.message ?? res.code ?? "Swap failed";
          failExecution(txId, reason);
          pushActivity(activityBase, {
            status: "failed",
            failureReason: reason,
          });
          return;
        }

        const settled = {
          ...pendingRecord,
          status: "settled" as const,
          txHash: res.txHash,
          explorerUrl: res.explorerUrl,
        };
        updateTxCard(settled);
        pushActivity(activityBase, {
          status: "settled",
          txHash: res.txHash,
          explorerUrl: res.explorerUrl,
        });
        completeExecution(res.txHash, txId);
        notifyUsageRefresh();
        return;
      } catch (err) {
        const reason = humanizeTxFailure(err);
        failExecution(txId, reason);
        pushActivity(activityBase, { status: "failed", failureReason: reason });
        return;
      }
    }

    // Map "Your wallet" / bound-wallet placeholders to connected EOA for single sends.
    const recipientForResolve =
      /^your wallet$/i.test(preview.recipient.trim()) && address
        ? address
        : preview.recipient;

    const built = buildRemitTargets({
      batch: preview.batch,
      recipient: recipientForResolve,
      amount: preview.amount,
    });

    if (!built.ok) {
      failExecution(txId, built.reason);
      pushActivity(activityBase, { status: "failed", failureReason: built.reason });
      return;
    }

    const targets: RemitTarget[] = built.targets.slice(0, MAX_REMIT_RECIPIENTS);
    if (targets.length === 0) {
      const reason =
        "Recipient must be a full EVM address (0x…) or email. Names alone cannot be settled on-chain yet.";
      failExecution(txId, reason);
      pushActivity(activityBase, { status: "failed", failureReason: reason });
      return;
    }

    const executeOneRemit = async (
      target: RemitTarget,
      oneTxId: string,
    ): Promise<{
      ok: boolean;
      txHash?: string;
      explorerUrl?: string;
      reason?: string;
      transferId?: string;
      pending?: boolean;
    }> => {
      const oneBase = {
        id: oneTxId,
        asset: preview.asset,
        amount: target.amount,
        recipient: target.label,
        network: preview.network,
        timestamp: Date.now(),
      };
      updateTxCard({
        id: oneTxId,
        status: "pending",
        asset: preview.asset,
        amount: target.amount,
        recipient: target.label,
        network: preview.network,
        timestamp: oneBase.timestamp,
      });
      pushActivity(oneBase, { status: "pending" });

      try {
        const res = await apiFetch<{
          transferId: string;
          state: string;
          txHash?: string;
          explorerUrl?: string;
          message?: string;
        }>("/v1/remit", {
          method: "POST",
          body: JSON.stringify({
            recipient: target.payload,
            amount: target.amount,
            idempotencyKey: crypto.randomUUID(),
            execute: true,
          }),
        });

        if (res.state === "SETTLED" || res.state === "INCLUDED") {
          pushActivity(oneBase, {
            status: "settled",
            txHash: res.txHash,
            explorerUrl: res.explorerUrl,
          });
          updateTxCard({
            id: oneTxId,
            status: "settled",
            asset: preview.asset,
            amount: target.amount,
            recipient: target.label,
            network: preview.network,
            timestamp: oneBase.timestamp,
            txHash: res.txHash,
            explorerUrl: res.explorerUrl,
          });
          return {
            ok: true,
            txHash: res.txHash,
            explorerUrl: res.explorerUrl,
            transferId: res.transferId,
          };
        }

        if (res.state === "FAILED" || res.state === "POLICY_DENIED") {
          const reason = humanizeTxFailure(new Error(res.message ?? res.state));
          pushActivity(oneBase, {
            status: "failed",
            txHash: res.txHash,
            explorerUrl: res.explorerUrl,
            failureReason: reason,
          });
          updateTxCard({
            id: oneTxId,
            status: "failed",
            asset: preview.asset,
            amount: target.amount,
            recipient: target.label,
            network: preview.network,
            timestamp: oneBase.timestamp,
            txHash: res.txHash,
            failureReason: reason,
          });
          return { ok: false, reason, txHash: res.txHash };
        }

        // Non-terminal: poll until settled/failed
        pushActivity(oneBase, {
          status: "pending",
          txHash: res.txHash,
          explorerUrl: res.explorerUrl,
        });
        updateTxCard({
          id: oneTxId,
          status: "pending",
          asset: preview.asset,
          amount: target.amount,
          recipient: target.label,
          network: preview.network,
          timestamp: oneBase.timestamp,
          txHash: res.txHash,
          explorerUrl: res.explorerUrl,
        });

        for (let i = 0; i < 45; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const t = await apiFetch<{
              state: string;
              txHash?: string;
              failureReason?: string;
              explorerUrl?: string;
            }>(`/v1/transfers/${res.transferId}`);
            const lifecycle = mapTransferStateToLifecycle(t.state);
            if (lifecycle === "pending") continue;
            if (lifecycle === "settled") {
              pushActivity(oneBase, {
                status: "settled",
                txHash: t.txHash,
                explorerUrl: t.explorerUrl,
              });
              updateTxCard({
                id: oneTxId,
                status: "settled",
                asset: preview.asset,
                amount: target.amount,
                recipient: target.label,
                network: preview.network,
                timestamp: oneBase.timestamp,
                txHash: t.txHash,
                explorerUrl: t.explorerUrl,
              });
              return {
                ok: true,
                txHash: t.txHash,
                explorerUrl: t.explorerUrl,
                transferId: res.transferId,
              };
            }
            const reason = t.failureReason
              ? humanizeTxFailure(new Error(t.failureReason))
              : humanizeTxFailure(new Error(t.state));
            pushActivity(oneBase, {
              status: "failed",
              txHash: t.txHash,
              failureReason: reason,
            });
            updateTxCard({
              id: oneTxId,
              status: "failed",
              asset: preview.asset,
              amount: target.amount,
              recipient: target.label,
              network: preview.network,
              timestamp: oneBase.timestamp,
              txHash: t.txHash,
              failureReason: reason,
            });
            return { ok: false, reason, txHash: t.txHash };
          } catch {
            /* retry poll */
          }
        }
        const timeoutReason = "Transfer timed out waiting for confirmation.";
        pushActivity(oneBase, { status: "failed", failureReason: timeoutReason });
        updateTxCard({
          id: oneTxId,
          status: "failed",
          asset: preview.asset,
          amount: target.amount,
          recipient: target.label,
          network: preview.network,
          timestamp: oneBase.timestamp,
          failureReason: timeoutReason,
        });
        return { ok: false, reason: timeoutReason };
      } catch (err) {
        const reason = humanizeTxFailure(err);
        pushActivity(oneBase, { status: "failed", failureReason: reason });
        updateTxCard({
          id: oneTxId,
          status: "failed",
          asset: preview.asset,
          amount: target.amount,
          recipient: target.label,
          network: preview.network,
          timestamp: Date.now(),
          failureReason: reason,
        });
        return { ok: false, reason };
      }
    };

    // Multi-wallet: sequential remits (API is single-recipient). Max 10.
    if (targets.length > 1) {
      // Aggregate status card while legs run (per-wallet cards use `${txId}_wN`).
      updateTxCard({
        id: txId,
        status: "pending",
        asset: preview.asset,
        amount: preview.totalAmount ?? preview.amount,
        recipient: `${targets.length} wallets`,
        network: preview.network,
        timestamp: pendingRecord.timestamp,
      });

      void track({
        kind: "transfer",
        label: `Batch send ${targets.length} wallets · ${preview.amount} ${preview.asset}`,
        status: "pending",
        metadata: {
          recipients: targets.map((t) => t.label),
          amounts: targets.map((t) => t.amount),
          count: targets.length,
        },
      });

      try {
        await apiFetch("/v1/usage/track", {
          method: "POST",
          body: JSON.stringify({
            action: "batch",
            walletAddress: address,
          }),
        });
      } catch {
        /* non-fatal */
      }

      let settledCount = 0;
      let failedCount = 0;
      let lastHash: string | undefined;
      const failures: string[] = [];

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const oneTxId = `${txId}_w${i + 1}`;
        const result = await executeOneRemit(target, oneTxId);
        if (result.ok) {
          settledCount += 1;
          lastHash = result.txHash ?? lastHash;
        } else {
          failedCount += 1;
          const short =
            target.label.length > 14
              ? `${target.label.slice(0, 8)}…${target.label.slice(-4)}`
              : target.label;
          failures.push(`${short}: ${result.reason ?? "failed"}`);
        }
      }

      notifyUsageRefresh();

      if (failedCount === 0) {
        updateTxCard({
          id: txId,
          status: "settled",
          asset: preview.asset,
          amount: preview.totalAmount ?? preview.amount,
          recipient: `${settledCount} wallets`,
          network: preview.network,
          timestamp: Date.now(),
          txHash: lastHash,
        });
        completeExecution(lastHash, undefined);
        void track({
          kind: "transfer",
          label: `Batch settled ${settledCount}/${targets.length}`,
          status: "complete",
          metadata: { settledCount, failedCount },
        });
        return;
      }

      if (settledCount === 0) {
        failExecution(
          txId,
          `All ${failedCount} transfers failed. ${failures.slice(0, 3).join(" · ")}`,
        );
        return;
      }

      // Partial success
      updateTxCard({
        id: txId,
        status: "settled",
        asset: preview.asset,
        amount: preview.totalAmount ?? preview.amount,
        recipient: `${settledCount}/${targets.length} wallets`,
        network: preview.network,
        timestamp: Date.now(),
        txHash: lastHash,
        failureReason: `${failedCount} failed — ${failures.slice(0, 2).join(" · ")}`,
      });
      completeExecution(lastHash, undefined);
      void track({
        kind: "transfer",
        label: `Batch partial ${settledCount}/${targets.length}`,
        status: "complete",
        metadata: { settledCount, failedCount, failures },
      });
      return;
    }

    // Single recipient — executeOneRemit owns the same txId card/activity.
    const only = targets[0];
    const result = await executeOneRemit(only, txId);
    if (result.ok) {
      completeExecution(result.txHash, txId);
      notifyUsageRefresh();
      return;
    }
    failExecution(txId, result.reason ?? "Transfer failed.", result.txHash);
    notifyUsageRefresh();
  };

  const activeOrb = listening || phase === "thinking" || phase === "executing";

  const showPreview =
    Boolean(preview) &&
    (phase === "preview" || phase === "awaiting_signature");

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#F5F5F5] text-black">
      <div className="flex flex-col items-center border-b border-black/10 bg-white py-6">
        <AIOrb active={activeOrb} size="lg" />
        <div className="mt-3 flex items-center justify-center gap-2">
          <p className="text-xs font-medium uppercase tracking-widest text-black">
            {AGENT_NAME}
          </p>
          {isConnected && verified && smartWalletActive && (
            <SmartWalletBalanceBubble />
          )}
        </div>
        <p className="subheading-text mt-1 text-center text-xs text-black/50">{AGENT_TAGLINE}</p>
      </div>

      {isConnected && !verified && (
        <div className="mx-4 mb-2 rounded-2xl border border-black/10 bg-white px-3 py-2 text-xs text-black/80 shadow-sm">
          {verifying
            ? "Confirm ownership in your wallet"
            : verifyError
              ? verifyError
              : "Wallet connected. One ownership signature activates your session."}
          {!verifying && (
            <button
              type="button"
              className="ml-2 font-semibold text-black underline underline-offset-2 hover:text-black/70"
              onClick={() => void verifyOwnership()}
            >
              Sign now
            </button>
          )}
        </div>
      )}

      {isConnected && verified && !smartWalletActive && (
        <SmartWalletActivation
          onActivate={() => void activateSmartWallet()}
          activating={activating}
        />
      )}

      {isBoundMismatch && (
        <div className="mx-4 mb-2 rounded-2xl border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Connected wallet does not match your bound wallet. Replace your wallet in Settings to
          continue.
        </div>
      )}

      {showBoundBanner && (
        <div className="mx-4 mb-2 rounded-2xl border border-black/10 bg-white px-3 py-2 text-xs text-black/80 shadow-sm">
          Smart wallet bound. You can send now.
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <ChatBubble
            key={m.id}
            message={m}
            context={{
              lastUserMessage: messages.slice().reverse().find((x) => x.role === "user")?.content,
            }}
            preview={showPreview ? preview : null}
          />
        ))}
        {txCards.map((r) => (
          <TransactionStatusCard key={r.id} record={r} />
        ))}
        {showPreview && preview && (
          <TransactionPreviewCard
            preview={preview}
            phase={phase}
            onConfirm={handleConfirm}
            onCancel={cancelPreview}
            connected={isConnected && canTransact}
            ownershipVerified={verified}
            smartWalletActive={smartWalletActive}
          />
        )}
      </div>

      {voiceDraft && (
        <div className="mx-4 mb-2 rounded-2xl border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Voice captured. Review and press Send to continue. Voice never auto-sends.
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t border-black/10 bg-white p-4">
        <div className="flex gap-2 rounded-full border border-black/10 bg-[#F5F5F5] p-1.5 transition focus-within:border-black/30">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("askDamian")}
            disabled={
              phase === "awaiting_signature" ||
              phase === "executing" ||
              (isConnected && !canTransact)
            }
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-black placeholder:text-black/35 outline-none"
          />
          {supported && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 w-10 shrink-0 rounded-full p-0 text-black/60 hover:text-black"
              onClick={() => (listening ? stopListening() : startListening())}
              aria-label={listening ? "Stop listening" : "Voice input"}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 w-10 shrink-0 rounded-full p-0 text-black/50 hover:text-black"
            onClick={() => speak("I'm ready when you are. Tell me who to pay and how much.")}
            aria-label="Speak assistant hint"
          >
            <Volume2 className="h-4 w-4" />
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            className="h-10 w-10 shrink-0 rounded-xl p-0"
            disabled={!input.trim() || phase === "awaiting_signature"}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
