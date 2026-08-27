"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { parseUserIntent } from "@/lib/agent/intent-parser";
import { buildLockedPreview, verifyPreviewIntegrity } from "@/lib/agent/preview-lock";
import type { AgentMessage, AgentPhase, TransactionPreview } from "@/lib/agent/types";
import { AGENT_NAME } from "@/lib/brand";
import { apiFetch, getApiToken } from "@/lib/api";
import type { TransactionRecord } from "@/lib/transaction-store";

const ONBOARDING_GREETING =
  "Welcome to Coretta.\nConnect your wallet or sign in to begin.";

type PendingRecipientSave = {
  stage: "offer" | "label" | "confirm";
  address: string;
  label?: string;
  transferId?: string;
};

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
  const [transactionHistoryEnabled, setTransactionHistoryEnabled] = useState(false);
  const [savedRecipientsEnabled, setSavedRecipientsEnabled] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([
    msg(
      "assistant",
      greeting ??
        `I'm ${AGENT_NAME}. Who would you like to pay?`,
    ),
  ]);
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const [preview, setPreview] = useState<TransactionPreview | null>(null);
  const [txCards, setTxCards] = useState<TransactionRecord[]>([]);
  const [pendingRecipientSave, setPendingRecipientSave] =
    useState<PendingRecipientSave | null>(null);
  const lockedRef = useRef<TransactionPreview | null>(null);

  const resetSession = useCallback(() => {
    setMessages([msg("assistant", ONBOARDING_GREETING)]);
    setPhase("idle");
    setPreview(null);
    lockedRef.current = null;
    setTxCards([]);
    setPendingRecipientSave(null);
    greetedRef.current = false;
    setConversationId(null);
    setMemoryEnabled(false);
    setTransactionHistoryEnabled(false);
    setSavedRecipientsEnabled(false);
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

  const refreshMemoryPreferences = useCallback(async () => {
    const token = getApiToken();
    if (!token) {
      setMemoryEnabled(false);
      setTransactionHistoryEnabled(false);
      setSavedRecipientsEnabled(false);
      return null;
    }
    const boot = await apiFetch<{
      actorId: string;
      memoryEnabled: boolean;
      personalizationEnabled: boolean;
      transactionHistoryEnabled: boolean;
      savedRecipientsEnabled: boolean;
    }>("/v1/ai/bootstrap", { method: "GET" });
    setMemoryEnabled(boot.memoryEnabled);
    setTransactionHistoryEnabled(boot.transactionHistoryEnabled);
    setSavedRecipientsEnabled(boot.savedRecipientsEnabled);
    return boot;
  }, []);

  useEffect(() => {
    const token = getApiToken();
    if (!token) {
      setMemoryEnabled(false);
      setTransactionHistoryEnabled(false);
      setSavedRecipientsEnabled(false);
      return;
    }
    (async () => {
      try {
        await refreshMemoryPreferences();
        const convo = await apiFetch<{ conversationId: string }>(
          "/v1/ai/conversations",
          { method: "POST", body: JSON.stringify({ title: "Coretta session" }) },
        );
        setConversationId(convo.conversationId);
      } catch {
        setMemoryEnabled(false);
        setTransactionHistoryEnabled(false);
        setSavedRecipientsEnabled(false);
      }
    })();
  }, [refreshMemoryPreferences]);

  useEffect(() => {
    const refresh = () => {
      void refreshMemoryPreferences().catch(() => {
        setTransactionHistoryEnabled(false);
        setSavedRecipientsEnabled(false);
      });
    };
    window.addEventListener("coretta-damian-preferences-updated", refresh);
    return () => window.removeEventListener("coretta-damian-preferences-updated", refresh);
  }, [refreshMemoryPreferences]);

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

    const affirmative = /^(?:yes|yeah|yep|sure|okay|ok|confirm|save it)[.!]?$/i.test(trimmed);
    const negative = /^(?:no|nope|cancel|never mind|don't save it)[.!]?$/i.test(trimmed);

    if (pendingRecipientSave) {
      if (negative) {
        setPendingRecipientSave(null);
        const content = "Okay, I won't save that address.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }

      if (pendingRecipientSave.stage === "offer") {
        const inlineLabel = /(?:save|remember)(?: it| that address)?(?: as)?\s+(.+?)[.!]?$/i.exec(
          trimmed,
        )?.[1]?.trim();
        if (affirmative && !inlineLabel) {
          setPendingRecipientSave({ ...pendingRecipientSave, stage: "label" });
          const content = "What should I call it?";
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
          setPhase("idle");
          return;
        }
        if (inlineLabel) {
          setPendingRecipientSave({
            ...pendingRecipientSave,
            stage: "confirm",
            label: inlineLabel.slice(0, 80),
          });
          const content = `Save ${pendingRecipientSave.address} as ${inlineLabel.slice(0, 80)} on Arc Testnet? This label doesn't verify who controls the wallet. Reply yes to confirm.`;
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
          setPhase("idle");
          return;
        }
      }

      if (pendingRecipientSave.stage === "label" && !affirmative) {
        const label = trimmed.slice(0, 80);
        setPendingRecipientSave({ ...pendingRecipientSave, stage: "confirm", label });
        const content = `Save ${pendingRecipientSave.address} as ${label} on Arc Testnet? This label doesn't verify who controls the wallet. Reply yes to confirm.`;
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }

      if (pendingRecipientSave.stage === "confirm") {
        if (!affirmative) {
          const content = "Reply yes to save it, or cancel to leave it unchanged.";
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
          setPhase("idle");
          return;
        }
        if (!savedRecipientsEnabled || !pendingRecipientSave.label) {
          setPendingRecipientSave(null);
          const content =
            "Saved recipients are off. Enable Saved recipients in Settings, then try again.";
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
          setPhase("idle");
          return;
        }
        try {
          await apiFetch("/v1/ai/saved-recipients", {
            method: "POST",
            body: JSON.stringify({
              label: pendingRecipientSave.label,
              address: pendingRecipientSave.address,
              network: "arc-testnet",
              createdFromTransferId: pendingRecipientSave.transferId ?? null,
              confirmed: true,
            }),
          });
          const content = `Saved as ${pendingRecipientSave.label}. I'll still show the full address before any transfer.`;
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
          setPendingRecipientSave(null);
          window.dispatchEvent(new Event("coretta-damian-recipients-updated"));
        } catch {
          const content = "I couldn't save that address. Check the label and address, then try again.";
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
        }
        setPhase("idle");
        return;
      }
    }

    const directSave = /\b(?:remember|save)\s+(0x[a-fA-F0-9]{40})\s+as\s+(.+?)[.!]?$/i.exec(
      trimmed,
    );
    if (directSave) {
      if (!savedRecipientsEnabled) {
        const content =
          "Saved recipients are off. Enable Saved recipients in Settings before asking me to remember an address.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
      const label = directSave[2].trim().slice(0, 80);
      setPendingRecipientSave({
        stage: "confirm",
        address: directSave[1],
        label,
      });
      const content = `Save ${directSave[1]} as ${label} on Arc Testnet? This label doesn't verify who controls the wallet. Reply yes to confirm.`;
      const a = msg("assistant", content);
      setMessages((m) => [...m, a]);
      void persistMessage("assistant", content, a.id);
      setPhase("idle");
      return;
    }

    const savedRecipientQuestion =
      /^(?:what(?:'s| is| was)|show me|find)\s+(.+?(?:wallet|address))[?.!]*$/i.exec(trimmed);
    if (
      savedRecipientQuestion &&
      !/^(?:my|coretta|smart|account|sca)\b/i.test(savedRecipientQuestion[1].trim())
    ) {
      if (!savedRecipientsEnabled) {
        const content =
          "Saved recipients are off, so I can't look up that address. Enable Saved recipients in Settings.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
      try {
        const resolution = await apiFetch<{
          status: "resolved" | "ambiguous" | "not_found";
          matches: Array<{ label: string; address: string; network: string }>;
        }>("/v1/ai/saved-recipients/resolve", {
          method: "POST",
          body: JSON.stringify({
            label: savedRecipientQuestion[1].trim(),
            network: "arc-testnet",
          }),
        });
        let content: string;
        if (resolution.status === "not_found" || resolution.matches.length === 0) {
          content = "I couldn't find a saved recipient matching that description.";
        } else if (resolution.status === "ambiguous") {
          content = `I found more than one match:\n\n${resolution.matches
            .map((recipient, index) => `${index + 1}. ${recipient.label}, ${recipient.address}`)
            .join("\n")}\n\nWhich address do you mean?`;
        } else {
          const recipient = resolution.matches[0];
          content = `${recipient.label} is saved at ${recipient.address} on Arc Testnet. This label doesn't verify wallet ownership.`;
        }
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      } catch {
        const content = "I couldn't look up that saved recipient right now.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
    }

    const asksForWalletAddress =
      /\b(smart\s*wallet(\s*address)?|my\s+(?:wallet\s*)?address|my\s+smart\s+wallet|sca\s*address|account\s*address)\b/i.test(
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
        const usage = await apiFetch<import("@coretta/shared").UserUsageMetrics>(usagePath);
        const remainingTx = Math.max(0, usage.sponsoredTxLimit - usage.sponsoredTxCount);
        const remainingUsd = Math.max(0, usage.sponsoredUsdLimit - usage.sponsoredUsdSpent);
        const remainingAi = Math.max(0, usage.aiRequestLimit - usage.aiRequestCount);
        const remainingOtp = Math.max(0, usage.otpRequestLimit - usage.otpRequestCount);
        const hrs = Math.floor(usage.resetInSeconds / 3600);
        const mins = Math.floor((usage.resetInSeconds % 3600) / 60);

        const lines = [
          "Live Usage Summary",
          "",
          usage.walletAddress
            ? `Wallet: ${usage.walletAddress}`
            : "Wallet: (account-level; connect a wallet for per-address tracking)",
          `Live: ${usage.live ? "yes" : "no"}`,
          `User Tier: ${usage.userTier.toUpperCase()}`,
          `Transfer volume: $${usage.sponsoredUsdSpent.toFixed(2)} / $${usage.sponsoredUsdLimit} (Remaining: $${remainingUsd.toFixed(2)})`,
          `Transfers: ${usage.sponsoredTxCount} / ${usage.sponsoredTxLimit} (Remaining: ${remainingTx})`,
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
        "Network Settlement Summary\n\nPrimary Network: Arc Testnet (Chain ID: 5042002)\nSettlement Layer: Arc Native USDC\nFinality: Sub-second deterministic (<400ms)\nFees: Circle Paymaster v0.7 can charge compatible smart accounts in USDC"
      );
      setMessages((m) => [...m, a]);
      void persistMessage("assistant", a.content, a.id);
      setPhase("idle");
      return;
    }

    let intentInput = trimmed;
    const referencesPreviousAddress =
      /\b(same|previous|last)\s+(?:recipient|address)\b/i.test(trimmed) ||
      /\baddress\s+i\s+used\s+(?:last time|before|yesterday)\b/i.test(trimmed);
    const asksHistoryQuestion =
      referencesPreviousAddress ||
      /\b(last|previous)\s+(?:successful|settled)?\s*(?:transfer|transaction)\b/i.test(trimmed) ||
      /\bwho\s+did\s+i\s+(?:send|pay)\b/i.test(trimmed) ||
      /\bwhat\s+address\s+did\s+i\s+(?:send|pay)\b/i.test(trimmed);
    const requestsPreviousAddressSend =
      /\b(send|transfer|pay)\b/i.test(trimmed) && referencesPreviousAddress;
    const historyPeriod = /\byesterday\b/i.test(trimmed)
      ? "yesterday"
      : /\blast\s+7\s+days\b/i.test(trimmed)
        ? "last_7_days"
        : /\blast\s+30\s+days\b/i.test(trimmed)
          ? "last_30_days"
          : /\bthis\s+month\b/i.test(trimmed)
            ? "this_month"
            : /\blast\s+month\b/i.test(trimmed)
              ? "last_month"
              : /\btoday\b/i.test(trimmed)
                ? "today"
                : undefined;

    if (asksHistoryQuestion) {
      if (!transactionHistoryEnabled) {
        const content =
          "I don't have permission to use your transaction history for that. Enable Use transaction history in Settings, or paste the address.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
      try {
        const response = await apiFetch<{
          transfer: null | {
            amount: string;
            asset: string;
            state: string;
            destinationAddress: string | null;
            createdAt: string;
          };
        }>(
          `/v1/ai/transactions/last-settled?timezoneOffsetMinutes=${new Date().getTimezoneOffset()}${
            historyPeriod ? `&period=${historyPeriod}` : ""
          }`,
        );
        const transfer = response.transfer;
        if (!transfer?.destinationAddress) {
          const content = "I couldn't find a settled Coretta transfer with a destination address.";
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
          setPhase("idle");
          return;
        }
        if (requestsPreviousAddressSend) {
          const amount = trimmed.match(/(\d+(?:\.\d{1,6})?)/)?.[1];
          const asset = trimmed.match(/\b(USDC|EURC)\b/i)?.[1]?.toUpperCase();
          if (!amount) {
            const content = `Your last settled destination was ${transfer.destinationAddress}. How much should I send?`;
            const a = msg("assistant", content);
            setMessages((m) => [...m, a]);
            void persistMessage("assistant", content, a.id);
            setPhase("idle");
            return;
          }
          intentInput = `Send ${amount} ${asset ?? transfer.asset} to ${transfer.destinationAddress}`;
        } else {
          const when = new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(transfer.createdAt));
          const content = `Your last settled transfer was ${transfer.amount} ${transfer.asset} to ${transfer.destinationAddress} on ${when}.`;
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
          setPhase("idle");
          return;
        }
      } catch {
        const content = "I couldn't retrieve your transaction history right now.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
    }

    const totalForRecipient = /\bhow much (?:have )?i (?:sent|paid)(?: to)?\s+(.+?)[?.!]*$/i.exec(
      trimmed,
    );
    if (totalForRecipient) {
      if (!transactionHistoryEnabled) {
        const content =
          "I don't have permission to use your transaction history for that. Enable Use transaction history in Settings.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
      try {
        const rawLabel = totalForRecipient[1].trim();
        const label = rawLabel
          .replace(/\s+(?:today|yesterday|this month|last month|last 7 days|last 30 days)$/i, "")
          .trim();
        const summary = await apiFetch<{
          totals: Array<{ amount: string; count: number; asset: string }>;
        }>(
          "/v1/ai/transactions/summary",
          {
            method: "POST",
            body: JSON.stringify({
              label,
              period: historyPeriod,
              timezoneOffsetMinutes: new Date().getTimezoneOffset(),
            }),
          },
        );
        const content = summary.totals.length
          ? `You've sent ${summary.totals
              .map((total) => `${total.amount} ${total.asset}`)
              .join(" and ")} across ${summary.totals.reduce((count, total) => count + total.count, 0)} settled transfer${
              summary.totals.reduce((count, total) => count + total.count, 0) === 1 ? "" : "s"
            }.`
          : "I couldn't find any settled transfers matching that recipient and period.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      } catch {
        const content = "I couldn't resolve that saved recipient or calculate the settled total.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
    }

    const result = parseUserIntent(intentInput);
    if (!result.ok) {
      let content = result.message;
      if (result.reason !== "blocked" && getApiToken()) {
        try {
          const response = await apiFetch<{ available: boolean; reply: string | null }>(
            "/v1/ai/respond",
            {
              method: "POST",
              body: JSON.stringify({ conversationId, message: trimmed }),
            },
          );
          if (response.available && response.reply) content = response.reply;
        } catch {
          // Keep the local, deterministic response when the optional model is unavailable.
        }
      }
      const a = msg("assistant", content);
      setMessages((m) => [...m, a]);
      void persistMessage("assistant", content, a.id);
      setPhase("idle");
      return;
    }

    const previewBase = { ...result.preview };
    const recipientLooksLikeAddress = /0x[a-fA-F0-9]{40}/.test(previewBase.recipient);
    const recipientLooksLikeEmail = /[\w.+-]+@[\w.-]+\.\w+/.test(previewBase.recipient);
    const recipientIsPlaceholder = previewBase.recipient.startsWith("__BOUND_");
    const isSend = previewBase.action === "sendUSDC" || previewBase.action === "sendEURC";

    if (
      isSend &&
      !recipientLooksLikeAddress &&
      !recipientLooksLikeEmail &&
      !recipientIsPlaceholder
    ) {
      if (!savedRecipientsEnabled) {
        const content =
          "Saved recipients are off, so I can't resolve that label. Paste the full address or enable Saved recipients in Settings.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
      try {
        const resolution = await apiFetch<{
          status: "resolved" | "ambiguous" | "not_found";
          matches: Array<{
            id: string;
            label: string;
            address: string;
            isPreferred: boolean;
          }>;
        }>("/v1/ai/saved-recipients/resolve", {
          method: "POST",
          body: JSON.stringify({ label: previewBase.recipient, network: "arc-testnet" }),
        });
        if (resolution.status === "not_found" || resolution.matches.length === 0) {
          const content = `I don't have a saved address for ${previewBase.recipient}. Paste the full address or save it in Settings.`;
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
          setPhase("idle");
          return;
        }
        if (resolution.status === "ambiguous") {
          const options = resolution.matches
            .map(
              (recipient, index) =>
                `${index + 1}. ${recipient.label}, ${recipient.address.slice(0, 8)}...${recipient.address.slice(-6)}`,
            )
            .join("\n");
          const content = `I found more than one saved address for ${previewBase.recipient}:\n\n${options}\n\nPaste the address you want to use.`;
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
          setPhase("idle");
          return;
        }
        const recipient = resolution.matches[0];
        previewBase.recipient = `${recipient.label}, ${recipient.address}`;
      } catch {
        const content = "I couldn't resolve that saved recipient right now.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
    }

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
        ...(locked.sponsorship === "user-paid" && locked.transactionFee
          ? [`Transaction fee: ${locked.transactionFee}`]
          : []),
        `Recipients: ${locked.recipientCount ?? locked.batch.length}`,
        "",
        locked.riskWarning ?? "",
        "Confirm transaction?",
        "",
        "Review the card below and tap Confirm & Sign. Parameters are locked after approval.",
      ].filter(Boolean);
    } else {
      lines = [
        `Here's your transfer preview:`,
        `• ${locked.action}: ${locked.amount} ${locked.asset}${locked.receiveAsset ? ` → ${locked.receiveAmount} ${locked.receiveAsset}` : ""}`,
        `• To: ${locked.recipient}`,
        `• Network: ${locked.network}`,
        ...(locked.sponsorship === "user-paid" && locked.transactionFee
          ? [`• Transaction fee: ${locked.transactionFee}`]
          : []),
        ``,
        `Review the card below and tap Confirm & Sign when ready. I will not execute until you approve.`,
      ];
    }

    const a = msg("assistant", lines.join("\n"));
    setMessages((m) => [...m, a]);
    void persistMessage("assistant", a.content, a.id);
  }, [
    address,
    conversationId,
    pendingRecipientSave,
    persistMessage,
    savedRecipientsEnabled,
    transactionHistoryEnabled,
  ]);

  const confirmAndSign = useCallback(async (requiresWalletSignature = true) => {
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

    setPhase(requiresWalletSignature ? "awaiting_signature" : "executing");
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

  const completeExecution = useCallback((
    txHash?: string,
    txId?: string,
    settlement?: { transferId?: string },
  ) => {
    const completedPreview = lockedRef.current;
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
    if (txHash && completedPreview) {
      const completion = msg(
        "assistant",
        `Done. ${completedPreview.amount} ${completedPreview.asset} went through.`,
      );
      setMessages((m) => [...m, completion]);
      void persistMessage("assistant", completion.content, completion.id);

      const addressMatch = /^0x[a-fA-F0-9]{40}$/.exec(completedPreview.recipient.trim());
      if (savedRecipientsEnabled && addressMatch) {
        void apiFetch<{ recipients: Array<{ address: string }> }>(
          "/v1/ai/saved-recipients",
        )
          .then((result) => {
            const alreadySaved = result.recipients.some(
              (recipient) => recipient.address.toLowerCase() === addressMatch[0].toLowerCase(),
            );
            if (alreadySaved) return;
            setPendingRecipientSave({
              stage: "offer",
              address: addressMatch[0],
              transferId: settlement?.transferId,
            });
            const offer = msg("assistant", "Want me to save that address for next time?");
            setMessages((m) => [...m, offer]);
            void persistMessage("assistant", offer.content, offer.id);
          })
          .catch(() => undefined);
      }
    }
    setPreview(null);
    lockedRef.current = null;
    setTimeout(() => setPhase("idle"), 2000);
  }, [persistMessage, savedRecipientsEnabled, updateTxCard]);

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
