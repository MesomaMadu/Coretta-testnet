"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { parseUserIntent } from "@/lib/agent/intent-parser";
import { buildLockedPreview, verifyPreviewIntegrity } from "@/lib/agent/preview-lock";
import type { AgentMessage, AgentPhase, TransactionPreview } from "@/lib/agent/types";
import { AGENT_NAME, AGENT_TAGLINE } from "@/lib/brand";
import { apiFetch, getApiToken } from "@/lib/api";
import type { TransactionRecord } from "@/lib/transaction-store";

const ONBOARDING_GREETING =
  "Welcome to Coretta.\nConnect your wallet or sign in to begin.";

function msg(role: AgentMessage["role"], content: string): AgentMessage {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

export function useAgentChat(greeting?: string) {
  const { address } = useAccount();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [memoryEnabled, setMemoryEnabled] = useState<boolean>(false);
  const [messages, setMessages] = useState<AgentMessage[]>([
    msg(
      "assistant",
      greeting ??
        `I'm ${AGENT_NAME}, ${AGENT_TAGLINE}. Tell me who to pay and how much. I'll prepare a preview for you to confirm and sign. I never send funds without your approval.`,
    ),
  ]);
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const [preview, setPreview] = useState<TransactionPreview | null>(null);
  const [txCards, setTxCards] = useState<TransactionRecord[]>([]);
  const lockedRef = useRef<TransactionPreview | null>(null);

  const resetSession = useCallback(() => {
    setMessages([msg("assistant", ONBOARDING_GREETING)]);
    setPhase("idle");
    setPreview(null);
    lockedRef.current = null;
    setTxCards([]);
    greetedRef.current = false;
    setConversationId(null);
  }, []);

  useEffect(() => {
    const onDisconnect = () => resetSession();
    const onRestore = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string }>).detail;
      if (!detail?.message) return;
      setMessages([msg("assistant", detail.message)]);
      greetedRef.current = true;
      setPhase("idle");
      setPreview(null);
      lockedRef.current = null;
      setTxCards([]);
    };
    window.addEventListener("coretta-wallet-disconnect", onDisconnect);
    window.addEventListener("coretta-session-restored", onRestore);
    return () => {
      window.removeEventListener("coretta-wallet-disconnect", onDisconnect);
      window.removeEventListener("coretta-session-restored", onRestore);
    };
  }, [resetSession]);

  const greetedRef = useRef(false);
  useEffect(() => {
    if (!greeting || greetedRef.current) return;
    greetedRef.current = true;
    setMessages([msg("assistant", greeting)]);
  }, [greeting]);

  useEffect(() => {
    const token = getApiToken();
    if (!token) {
      setMemoryEnabled(false);
      return;
    }
    (async () => {
      try {
        const boot = await apiFetch<{
          actorId: string;
          memoryEnabled: boolean;
          personalizationEnabled: boolean;
        }>("/v1/ai/bootstrap", { method: "GET" });
        setMemoryEnabled(boot.memoryEnabled);
        const convo = await apiFetch<{ conversationId: string }>(
          "/v1/ai/conversations",
          { method: "POST", body: JSON.stringify({ title: "Coretta session" }) },
        );
        setConversationId(convo.conversationId);
      } catch {
        setMemoryEnabled(false);
      }
    })();
  }, []);

  const persistMessage = useCallback(
    async (role: "user" | "assistant" | "system", content: string, clientId: string) => {
      const token = getApiToken();
      if (!token) return undefined;
      try {
        const res = await apiFetch<{ messageId: string }>("/v1/ai/messages", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            role,
            content,
            contentSummary: content.slice(0, 280),
            clientMessageId: clientId,
          }),
        });
        return res.messageId;
      } catch {
        return undefined;
      }
    },
    [conversationId],
  );

  const submitUserMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userLocal = msg("user", trimmed);
    setMessages((m) => [...m, userLocal]);
    void persistMessage("user", trimmed, userLocal.id).then((serverId) => {
      if (!serverId) return;
      setMessages((m) => m.map((x) => (x.id === userLocal.id ? { ...x, serverId } : x)));
    });
    setPhase("thinking");
    setPreview(null);

    await new Promise((r) => setTimeout(r, 400));

    const asksForWalletAddress =
      /\b(wallet\s*address|smart\s*wallet(\s*address)?|my\s+address|sca\s*address|account\s*address)\b/i.test(
        trimmed,
      ) ||
      /\bwhat('?s| is)\s+my\s+(smart\s+)?wallet\b/i.test(trimmed) ||
      /\bshow\s+(me\s+)?(my\s+)?(smart\s+)?wallet\s*address\b/i.test(trimmed);

    const asksForBalanceOrWallet =
      asksForWalletAddress ||
      /\b(balance|how much|wallet summary|show my wallet|what'?s my)\b/i.test(trimmed);

    if (asksForBalanceOrWallet) {
      try {
        const token = getApiToken();
        if (token) {
          const me = await apiFetch<{
            walletAddress?: string;
            balanceUsdc: string;
            identities: Array<{ type: string; value: string }>;
          }>("/v1/me");
          const smartAddr = me.walletAddress?.trim() || null;

          // Address-only asks: return the full smart wallet address, never truncated.
          if (asksForWalletAddress) {
            const lines = smartAddr
              ? [
                  "Your Coretta smart wallet address:",
                  "",
                  smartAddr,
                  "",
                  "This is the full on-chain address created for your account. Copy it carefully, and do not share your seed phrase or private key.",
                ]
              : [
                  "Your smart wallet is not provisioned yet.",
                  "Activate Smart Wallet in the app after connecting and verifying ownership, then ask again.",
                ];
            const a = msg("assistant", lines.join("\n"));
            setMessages((m) => [...m, a]);
            void persistMessage("assistant", a.content, a.id);
            setPhase("idle");
            return;
          }

          const lines = [
            "Wallet Summary",
            "",
            `USDC:\n${me.balanceUsdc}`,
            "",
            `Smart Wallet (full address):\n${smartAddr ?? "Not provisioned"}`,
            "",
            "Last Updated:\nJust now",
          ];
          const a = msg("assistant", lines.join("\n"));
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", a.content, a.id);
          setPhase("idle");
          return;
        }
        if (address) {
          // No API session: can only report the connected EOA in full.
          if (asksForWalletAddress) {
            const lines = [
              "Connected wallet address (EOA):",
              "",
              address,
              "",
              "Your Coretta smart wallet is created after you sign in / activate it. Connect and complete ownership verification to see the full smart wallet address.",
            ];
            const a = msg("assistant", lines.join("\n"));
            setMessages((m) => [...m, a]);
            setPhase("idle");
            return;
          }

          const { createPublicClient, http, formatUnits } = await import("viem");
          const { readContract } = await import("viem/actions");
          const { arcTestnet, USDC_ADDRESS, EURC_ADDRESS } = await import("@/lib/chains");
          const client = createPublicClient({ chain: arcTestnet, transport: http() });
          const [usdcRaw, eurcRaw] = await Promise.all([
            readContract(client, {
              address: USDC_ADDRESS,
              abi: [{ name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }],
              functionName: "balanceOf",
              args: [address],
            }),
            readContract(client, {
              address: EURC_ADDRESS,
              abi: [{ name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }],
              functionName: "balanceOf",
              args: [address],
            }),
          ]);
          const lines = [
            "Wallet Summary",
            "",
            `USDC:\n${formatUnits(usdcRaw as bigint, 6)}`,
            `EURC:\n${formatUnits(eurcRaw as bigint, 6)}`,
            "",
            `Connected Wallet (full address):\n${address}`,
            "",
            "Last Updated:\nJust now",
          ];
          const a = msg("assistant", lines.join("\n"));
          setMessages((m) => [...m, a]);
          setPhase("idle");
          return;
        }
        const a = msg(
          "assistant",
          "Connect your wallet or sign in with email to view your wallet address and balance.",
        );
        setMessages((m) => [...m, a]);
        setPhase("idle");
        return;
      } catch {
        const a = msg(
          "assistant",
          "I couldn't fetch your wallet details right now. Please try again shortly.",
        );
        setMessages((m) => [...m, a]);
        setPhase("idle");
        return;
      }
    }

    if (/\b(email|otp|code|arrive|receive|didn't get|no code)\b/i.test(trimmed)) {
      try {
        const status = await apiFetch<{
          configured: boolean;
          provider: string;
          fromAddress: string;
          devMode: boolean;
          reason: string;
        }>("/v1/auth/email-status");

        const lines = [
          "Email Delivery Diagnosis",
          "",
          `Provider Configured: ${status.configured ? "Yes (" + status.provider + ")" : "No"}`,
          `Sender Address: ${status.fromAddress}`,
          `Dev Mode Active: ${status.devMode ? "Yes" : "No"}`,
          "",
          `Diagnostic Detail: ${status.reason}`,
        ];
        const a = msg("assistant", lines.join("\n"));
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", a.content, a.id);
        setPhase("idle");
        return;
      } catch {
        const a = msg(
          "assistant",
          "Email Delivery Status\n\nProvider: Not Configured\nReason: EMAIL_PROVIDER_API_KEY is not set in backend environment (.env). In development mode, check server logs or dev output for OTP code."
        );
        setMessages((m) => [...m, a]);
        setPhase("idle");
        return;
      }
    }

    if (/\b(sponsorship|quota|limit|remaining|how many|how much|ai requests|otp requests|transfers left|transfers remaining)\b/i.test(trimmed)) {
      try {
        const usagePath = address
          ? `/v1/user/usage?walletAddress=${encodeURIComponent(address)}`
          : "/v1/user/usage";
        const usage = await apiFetch<import("@arcremit/shared").UserUsageMetrics>(usagePath);
        const remainingTx = Math.max(0, usage.sponsoredTxLimit - usage.sponsoredTxCount);
        const remainingUsd = Math.max(0, usage.sponsoredUsdLimit - usage.sponsoredUsdSpent);
        const remainingAi = Math.max(0, usage.aiRequestLimit - usage.aiRequestCount);
        const remainingOtp = Math.max(0, usage.otpRequestLimit - usage.otpRequestCount);
        const hrs = Math.floor(usage.resetInSeconds / 3600);
        const mins = Math.floor((usage.resetInSeconds % 3600) / 60);

        const lines = [
          "Live Usage & Sponsorship Summary",
          "",
          usage.walletAddress
            ? `Wallet: ${usage.walletAddress}`
            : "Wallet: (account-level; connect a wallet for per-address tracking)",
          `Live: ${usage.live ? "yes" : "no"}`,
          `User Tier: ${usage.userTier.toUpperCase()}`,
          `Sponsored USD: $${usage.sponsoredUsdSpent.toFixed(2)} / $${usage.sponsoredUsdLimit} (Remaining: $${remainingUsd.toFixed(2)})`,
          `Sponsored Transfers: ${usage.sponsoredTxCount} / ${usage.sponsoredTxLimit} (Remaining: ${remainingTx})`,
          `AI Requests Used: ${usage.aiRequestCount} / ${usage.aiRequestLimit} (Remaining: ${remainingAi})`,
          `OTP Requests Used: ${usage.otpRequestCount} / ${usage.otpRequestLimit} (Remaining: ${remainingOtp})`,
          `Voice Requests: ${usage.voiceRequestCount}`,
          `Swap Requests: ${usage.swapRequestCount}`,
          `Ownership Signatures: ${usage.signatureRequestCount}`,
          `Wallet Connections: ${usage.connectionCount}`,
          `Tx Simulations: ${usage.txSimulationCount}`,
          `Batch Transactions: ${usage.batchTxCount}`,
          "",
          `Quota Resets In: ${hrs}h ${mins}m`,
        ];
        const a = msg("assistant", lines.join("\n"));
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", a.content, a.id);
        setPhase("idle");
        return;
      } catch {
        const a = msg(
          "assistant",
          "Could not retrieve live usage stats. Please ensure you are logged in."
        );
        setMessages((m) => [...m, a]);
        setPhase("idle");
        return;
      }
    }

    if (/\b(what network|network used|which network)\b/i.test(trimmed)) {
      const a = msg(
        "assistant",
        "Network Settlement Summary\n\nPrimary Network: Arc Testnet (Chain ID: 5042002)\nSettlement Layer: Arc Native USDC\nFinality: Sub-second deterministic (<400ms)\nSponsorship: Circle Paymaster v0.7 Zero-Gas"
      );
      setMessages((m) => [...m, a]);
      void persistMessage("assistant", a.content, a.id);
      setPhase("idle");
      return;
    }

    if (memoryEnabled && /\b(again|same as before|like before|repeat)\b/i.test(trimmed)) {
      try {
        const mem = await apiFetch<{
          memories: Array<{ key?: string | null; dataJson?: string | null; summary: string }>;
        }>("/v1/ai/memory/retrieve", {
          method: "POST",
          body: JSON.stringify({ query: "last_recipient preferred_asset" }),
        });
        const lastRecipient = mem.memories.find((m) => m.key === "last_recipient");
        const preferredAsset = mem.memories.find((m) => m.key === "preferred_asset");
        const suggestion = [
          "I can use your previous context, but I still need explicit confirmation.",
          lastRecipient ? `• ${lastRecipient.summary}` : undefined,
          preferredAsset ? `• ${preferredAsset.summary}` : undefined,
          "",
          "Say: “Yes, send 50 USDC to the same recipient” or tell me the exact recipient/asset.",
        ]
          .filter(Boolean)
          .join("\n");
        const a = msg("assistant", suggestion);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", suggestion, a.id);
        setPhase("idle");
        return;
      } catch {
        /* fall through */
      }
    }

    const result = parseUserIntent(trimmed);
    if (!result.ok) {
      const a = msg("assistant", result.message);
      setMessages((m) => [...m, a]);
      void persistMessage("assistant", result.message, a.id);
      setPhase("idle");
      return;
    }

    const previewBase = { ...result.preview };
    if (previewBase.recipient === "__BOUND_SMART_WALLET__") {
      const token = getApiToken();
      if (token) {
        try {
          const me = await apiFetch<{ walletAddress?: string }>("/v1/me");
          if (me.walletAddress) {
            // Keep full address so execution does not require email.
            previewBase.recipient = me.walletAddress;
          } else {
            const a = msg(
              "assistant",
              "Your smart wallet is not provisioned yet. Connect your wallet and complete ownership verification first.",
            );
            setMessages((m) => [...m, a]);
            setPhase("idle");
            return;
          }
        } catch {
          const a = msg("assistant", "Could not resolve your smart wallet. Try again shortly.");
          setMessages((m) => [...m, a]);
          setPhase("idle");
          return;
        }
      } else {
        const a = msg(
          "assistant",
          "Connect your wallet and verify ownership to use your smart wallet as a destination. Email is not required.",
        );
        setMessages((m) => [...m, a]);
        setPhase("idle");
        return;
      }
    } else if (previewBase.recipient === "__BOUND_MAIN_WALLET__") {
      if (!address) {
        const a = msg(
          "assistant",
          "Connect your wallet first so I can send to your bound main wallet address.",
        );
        setMessages((m) => [...m, a]);
        setPhase("idle");
        return;
      }
      previewBase.recipient = address;
    }

    const locked = await buildLockedPreview(previewBase);
    lockedRef.current = locked;
    setPreview(locked);
    setPhase("preview");

    let lines: string[];
    if (locked.batch && locked.batch.length > 1) {
      lines = [
        `I found ${locked.batch.length} recipients.`,
        "",
        ...locked.batch.map((r) => `${r.name} → ${r.amount} ${locked.asset}`),
        "",
        `Total: ${locked.totalAmount ?? locked.amount} ${locked.asset}`,
        `Sponsored: Eligible`,
        `Recipients: ${locked.recipientCount ?? locked.batch.length}`,
        "",
        locked.riskWarning ?? "",
        "Confirm transaction?",
        "",
        "Review the card below and tap **Confirm & Sign**. Parameters are locked after approval.",
      ].filter(Boolean);
    } else {
      lines = [
        `Here's your transfer preview:`,
        `• ${locked.action}: ${locked.amount} ${locked.asset}${locked.receiveAsset ? ` → ${locked.receiveAmount} ${locked.receiveAsset}` : ""}`,
        `• To: ${locked.recipient}`,
        `• Network: ${locked.network}`,
        `• Gas: ${locked.sponsorship}`,
        ``,
        `Review the card below and tap **Confirm & Sign** when ready. I will not execute until you approve.`,
      ];
    }

    const a = msg("assistant", lines.join("\n"));
    setMessages((m) => [...m, a]);
    void persistMessage("assistant", a.content, a.id);
  }, [memoryEnabled, persistMessage, address]);

  const confirmAndSign = useCallback(async () => {
    const current = lockedRef.current;
    if (!current) return false;

    const valid = await verifyPreviewIntegrity(current);
    if (!valid) {
      setPhase("error");
      setMessages((m) => [
        ...m,
        msg(
          "assistant",
          "Preview integrity check failed. Please ask again to generate a new preview.",
        ),
      ]);
      setPreview(null);
      lockedRef.current = null;
      return false;
    }

    setPhase("awaiting_signature");
    return true;
  }, []);

  const markExecuting = useCallback(() => {
    setPhase("executing");
  }, []);

  const updateTxCard = useCallback((record: TransactionRecord) => {
    setTxCards((prev) => {
      const idx = prev.findIndex((r) => r.id === record.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...record };
        return next;
      }
      return [record, ...prev];
    });
  }, []);

  const completeExecution = useCallback((txHash?: string, txId?: string) => {
    setPhase("complete");
    if (txId) {
      updateTxCard({
        id: txId,
        status: txHash ? "settled" : "pending",
        asset: lockedRef.current?.asset ?? "USDC",
        amount: lockedRef.current?.amount ?? "0",
        recipient: lockedRef.current?.recipient ?? "",
        txHash,
        network: "Arc Testnet",
        timestamp: Date.now(),
      });
    }
    setPreview(null);
    lockedRef.current = null;
    setTimeout(() => setPhase("idle"), 2000);
  }, [updateTxCard]);

  const failExecution = useCallback((txId: string, reason: string, txHash?: string) => {
    setPhase("error");
    updateTxCard({
      id: txId,
      status: "failed",
      asset: lockedRef.current?.asset ?? "USDC",
      amount: lockedRef.current?.amount ?? "0",
      recipient: lockedRef.current?.recipient ?? "",
      txHash,
      network: "Arc Testnet",
      timestamp: Date.now(),
      failureReason: reason,
    });
    setPreview(null);
    lockedRef.current = null;
    setTimeout(() => setPhase("idle"), 2000);
  }, [updateTxCard]);

  const cancelPreview = useCallback(() => {
    setPreview(null);
    lockedRef.current = null;
    setPhase("idle");
    setMessages((m) => [
      ...m,
      msg("assistant", "Preview cancelled. What would you like to do next?"),
    ]);
  }, []);

  return {
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
    memoryEnabled,
    resetSession,
  };
}
