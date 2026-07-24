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
import { useI18n } from "@/lib/i18n/context";
import { AGENT_NAME, AGENT_TAGLINE } from "@/lib/brand";
import { apiFetch, getApiToken } from "@/lib/api";
import { buildTransactionAuthMessage } from "@/lib/wallet-session";
import { upsertTransaction } from "@/lib/transaction-store";
import { humanizeTxFailure, mapTransferStateToLifecycle } from "@/lib/tx-errors";
import { emitActivity } from "./ActivityPanel";
import { Button } from "@/components/ui/button";

interface Props {
  onRequestWallet: () => void;
}

export default function AIAgentPanel({ onRequestWallet }: Props) {
  const [input, setInput] = useState("");
  const [voiceDraft, setVoiceDraft] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasDisconnectedRef = useRef(false);
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
    emailOnlyMode,
  } = useWalletSession();

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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || phase === "executing" || phase === "awaiting_signature") return;
    setInput("");
    setVoiceDraft(null);
    await submitUserMessage(text);
  };

  const pollTransfer = async (transferId: string, txId: string) => {
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
        const record = {
          id: txId,
          status: lifecycle as "pending" | "settled" | "failed",
          asset: preview?.asset ?? "USDC",
          amount: preview?.amount ?? "0",
          recipient: preview?.recipient ?? "",
          txHash: t.txHash,
          network: "Arc Testnet",
          timestamp: Date.now(),
          explorerUrl: t.explorerUrl,
          failureReason: t.failureReason
            ? humanizeTxFailure(new Error(t.failureReason))
            : lifecycle === "failed"
              ? humanizeTxFailure(new Error(t.state))
              : undefined,
        };
        updateTxCard(record);
        upsertTransaction(record);
        emitActivity(
          lifecycle === "settled"
            ? `Transfer settled`
            : lifecycle === "failed"
              ? `Transfer failed`
              : `Transfer pending`,
          lifecycle === "settled" ? "complete" : lifecycle === "failed" ? "failed" : "pending",
          {
            asset: record.asset,
            amount: record.amount,
            recipient: record.recipient,
            txHash: record.txHash,
          },
        );
        if (lifecycle !== "pending") {
          if (lifecycle === "settled") completeExecution(t.txHash, txId);
          else failExecution(txId, record.failureReason ?? "Transfer failed.", t.txHash);
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

    const txId = `tx_${Date.now()}`;
    const pendingRecord = {
      id: txId,
      status: "pending" as const,
      asset: preview.asset,
      amount: preview.amount,
      recipient: preview.recipient,
      network: preview.network,
      timestamp: Date.now(),
    };
    updateTxCard(pendingRecord);
    upsertTransaction(pendingRecord);
    emitActivity(`Signing ${preview.action}…`, "pending", {
      asset: preview.asset,
      amount: preview.amount,
      recipient: preview.recipient,
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
      emitActivity(`Transfer failed`, "failed", {
        asset: preview.asset,
        amount: preview.amount,
        recipient: preview.recipient,
        failureReason: reason,
      });
      return;
    }

    markExecuting();
    setPhase("executing");

    // Swaps are preview-only today — no DEX/router/API path exists on Arc Testnet yet.
    if (preview.action === "swapUSDCtoEURC" || preview.action === "swapEURCtoUSDC") {
      failExecution(
        txId,
        [
          "Swap cannot execute on-chain yet.",
          "",
          "What works today: USDC send/remit to a full 0x address (or email) via /v1/remit.",
          "What is missing for swaps:",
          "• No DEX / liquidity router integrated for USDC↔EURC on Arc Testnet",
          "• No POST /v1/swap API or swap UserOp builder",
          "• EURC pool/router contract addresses not configured",
          "",
          "Manual inputs needed before swaps can settle:",
          "1. Arc Testnet swap router (or Circle Swap Kit) address + ABI path",
          "2. EURC contract (if different from app default) + pool/route config",
          "3. Funded smart wallet with the source token (USDC or EURC)",
          "4. Reliable RPC (public Arc RPC is rate-limiting) and BUNDLER_RPC_URL",
          "",
          'Until then use: "Send 5 USDC to 0x…" (full address).',
        ].join("\n"),
      );
      emitActivity(`Swap blocked — not implemented on-chain`, "failed", {
        asset: preview.asset,
        amount: preview.amount,
        recipient: preview.recipient,
        failureReason: "SWAP_NOT_IMPLEMENTED",
      });
      return;
    }

    const token = getApiToken();
    if (!token) {
      failExecution(
        txId,
        "Wallet session missing. Reconnect your wallet and approve the ownership signature (email is not required).",
      );
      return;
    }

    // Swap-only previews use "Your wallet" — map to the connected EOA for sends if needed.
    const recipientText =
      /^your wallet$/i.test(preview.recipient.trim()) && address
        ? address
        : preview.recipient;

    const emailMatch = recipientText.match(/[\w.+-]+@[\w.-]+\.\w+/);
    const addressMatch = recipientText.match(/0x[a-fA-F0-9]{40}/i);
    const recipientPayload = emailMatch
      ? { type: "email" as const, value: emailMatch[0] }
      : addressMatch
        ? { type: "wallet" as const, value: addressMatch[0] }
        : null;

    if (!recipientPayload) {
      failExecution(
        txId,
        "Recipient must be a full EVM address (0x…) or email. Names alone cannot be settled on-chain yet.",
      );
      return;
    }

    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await apiFetch<{
        transferId: string;
        state: string;
        txHash?: string;
        explorerUrl?: string;
        message?: string;
      }>("/v1/remit", {
        method: "POST",
        body: JSON.stringify({
          recipient: recipientPayload,
          amount: preview.amount,
          idempotencyKey,
          execute: true,
        }),
      });

      const withHash = {
        ...pendingRecord,
        txHash: res.txHash,
        explorerUrl: res.explorerUrl,
      };
      updateTxCard(withHash);
      upsertTransaction(withHash);
      emitActivity(`Transfer submitted`, "pending", {
        asset: preview.asset,
        amount: preview.amount,
        recipient: preview.recipient,
        txHash: res.txHash,
      });

      if (res.state === "SETTLED" || res.state === "INCLUDED") {
        completeExecution(res.txHash, txId);
        speak("Transfer settled successfully.");
        return;
      }
      if (res.state === "FAILED" || res.state === "POLICY_DENIED") {
        failExecution(txId, humanizeTxFailure(new Error(res.message ?? res.state)), res.txHash);
        return;
      }

      void pollTransfer(res.transferId, txId);
      speak("Transfer submitted. Awaiting confirmation on Arc Testnet.");
      return;
    } catch (err) {
      const reason = humanizeTxFailure(err);
      failExecution(txId, reason);
      emitActivity(`Transfer failed`, "failed", {
        asset: preview.asset,
        amount: preview.amount,
        recipient: preview.recipient,
        failureReason: reason,
      });
    }
  };

  const activeOrb = listening || phase === "thinking" || phase === "executing";

  return (
    <div className="damian-chat-bg flex h-full min-h-0 flex-1 flex-col">
      <div className="flex flex-col items-center border-b border-[var(--ar-border)] bg-[var(--damian-surface)] py-6">
        <AIOrb active={activeOrb} size="lg" />
        <p className="mt-3 text-xs font-medium uppercase tracking-widest text-[#8F5CFF]">
          {AGENT_NAME}
        </p>
        <p className="subheading-text mt-1 text-center text-xs text-white/45">{AGENT_TAGLINE}</p>
      </div>

      {isConnected && !verified && (
        <div className="mx-4 mb-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
          {verifying
            ? "Confirm ownership in your wallet — one free signature, no gas."
            : "Wallet connected. Approve the ownership signature to continue."}
          {!verifying && (
            <button
              type="button"
              className="ml-2 font-semibold text-cyan-200 underline underline-offset-2 hover:text-white"
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
        <div className="mx-4 mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Connected wallet does not match your bound wallet. Replace your wallet in Settings to
          continue.
        </div>
      )}

      {isConnected && verified && smartWalletActive && !isBoundMismatch && (
        <div className="mx-4 mb-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100/90">
          Smart wallet bound to your connected address. Email is optional — you can send now.
        </div>
      )}

      {emailOnlyMode && (
        <div className="mx-4 mb-2 rounded-xl border border-[#8F5CFF]/20 bg-[#8F5CFF]/5 px-3 py-2 text-xs text-white/55">
          Email session active — connect a wallet to send transactions. Email linking is not
          required for wallet sends.
        </div>
      )}

      {smartWalletActive && <SmartWalletBalanceBubble />}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <ChatBubble
            key={m.id}
            message={m}
            context={{
              lastUserMessage: messages.slice().reverse().find((x) => x.role === "user")?.content,
            }}
            preview={preview}
          />
        ))}
        {txCards.map((r) => (
          <TransactionStatusCard key={r.id} record={r} />
        ))}
        {preview && (
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
        <div className="mx-4 mb-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Voice captured — review and press Send to continue. Voice never auto-sends.
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t border-white/8 p-4">
        <div className="damian-input-surface flex gap-2 rounded-2xl border p-1.5 transition">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("askDamian")}
            disabled={
              phase === "awaiting_signature" ||
              phase === "executing" ||
              (isConnected && !canTransact)
            }
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none"
          />
          {supported && (
            <Button
              type="button"
              variant="glass"
              size="sm"
              className="h-10 w-10 shrink-0 rounded-xl p-0"
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
            className="h-10 w-10 shrink-0 rounded-xl p-0 text-white/60"
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
