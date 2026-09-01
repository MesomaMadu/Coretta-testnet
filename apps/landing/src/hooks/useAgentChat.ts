"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { parseUserIntent } from "@/lib/agent/intent-parser";
import {
  isPendingBridgeRecipientAnswer,
  isTransactionRetryRequest,
} from "@/lib/agent/follow-up";
import { TRANSACTION_DELAY_NOTICE_MS } from "@/lib/agent/execution-delay";
import { allocateEqualAmounts, assessBatchRisk } from "@/lib/agent/multi-send";
import { parseDamianHistoryQuery } from "@/lib/agent/history-query";
import {
  answerDamianProductQuestion,
  formatDamianRouteAnswer,
  isDamianRouteQuestion,
  type DamianBridgeDestination,
} from "@/lib/agent/capabilities";
import { buildLockedPreview, verifyPreviewIntegrity } from "@/lib/agent/preview-lock";
import {
  composeDamianResponse,
  inferDamianResponseLength,
  redactDamianContentForPersistence,
  type DamianResponseLength,
} from "@/lib/agent/responses";
import type {
  AgentMessage,
  AgentPhase,
  ConversationSummary,
  TransactionPreview,
  TransactionDraft,
} from "@/lib/agent/types";
import { AGENT_NAME } from "@/lib/brand";
import { apiFetch, getApiToken } from "@/lib/api";
import {
  reconcileTransactionApproval,
  upsertTransaction,
  type ApprovalTransferSnapshot,
  type TransactionRecord,
} from "@/lib/transaction-store";
import { humanizeTxFailure } from "@/lib/tx-errors";
import { detectPromptInjection } from "@/lib/agent/security";
import {
  BOUND_MAIN_WALLET,
  BOUND_SMART_WALLET,
  displayAccountWalletRecipient,
  resolveAccountWalletRecipient,
  type AccountWalletBindings,
  type AccountWalletPlaceholder,
} from "@/lib/agent/wallet-recipient";

const ONBOARDING_GREETING =
  "Welcome to Coretta.\nConnect your wallet or sign in to begin.";

function decimalToMicro(value: string): bigint {
  const [whole, fraction = ""] = value.trim().split(".");
  return BigInt(`${whole || "0"}${fraction.padEnd(6, "0").slice(0, 6)}`);
}

function summarizeBatchAllocation(
  batch: TransactionPreview["batch"],
  asset: string,
  allocation?: TransactionPreview["allocation"],
): string {
  if (!batch?.length) return "";
  const amounts = batch.map((recipient) => recipient.amount);
  const unique = [...new Set(amounts)];
  if (allocation === "equal-output") {
    const range = unique.length === 1 ? unique[0] : `${unique[unique.length - 1]} to ${unique[0]}`;
    return `Allocation: even split across ${batch.length} wallets, ${range} ${asset} each`;
  }
  if (allocation === "random") {
    return `Allocation: varied locked amounts across ${batch.length} wallets`;
  }
  if (unique.length === 1) {
    return `Allocation: ${unique[0]} ${asset} each across ${batch.length} wallets`;
  }
  const micros = amounts.map(decimalToMicro);
  const minimum = amounts[micros.indexOf(micros.reduce((a, b) => (a < b ? a : b)))];
  const maximum = amounts[micros.indexOf(micros.reduce((a, b) => (a > b ? a : b)))];
  return `Allocation: custom amounts from ${minimum} to ${maximum} ${asset} per wallet`;
}

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
    delivery: "sent",
  };
}

export function useAgentChat(greeting?: string) {
  const { address } = useAccount();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
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
  const txCardsRef = useRef<TransactionRecord[]>([]);
  const [executionsInFlight, setExecutionsInFlight] = useState(0);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [pendingRecipientSave, setPendingRecipientSave] =
    useState<PendingRecipientSave | null>(null);
  const lockedRef = useRef<TransactionPreview | null>(null);
  const pendingDraftRef = useRef<{ draft: TransactionDraft; token: string | null } | null>(null);
  const lastFailedDraftRef = useRef<{ draft: TransactionDraft; token: string | null } | null>(null);
  const lastTerminalWasFailureRef = useRef(false);
  const intentEpochRef = useRef(0);
  const conversationIdRef = useRef<string | null>(null);
  const conversationCreatePromiseRef = useRef<Promise<string> | null>(null);
  const executionDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseLengthRef = useRef<DamianResponseLength>("standard");
  const executionResponseLengthRef = useRef<DamianResponseLength>("standard");
  const initializedSessionTokenRef = useRef<string | null>(null);
  const observedIncomingRef = useRef(new Set<string>());
  const incomingRefreshRef = useRef(false);
  const approvalDecisionsRef = useRef(new Set<string>());

  const resetSession = useCallback(() => {
    pendingDraftRef.current = null;
    lastFailedDraftRef.current = null;
    lastTerminalWasFailureRef.current = false;
    intentEpochRef.current += 1;
    setMessages([msg("assistant", ONBOARDING_GREETING)]);
    setPhase("idle");
    setPreview(null);
    lockedRef.current = null;
    setTxCards([]);
    txCardsRef.current = [];
    setPendingRecipientSave(null);
    greetedRef.current = false;
    setConversationId(null);
    conversationIdRef.current = null;
    conversationCreatePromiseRef.current = null;
    setMemoryEnabled(false);
    setTransactionHistoryEnabled(false);
    setSavedRecipientsEnabled(false);
    setConversations([]);
    setHistoryOpen(false);
    setExecutionsInFlight(0);
    responseLengthRef.current = "standard";
    executionResponseLengthRef.current = "standard";
    initializedSessionTokenRef.current = null;
    observedIncomingRef.current.clear();
    incomingRefreshRef.current = false;
    approvalDecisionsRef.current.clear();
    if (executionDelayTimerRef.current) {
      clearTimeout(executionDelayTimerRef.current);
      executionDelayTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      if (executionDelayTimerRef.current) clearTimeout(executionDelayTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const onDisconnect = () => resetSession();
    const onRestore = (e: Event) => {
      pendingDraftRef.current = null;
      lastFailedDraftRef.current = null;
      lastTerminalWasFailureRef.current = false;
      intentEpochRef.current += 1;
      const detail = (e as CustomEvent<{ message: string }>).detail;
      if (!detail?.message) return;
      setMessages([msg("assistant", detail.message)]);
      greetedRef.current = true;
      setPhase("idle");
      setPreview(null);
      lockedRef.current = null;
      setTxCards([]);
      txCardsRef.current = [];
    };
    window.addEventListener("coretta-wallet-disconnect", onDisconnect);
    window.addEventListener("coretta-session-restored", onRestore);
    return () => {
      window.removeEventListener("coretta-wallet-disconnect", onDisconnect);
      window.removeEventListener("coretta-session-restored", onRestore);
    };
  }, [resetSession]);

  useEffect(() => {
    const syncSession = () => {
      if (!getApiToken()) {
        resetSession();
        return;
      }
      setSessionVersion((version) => version + 1);
    };
    window.addEventListener("coretta-api-session-updated", syncSession);
    return () => window.removeEventListener("coretta-api-session-updated", syncSession);
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

  const refreshConversations = useCallback(async () => {
    if (!getApiToken()) {
      setConversations([]);
      return [] as ConversationSummary[];
    }
    const response = await apiFetch<{ conversations: ConversationSummary[] }>(
      "/v1/ai/conversations",
    );
    setConversations(response.conversations);
    return response.conversations;
  }, []);

  const ensureConversation = useCallback(async () => {
    if (conversationIdRef.current) return conversationIdRef.current;
    if (!getApiToken()) return null;
    if (!conversationCreatePromiseRef.current) {
      conversationCreatePromiseRef.current = apiFetch<{ conversationId: string }>(
        "/v1/ai/conversations",
        { method: "POST", body: JSON.stringify({}) },
      )
        .then((result) => {
          conversationIdRef.current = result.conversationId;
          setConversationId(result.conversationId);
          return result.conversationId;
        })
        .finally(() => {
          conversationCreatePromiseRef.current = null;
        });
    }
    return conversationCreatePromiseRef.current;
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    if (executionsInFlight > 0) return;
    pendingDraftRef.current = null;
    intentEpochRef.current += 1;
    const response = await apiFetch<{
      conversation: { id: string; title: string; status: "ACTIVE" | "ARCHIVED" };
      messages: Array<{
        id: string;
        role: AgentMessage["role"];
        content: string;
        createdAt: string;
      }>;
    }>(`/v1/ai/conversations/${id}/messages`);
    if (response.conversation.status === "ARCHIVED") {
      await apiFetch(`/v1/ai/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ACTIVE" }),
      });
      setConversations((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: "ACTIVE" as const } : item,
        ),
      );
    }
    setConversationId(response.conversation.id);
    conversationIdRef.current = response.conversation.id;
    setMessages(
      response.messages.length
        ? response.messages.map((message) => ({
            id: `history_${message.id}`,
            serverId: message.id,
            role: message.role,
            content: message.content,
            timestamp: new Date(message.createdAt).getTime(),
            delivery: "sent",
          }))
        : [msg("assistant", greeting ?? `I'm ${AGENT_NAME}. Who would you like to pay?`)],
    );
    setPreview(null);
    lockedRef.current = null;
    setPhase("idle");
    setHistoryOpen(false);
  }, [greeting, executionsInFlight]);

  const startNewConversation = useCallback(async () => {
    if (executionsInFlight > 0) return;
    pendingDraftRef.current = null;
    lastFailedDraftRef.current = null;
    lastTerminalWasFailureRef.current = false;
    intentEpochRef.current += 1;
    setConversationId(null);
    conversationIdRef.current = null;
    conversationCreatePromiseRef.current = null;
    setMessages([msg("assistant", greeting ?? `I'm ${AGENT_NAME}. Who would you like to pay?`)]);
    setPreview(null);
    lockedRef.current = null;
    setTxCards([]);
    txCardsRef.current = [];
    setPhase("idle");
    setHistoryOpen(false);
    await refreshConversations();
  }, [greeting, refreshConversations, executionsInFlight]);

  const archiveConversation = useCallback(async (id: string) => {
    await apiFetch(`/v1/ai/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    const next = await refreshConversations();
    if (conversationId === id) {
      const replacement = next.find((item) => item.status === "ACTIVE" && item.id !== id);
      if (replacement) await loadConversation(replacement.id);
      else await startNewConversation();
    }
  }, [conversationId, loadConversation, refreshConversations, startNewConversation]);

  useEffect(() => {
    const token = getApiToken();
    if (!token) {
      setMemoryEnabled(false);
      setTransactionHistoryEnabled(false);
      setSavedRecipientsEnabled(false);
      return;
    }
    if (initializedSessionTokenRef.current === token) return;
    initializedSessionTokenRef.current = token;
    (async () => {
      try {
        const session = await apiFetch<{
          memoryEnabled: boolean;
          transactionHistoryEnabled: boolean;
          savedRecipientsEnabled: boolean;
          conversations: ConversationSummary[];
        }>("/v1/ai/session");
        if (getApiToken() !== token) return;
        setMemoryEnabled(session.memoryEnabled);
        setTransactionHistoryEnabled(session.transactionHistoryEnabled);
        setSavedRecipientsEnabled(session.savedRecipientsEnabled);
        setConversations(session.conversations);
        setConversationId(null);
        conversationIdRef.current = null;
        conversationCreatePromiseRef.current = null;
        setMessages([msg("assistant", greeting ?? `I'm ${AGENT_NAME}. Who would you like to pay?`)]);
        setPreview(null);
        lockedRef.current = null;
        setTxCards([]);
        txCardsRef.current = [];
        setPhase("idle");
      } catch {
        initializedSessionTokenRef.current = null;
        setMemoryEnabled(false);
        setTransactionHistoryEnabled(false);
        setSavedRecipientsEnabled(false);
      }
    })();
  }, [greeting, sessionVersion]);

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
        const persistedContent = redactDamianContentForPersistence(content);
        const res = await apiFetch<{ messageId: string }>("/v1/ai/messages", {
          method: "POST",
          body: JSON.stringify({
          conversationId: conversationIdRef.current ?? (await ensureConversation()),
            role,
            content: persistedContent,
            contentSummary: persistedContent.slice(0, 280),
            clientMessageId: clientId,
          }),
        });
        return res.messageId;
      } catch {
        return undefined;
      }
    },
    [ensureConversation],
  );

  const refreshIncoming = useCallback(async () => {
    if (!getApiToken() || document.visibilityState !== "visible" || incomingRefreshRef.current) return;
    incomingRefreshRef.current = true;
    try {
      const [approvalResult, notificationResult] = await Promise.all([
        apiFetch<{ approvals: Array<ApprovalTransferSnapshot & { amount: string; asset: string; counterparty: string; expiresAt: string }> }>("/v1/approvals"),
        apiFetch<{ notifications: Array<{ id: string; type: string; title: string; body: string; read: boolean; transferId?: string; approvalId?: string }> }>("/v1/notifications"),
      ]);
      const incomingRequests = approvalResult.approvals.filter((approval) => approval.direction === "incoming" && approval.status === "PENDING");
      const received = notificationResult.notifications.filter(
        (notification) => notification.type === "TRANSFER_RECEIVED" && !notification.read,
      );
      const outgoingApprovals = approvalResult.approvals.filter(
        (approval) => approval.direction === "outgoing",
      );
      if (outgoingApprovals.length && txCardsRef.current.length) {
        const currentCards = txCardsRef.current;
        const nextCards = currentCards.map((card) =>
          outgoingApprovals.reduce(
            (current, approval) => reconcileTransactionApproval(current, approval),
            card,
          ),
        );
        if (nextCards.some((card, index) => card !== currentCards[index])) {
          txCardsRef.current = nextCards;
          setTxCards(nextCards);
          nextCards.forEach((card, index) => {
            if (card !== currentCards[index]) upsertTransaction(card);
          });
        }
      }
      const newMessages: AgentMessage[] = [];
      for (const approval of incomingRequests) {
        const key = `approval:${approval.id}`;
        if (observedIncomingRef.current.has(key)) continue;
        observedIncomingRef.current.add(key);
        newMessages.push({
          ...msg("assistant", `Incoming payment request from ${approval.counterparty}: ${approval.amount} ${approval.asset}. It expires ${new Date(approval.expiresAt).toLocaleString()}. Nothing is submitted on-chain unless you accept.`),
          kind: "approval_offer",
          approvalId: approval.id,
          approvalStatus: "pending",
        });
      }
      for (const notification of received) {
        const key = `notification:${notification.id}`;
        if (observedIncomingRef.current.has(key)) continue;
        observedIncomingRef.current.add(key);
        newMessages.push(msg("assistant", `${notification.title}: ${notification.body}`));
      }
      if (received.length) {
        void Promise.allSettled(
          received.map((notification) =>
            apiFetch(`/v1/notifications/${encodeURIComponent(notification.id)}/read`, {
              method: "PATCH",
            }),
          ),
        );
      }
      const senderStatusTypes = new Set([
        "TRANSFER_APPROVAL_ACCEPTED",
        "TRANSFER_SETTLED",
        "TRANSFER_APPROVAL_REJECTED",
        "TRANSFER_APPROVAL_EXPIRED",
        "TRANSFER_POLICY_DENIED",
        "TRANSFER_FAILED",
      ]);
      const terminalTransferIds = new Set(
        notificationResult.notifications
          .filter((notification) =>
            [
              "TRANSFER_SETTLED",
              "TRANSFER_APPROVAL_REJECTED",
              "TRANSFER_APPROVAL_EXPIRED",
              "TRANSFER_POLICY_DENIED",
              "TRANSFER_FAILED",
            ].includes(notification.type),
          )
          .map((notification) => notification.transferId)
          .filter((transferId): transferId is string => Boolean(transferId)),
      );
      for (const notification of notificationResult.notifications) {
        if (!senderStatusTypes.has(notification.type)) continue;
        if (
          notification.type === "TRANSFER_APPROVAL_ACCEPTED" &&
          notification.transferId &&
          terminalTransferIds.has(notification.transferId)
        ) {
          continue;
        }
        const matchesCurrentTransfer = txCardsRef.current.some(
          (card) =>
            (notification.transferId && card.transferId === notification.transferId) ||
            (notification.approvalId && card.approvalId === notification.approvalId),
        );
        if (!matchesCurrentTransfer) continue;
        const key = `sender-notification:${notification.id}`;
        if (observedIncomingRef.current.has(key)) continue;
        observedIncomingRef.current.add(key);
        newMessages.push(msg("assistant", `${notification.title}. ${notification.body}`));
      }
      if (newMessages.length) setMessages((current) => [...current, ...newMessages]);
    } catch {
      // The approvals panel remains the fallback when background refresh is unavailable.
    } finally {
      incomingRefreshRef.current = false;
    }
  }, []);

  useEffect(() => {
    void refreshIncoming();
    const timer = window.setInterval(() => void refreshIncoming(), 15_000);
    const onSession = () => void refreshIncoming();
    window.addEventListener("coretta-api-session-updated", onSession);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("coretta-api-session-updated", onSession);
    };
  }, [refreshIncoming, sessionVersion]);

  const decideIncomingApproval = useCallback(async (approvalId: string, decision: "accept" | "reject") => {
    if (decision === "reject" && !window.confirm("Reject this payment request? It will not be submitted on-chain.")) return;
    if (approvalDecisionsRef.current.has(approvalId)) return;
    approvalDecisionsRef.current.add(approvalId);
    try {
      await apiFetch(`/v1/approvals/${approvalId}/${decision}`, { method: "POST" });
      setMessages((current) => current.map((message) =>
        message.approvalId === approvalId
          ? { ...message, approvalStatus: decision === "accept" ? "accepted" : "rejected", content: `${message.content}\n\n${decision === "accept" ? "Accepted. Coretta is now submitting the approved payment." : "Rejected. Nothing was submitted on-chain."}` }
          : message,
      ));
      window.dispatchEvent(new Event("coretta-approvals-updated"));
    } catch (decisionError) {
      approvalDecisionsRef.current.delete(approvalId);
      const failure = msg("assistant", decisionError instanceof Error ? `I couldn't ${decision} that payment request: ${decisionError.message}` : `I couldn't ${decision} that payment request.`);
      setMessages((current) => [...current, failure]);
    }
  }, []);

  const submitUserMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const requestEpoch = ++intentEpochRef.current;
    const sessionToken = getApiToken();
    const requestIsCurrent = () => intentEpochRef.current === requestEpoch && getApiToken() === sessionToken;
    const responseLength = inferDamianResponseLength(trimmed);
    responseLengthRef.current = responseLength;

    const userLocal = { ...msg("user", trimmed), delivery: "sending" as const };
    setMessages((m) => [...m, userLocal]);
    void persistMessage("user", trimmed, userLocal.id).then((serverId) => {
      setMessages((m) =>
        m.map((x) =>
          x.id === userLocal.id
            ? { ...x, serverId, delivery: serverId ? "sent" : "failed" }
            : x,
        ),
      );
    });
    setPhase("thinking");
    setPreview(null);
    if (executionsInFlight === 0) lockedRef.current = null;

    const blockedReply = detectPromptInjection(trimmed);
    if (blockedReply) {
      const response = msg("assistant", blockedReply);
      setMessages((messages) => [...messages, response]);
      void persistMessage("assistant", blockedReply, response.id);
      setPhase("idle");
      return;
    }

    await new Promise((r) => setTimeout(r, 400));
    if (!requestIsCurrent()) return;

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

    let productAnswer: string | null = null;
    if (isDamianRouteQuestion(trimmed)) {
      try {
        const registry = await apiFetch<{
          sourceChain: string;
          token: "USDC";
          destinations: DamianBridgeDestination[];
        }>("/v1/bridge/chains");
        productAnswer = formatDamianRouteAnswer(registry.destinations);
      } catch {
        productAnswer = answerDamianProductQuestion(trimmed);
      }
    } else {
      productAnswer = answerDamianProductQuestion(trimmed);
    }
    if (productAnswer) {
      const answer = msg("assistant", productAnswer);
      setMessages((current) => [...current, answer]);
      void persistMessage("assistant", productAnswer, answer.id);
      setPhase("idle");
      return;
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

    const activePendingDraft =
      pendingDraftRef.current?.token === sessionToken
        ? pendingDraftRef.current.draft
        : null;
    const answersPendingBridgeRecipient = isPendingBridgeRecipientAnswer(
      trimmed,
      activePendingDraft,
    );

    if (asksForBalanceOrWallet && !answersPendingBridgeRecipient) {
      try {
        const token = getApiToken();
        if (token) {
          const me = await apiFetch<{
            walletAddress?: string;
            balanceUsdc: string;
            balanceEurc: string;
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
            `EURC:\n${me.balanceEurc}`,
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
        "Network Settlement Summary\n\nPrimary Network: Arc Testnet (Chain ID: 5042002)\nSettlement Layer: Arc Native USDC\nFinality: Sub-second finality is a core Arc property\nFees: Circle Paymaster v0.7 can charge compatible smart accounts in USDC"
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
        const content = composeDamianResponse(
          { event: "history_permission_required" },
          { length: responseLength },
        );
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
      try {
        const response = await apiFetch<{
          transfer: null | {
            id: string;
            direction: "sent" | "received";
            amount: string;
            asset: string;
            state: string;
            destinationAddress: string | null;
            counterpartyAddress: string | null;
            txHash: string | null;
            failureReason: string | null;
            createdAt: string;
            settledAt: string | null;
          };
        }>(
          `/v1/ai/transactions/last-settled?timezoneOffsetMinutes=${new Date().getTimezoneOffset()}${
            historyPeriod ? `&period=${historyPeriod}` : ""
          }`,
        );
        const transfer = response.transfer;
        if (!transfer?.destinationAddress) {
          const content = composeDamianResponse(
            { event: "history_empty" },
            { length: responseLength },
          );
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
          const content = composeDamianResponse(
            { event: "history_list", items: [transfer] },
            { length: responseLength, seed: transfer.id },
          );
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
          setPhase("idle");
          return;
        }
      } catch {
        const content = composeDamianResponse(
          { event: "history_unavailable" },
          { length: responseLength },
        );
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
        const content = composeDamianResponse(
          { event: "history_permission_required" },
          { length: responseLength },
        );
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

    const historyQuery = parseDamianHistoryQuery(trimmed);
    if (historyQuery) {
      if (!transactionHistoryEnabled) {
        const content = composeDamianResponse(
          { event: "history_permission_required" },
          { length: responseLength },
        );
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
      try {
        const response = await apiFetch<{
          transfers: Array<{
            id: string;
            direction: "sent" | "received";
            amount: string;
            asset: string;
            state: string;
            destinationAddress: string | null;
            counterpartyAddress: string | null;
            txHash: string | null;
            failureReason: string | null;
            createdAt: string;
            settledAt: string | null;
          }>;
        }>("/v1/ai/transactions/search", {
          method: "POST",
          body: JSON.stringify({
            ...historyQuery,
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          }),
        });
        const content = response.transfers.length
          ? composeDamianResponse(
              {
                event: "history_list",
                items: response.transfers.map((transfer) => ({
                  ...transfer,
                  failureReason: transfer.failureReason
                    ? humanizeTxFailure(new Error(transfer.failureReason))
                    : null,
                })),
              },
              { length: responseLength, seed: trimmed },
            )
          : composeDamianResponse(
              { event: "history_empty" },
              { length: responseLength },
            );
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      } catch {
        const content = composeDamianResponse(
          { event: "history_unavailable" },
          { length: responseLength },
        );
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
    }

    const retryRequested = isTransactionRetryRequest(trimmed);
    const explicitlyFailedRetry = /\bfailed\b/i.test(trimmed);
    const failedDraft =
      lastFailedDraftRef.current?.token === sessionToken &&
      (lastTerminalWasFailureRef.current || explicitlyFailedRetry)
        ? lastFailedDraftRef.current.draft
        : null;
    const previous = retryRequested
      ? failedDraft
      : activePendingDraft;
    const result = parseUserIntent(intentInput, previous);
    if (!result.ok) {
      if (result.draft) {
        pendingDraftRef.current = {
          draft: structuredClone(result.draft),
          token: sessionToken,
        };
      }
      let content = result.message;
      if (result.reason !== "blocked" && !result.requiresClarification && getApiToken()) {
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

    if (executionsInFlight > 0) {
      const content = composeDamianResponse(
        { event: "transaction_busy" },
        { length: responseLength },
      );
      const a = msg("assistant", content);
      setMessages((m) => [...m, a]);
      void persistMessage("assistant", content, a.id);
      setPhase("idle");
      return;
    }

    const previewBase = { ...result.preview };
    if (!requestIsCurrent()) return;
    pendingDraftRef.current = { draft: structuredClone(result.preview), token: sessionToken };
    const preparingContent = composeDamianResponse(
      {
        event: "transaction_preparing",
        facts: {
          action: previewBase.action,
          receiveAsset: previewBase.receiveAsset,
          amount: previewBase.amount,
          asset: previewBase.asset,
          recipient: displayAccountWalletRecipient(previewBase.recipient),
          network: previewBase.network,
        },
      },
      { length: responseLength, seed: `${trimmed}:preparing` },
    );
    const preparingMessage = msg("assistant", preparingContent);
    setMessages((messages) => [...messages, preparingMessage]);
    void persistMessage("assistant", preparingContent, preparingMessage.id);

    const recipientLooksLikeAddress = /0x[a-fA-F0-9]{40}/.test(previewBase.recipient);
    const recipientLooksLikeEmail = /[\w.+-]+@[\w.-]+\.\w+/.test(previewBase.recipient);
    const recipientIsPlaceholder = previewBase.recipient.startsWith("__BOUND_");
    const isSend =
      previewBase.action === "sendUSDC" ||
      previewBase.action === "sendEURC" ||
      previewBase.action === "swapAndSend";

    if (
      isSend &&
      !previewBase.batch?.length &&
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

    if (isSend && previewBase.batch?.length) {
      const resolvedBatch = [];
      for (const entry of previewBase.batch) {
        if (entry.identityType !== "name") {
          resolvedBatch.push(entry);
          continue;
        }
        if (!savedRecipientsEnabled) {
          const content = `Saved recipients are off, so I can't resolve ${entry.name}. Paste a full address or email, or enable Saved recipients in Settings.`;
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
          setPhase("idle");
          return;
        }
        const resolution = await apiFetch<{
          status: "resolved" | "ambiguous" | "not_found";
          matches: Array<{ label: string; address: string }>;
        }>("/v1/ai/saved-recipients/resolve", {
          method: "POST",
          body: JSON.stringify({ label: entry.name, network: "arc-testnet" }),
        });
        if (resolution.status !== "resolved" || resolution.matches.length !== 1) {
          const content = `I couldn't resolve ${entry.name} to one saved address. Use the exact full address or email before I prepare this plan.`;
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
          setPhase("idle");
          return;
        }
        resolvedBatch.push({
          ...entry,
          name: resolution.matches[0].address,
          displayAddress: resolution.matches[0].address,
          identityType: "address" as const,
        });
      }
      previewBase.batch = resolvedBatch;
    }

    const batchUsesAccountWallet = previewBase.batch?.some(
      (entry) =>
        entry.name === BOUND_SMART_WALLET || entry.name === BOUND_MAIN_WALLET,
    );
    if (batchUsesAccountWallet && previewBase.batch) {
      if (!getApiToken()) {
        const content =
          "Sign in to Coretta first so I can resolve the wallets attached to your account.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
      try {
        const bindings = await apiFetch<AccountWalletBindings>("/v1/me");
        const resolvedBatch = [];
        for (const entry of previewBase.batch) {
          if (
            entry.name !== BOUND_SMART_WALLET &&
            entry.name !== BOUND_MAIN_WALLET
          ) {
            resolvedBatch.push(entry);
            continue;
          }
          const resolved = resolveAccountWalletRecipient(
            entry.name as AccountWalletPlaceholder,
            bindings,
          );
          if (!resolved.ok) {
            const content =
              resolved.reason === "smart_wallet_missing"
                ? "Your Coretta smart wallet is not ready yet. Complete account setup before bridging to it."
                : "No external wallet is linked to this Coretta account. Link and verify one in Settings, or use your Coretta smart wallet instead.";
            const a = msg("assistant", content);
            setMessages((m) => [...m, a]);
            void persistMessage("assistant", content, a.id);
            setPhase("idle");
            return;
          }
          resolvedBatch.push({
            ...entry,
            name: resolved.address,
            displayAddress: resolved.address,
            identityType: "address" as const,
          });
        }
        previewBase.batch = resolvedBatch;
      } catch {
        const content =
          "I couldn't resolve the wallets attached to your Coretta account. Try again shortly.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
    }

    if (
      previewBase.recipient === BOUND_SMART_WALLET ||
      previewBase.recipient === BOUND_MAIN_WALLET
    ) {
      const token = getApiToken();
      if (!token) {
        const a = msg(
          "assistant",
          "Sign in to Coretta first so I can resolve the wallet already attached to your account.",
        );
        setMessages((m) => [...m, a]);
        setPhase("idle");
        return;
      }
      try {
        const placeholder = previewBase.recipient as AccountWalletPlaceholder;
        const bindings = await apiFetch<AccountWalletBindings>("/v1/me");
        const resolved = resolveAccountWalletRecipient(placeholder, bindings);
        if (!resolved.ok) {
          const content =
            resolved.reason === "smart_wallet_missing"
              ? "Your Coretta smart wallet is not provisioned yet. Complete account setup before bridging to it."
              : "No external wallet is linked to this Coretta account. Link and verify one in Settings, or say “my Coretta wallet” instead.";
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
          setPhase("idle");
          return;
        }
        // Keep the full account-bound address through risk checks, estimates, and execution.
        previewBase.recipient = resolved.address;
      } catch {
        const content = "I couldn't resolve the wallet attached to your Coretta account. Try again shortly.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
    }

    const riskGroups = new Map<string, string[]>();
    for (const entry of previewBase.batch ?? []) {
      if (entry.identityType !== "address") continue;
      const chain =
        entry.destinationChain ?? previewBase.destinationChain ?? "Arc_Testnet";
      const addresses = riskGroups.get(chain) ?? [];
      addresses.push(entry.name);
      riskGroups.set(chain, addresses);
    }
    if (/^0x[a-fA-F0-9]{40}$/.test(previewBase.recipient)) {
      const chain = previewBase.destinationChain ?? "Arc_Testnet";
      const addresses = riskGroups.get(chain) ?? [];
      addresses.push(previewBase.recipient);
      riskGroups.set(chain, addresses);
    }
    if (riskGroups.size > 0) {
      try {
        for (const [chain, addresses] of riskGroups) {
          const risk = await apiFetch<{
            allowed: boolean;
            assessments: Array<{
              address: string;
              allowed: boolean;
              category: string;
              message: string;
            }>;
          }>("/v1/security/recipients/check", {
            method: "POST",
            body: JSON.stringify({ chain, addresses }),
          });
          const blocked = risk.assessments.find(
            (assessment) => !assessment.allowed,
          );
          if (!risk.allowed || blocked) {
            const content =
              blocked?.message ??
              "Coretta blocked this recipient after its safety check.";
            const a = msg("assistant", content);
            setMessages((m) => [...m, a]);
            void persistMessage("assistant", content, a.id);
            setPhase("idle");
            return;
          }
        }
      } catch (error) {
        const content =
          error instanceof Error
            ? `I couldn't verify the recipient safely: ${error.message}`
            : "I couldn't verify the recipient safely. No preview was created.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
    }

    const isSwap =
      previewBase.action === "swapUSDCtoEURC" ||
      previewBase.action === "swapEURCtoUSDC" ||
      previewBase.action === "swapAndSend" ||
      previewBase.action === "swapAndBridge";
    const isBridge = previewBase.action === "bridgeUSDC";
    if (isBridge && !previewBase.bridgeOperationId && !previewBase.bridgeBatchId) {
      if (!getApiToken() || !previewBase.destinationChain) {
        const content = "Sign in first so I can verify the CCTP route and fee estimate.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
      try {
        const bridgeRecipients = (previewBase.batch ?? []).map((recipient) => ({
          recipientAddress: recipient.name,
          amount: recipient.amount,
          destinationChain:
            recipient.destinationChain ?? previewBase.destinationChain!,
        }));
        const estimate = await apiFetch<{
          ok: true;
          amount: string;
          totalAmount?: string;
          feeTotal: string;
          quotedAt: string;
        }>(previewBase.batch?.length ? "/v1/bridge/batches/estimate" : "/v1/bridge/estimate", {
          method: "POST",
          body: JSON.stringify({
            destinationChain: previewBase.destinationChain,
            ...(previewBase.batch?.length
              ? { recipients: bridgeRecipients }
              : {
                  recipientAddress: previewBase.recipient,
                  amount: previewBase.amount,
                }),
          }),
        });
        if (estimate.totalAmount) {
          previewBase.amount = estimate.totalAmount;
          previewBase.totalAmount = estimate.totalAmount;
        }
        previewBase.estimatedBridgeFee = estimate.feeTotal;
        previewBase.transactionFee = `${estimate.feeTotal} USDC estimated${previewBase.batch?.length ? " across all legs" : ""}`;
        previewBase.quotedAt = estimate.quotedAt;
      } catch (error) {
        const content =
          error instanceof Error
            ? `I couldn't get a CCTP estimate: ${error.message}`
            : "I couldn't get a CCTP estimate. No preview was created.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
    }
    if (isSwap) {
      if (!getApiToken()) {
        const content =
          "Sign in first so I can request a live swap quote. I won't infer a swap output amount.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        setPhase("idle");
        return;
      }
      const tokenIn = previewBase.asset as "USDC" | "EURC";
      const tokenOut = previewBase.receiveAsset as "USDC" | "EURC";
      try {
        const quote = await apiFetch<{
          ok: true;
          amountOut: string;
          quotedAt: string;
        }>("/v1/swap/estimate", {
          method: "POST",
          body: JSON.stringify({ tokenIn, tokenOut, amountIn: previewBase.amount }),
        });
        if (!requestIsCurrent()) return;
        previewBase.receiveAmount = quote.amountOut;
        previewBase.quoteStatus = "ready";
        previewBase.quotedAt = quote.quotedAt;
        if (
          previewBase.action === "swapAndSend" &&
          previewBase.allocation === "equal-output" &&
          previewBase.batch?.length
        ) {
          const allocations = allocateEqualAmounts(quote.amountOut, previewBase.batch.length);
          if (!allocations) {
            const content = `The live quote is too small to divide into ${previewBase.batch.length} non-zero payments. Reduce the recipient count or increase the swap amount.`;
            const a = msg("assistant", content);
            setMessages((m) => [...m, a]);
            void persistMessage("assistant", content, a.id);
            setPhase("idle");
            return;
          }
          previewBase.batch = previewBase.batch.map((recipient, index) => ({
            ...recipient,
            amount: allocations[index],
          }));
          previewBase.totalAmount = quote.amountOut;
          previewBase.riskWarning =
            assessBatchRisk(previewBase.batch, quote.amountOut) ?? previewBase.riskWarning;
        }
        if (previewBase.action === "swapAndSend" && !previewBase.totalAmount) {
          previewBase.totalAmount = quote.amountOut;
        }
        if (previewBase.action === "swapAndBridge" && !previewBase.totalAmount) {
          previewBase.totalAmount = quote.amountOut;
        }
        if (
          (previewBase.action === "swapAndSend" ||
            previewBase.action === "swapAndBridge") &&
          previewBase.totalAmount &&
          decimalToMicro(quote.amountOut) < decimalToMicro(previewBase.totalAmount)
        ) {
          const requestedLeg =
            previewBase.action === "swapAndBridge" ? "bridge leg" : "payment leg";
          const content = `The live quote returns about ${quote.amountOut} ${tokenOut}, which is less than the ${previewBase.totalAmount} ${tokenOut} in your ${requestedLeg}. Reduce that amount or increase the swap amount.`;
          const a = msg("assistant", content);
          setMessages((m) => [...m, a]);
          void persistMessage("assistant", content, a.id);
          setPhase("idle");
          return;
        }
      } catch (error) {
        const content =
          error instanceof Error
            ? `I couldn't get a live swap quote: ${error.message}`
            : "I couldn't get a live swap quote. No preview was created.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
    }

    if (previewBase.action === "swapAndBridge") {
      if (
        !getApiToken() ||
        !previewBase.destinationChain ||
        !previewBase.totalAmount
      ) {
        const content =
          "I couldn't lock the swap and bridge plan because its destination or bridge amount is missing.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
      try {
        const estimate = await apiFetch<{
          ok: true;
          feeTotal: string;
          quotedAt: string;
        }>("/v1/bridge/estimate", {
          method: "POST",
          body: JSON.stringify({
            destinationChain: previewBase.destinationChain,
            recipientAddress: previewBase.recipient,
            amount: previewBase.totalAmount,
          }),
        });
        previewBase.estimatedBridgeFee = estimate.feeTotal;
        previewBase.transactionFee = `${estimate.feeTotal} USDC estimated`;
        previewBase.quotedAt = estimate.quotedAt;
      } catch (error) {
        const content =
          error instanceof Error
            ? `I couldn't get a CCTP estimate for the second step: ${error.message}`
            : "I couldn't get a CCTP estimate for the second step. No preview was created.";
        const a = msg("assistant", content);
        setMessages((m) => [...m, a]);
        void persistMessage("assistant", content, a.id);
        setPhase("idle");
        return;
      }
    }

    if (!requestIsCurrent()) return;
    const locked = await buildLockedPreview(previewBase);
    if (!requestIsCurrent()) return;
    lockedRef.current = locked;
    setPreview(locked);
    setPhase("preview");

    const sendAsset =
      locked.action === "swapAndSend" || locked.action === "swapAndBridge"
        ? locked.receiveAsset
        : locked.asset;
    const details = [
      ...locked.steps.map((step, index) =>
        step.detail ? `${index + 1}. ${step.label}\n${step.detail}` : `${index + 1}. ${step.label}`,
      ),
      "",
      ...(locked.receiveAsset && locked.receiveAmount
        ? [
            `Live quote: ${locked.amount} ${locked.asset} → about ${locked.receiveAmount} ${locked.receiveAsset}`,
          ]
        : []),
      ...(locked.batch && locked.batch.length > 1
        ? [
            `Recipients: ${locked.batch.length}`,
            summarizeBatchAllocation(locked.batch, sendAsset ?? locked.asset, locked.allocation),
            `Payment total: ${locked.totalAmount} ${sendAsset}`,
          ]
        : locked.action === "swapAndSend"
          ? [`Payment: ${locked.totalAmount} ${sendAsset} → ${locked.recipient}`]
          : locked.action === "swapAndBridge"
            ? [`Bridge: ${locked.totalAmount} ${sendAsset} → ${locked.recipient}`]
          : locked.action === "sendUSDC" || locked.action === "sendEURC"
            ? [`Payment: ${locked.amount} ${locked.asset} → ${locked.recipient}`]
            : []),
      `Network: ${locked.network}`,
      ...(locked.sponsorship === "user-paid" && locked.transactionFee
        ? [`Transaction fee: ${locked.transactionFee}`]
        : []),
    ];

    const content = composeDamianResponse(
      {
        event: "preview_ready",
        facts: {
          operationId: locked.id,
          stepCount: locked.steps.length,
          amount: locked.amount,
          asset: locked.asset,
          recipient: locked.recipient,
          network: locked.network,
          details,
        },
      },
      { length: responseLength, seed: locked.id },
    );
    const a = msg("assistant", content);
    setMessages((m) => [...m, a]);
    void persistMessage("assistant", a.content, a.id);
  }, [
    address,
    conversationId,
    pendingRecipientSave,
    persistMessage,
    savedRecipientsEnabled,
    transactionHistoryEnabled,
    executionsInFlight,
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
    const current = lockedRef.current;
    if (!current) return;
    pendingDraftRef.current = null;
    setExecutionsInFlight((count) => count + 1);
    setPhase("idle");
    setPreview(null);
    if (!current) return;
    executionResponseLengthRef.current = responseLengthRef.current;

    const facts = {
      action: current.action,
      receiveAsset: current.receiveAsset,
      operationId: current.id,
      amount: current.amount,
      asset: current.asset,
      recipient: current.recipient,
      network: current.network,
    };
    const content = composeDamianResponse(
      { event: "transaction_processing", facts },
      { length: executionResponseLengthRef.current, seed: current.id },
    );
    const processingMessage = msg("assistant", content);
    setMessages((messages) => [...messages, processingMessage]);
    void persistMessage("assistant", content, processingMessage.id);

    if (executionDelayTimerRef.current) clearTimeout(executionDelayTimerRef.current);
    executionDelayTimerRef.current = setTimeout(() => {
      if (lockedRef.current?.id !== current.id) return;
      const delayedContent = composeDamianResponse(
        { event: "transaction_delayed", facts },
        { length: executionResponseLengthRef.current, seed: current.id },
      );
      const delayedMessage = msg("assistant", delayedContent);
      setMessages((messages) => [...messages, delayedMessage]);
      void persistMessage("assistant", delayedContent, delayedMessage.id);
      executionDelayTimerRef.current = null;
    }, TRANSACTION_DELAY_NOTICE_MS);
  }, [persistMessage]);

  const updateTxCard = useCallback((record: TransactionRecord) => {
    setTxCards((prev) => {
      const idx = prev.findIndex((r) => r.id === record.id);
      let next: TransactionRecord[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = { ...next[idx], ...record };
      } else {
        next = [record, ...prev];
      }
      txCardsRef.current = next;
      return next;
    });
  }, []);

  const dismissTxCard = useCallback((id: string) => {
    setTxCards((current) => {
      const next = current.filter((record) => record.id !== id);
      txCardsRef.current = next;
      return next;
    });
  }, []);

  const completeExecution = useCallback((
    txHash?: string,
    txId?: string,
    settlement?: {
      transferId?: string;
      outcome?: "settled" | "partial" | "pending" | "approval_pending";
      settledCount?: number;
      pendingCount?: number;
      failedCount?: number;
      totalCount?: number;
      bridgeBatchId?: string;
    },
  ) => {
    const completedPreview = lockedRef.current;
    if (
      completedPreview &&
      settlement?.bridgeBatchId &&
      (settlement.failedCount ?? 0) > 0
    ) {
      const { id: _id, previewHash: _hash, createdAt: _createdAt, ...draft } = completedPreview;
      lastFailedDraftRef.current = {
        draft: {
          ...structuredClone(draft),
          bridgeBatchId: settlement.bridgeBatchId,
        },
        token: getApiToken(),
      };
      lastTerminalWasFailureRef.current = true;
    } else {
      lastTerminalWasFailureRef.current = false;
    }
    if (executionDelayTimerRef.current) {
      clearTimeout(executionDelayTimerRef.current);
      executionDelayTimerRef.current = null;
    }
    setPhase((current) => (current === "thinking" ? current : "idle"));
    setExecutionsInFlight((count) => Math.max(0, count - 1));
    if (txId) {
      const partialSummary = settlement?.outcome === "partial"
        ? `${settlement.settledCount ?? 0} settled, ${settlement.pendingCount ?? 0} pending, and ${settlement.failedCount ?? 0} failed.`
        : undefined;
      updateTxCard({
        id: txId,
        status:
          settlement?.outcome === "partial"
            ? "partial"
            : settlement?.outcome === "settled" || txHash
              ? "settled"
              : "pending",
        asset: lockedRef.current?.asset ?? "USDC",
        amount: lockedRef.current?.amount ?? "0",
        recipient: lockedRef.current?.recipient ?? "",
        txHash,
        network: "Arc Testnet",
        timestamp: Date.now(),
        failureReason: partialSummary,
      });
    }
    if (completedPreview) {
      const facts = {
        action: completedPreview.action,
        receiveAsset: completedPreview.receiveAsset,
        operationId: completedPreview.id,
        amount: completedPreview.amount,
        asset: completedPreview.asset,
        recipient: completedPreview.recipient,
        network: completedPreview.network,
        txHash,
        settledCount: settlement?.settledCount,
        pendingCount: settlement?.pendingCount,
        failedCount: settlement?.failedCount,
        totalCount: settlement?.totalCount,
      };
      const event = settlement?.outcome === "partial"
        ? "transaction_partial" as const
        : settlement?.outcome === "approval_pending"
          ? "recipient_approval_pending" as const
        : settlement?.outcome === "settled"
          ? "transaction_settled" as const
        : !txHash || settlement?.outcome === "pending"
          ? "transaction_pending" as const
          : "transaction_settled" as const;
      const content = composeDamianResponse(
        { event, facts },
        { length: executionResponseLengthRef.current, seed: completedPreview.id },
      );
      const completion = {
        ...msg("assistant", content),
        ...(event === "transaction_settled"
          ? { kind: "receipt_offer" as const, receiptTxId: txId }
          : {}),
      };
      setMessages((m) => [...m, completion]);
      void persistMessage("assistant", completion.content, completion.id);

      const addressMatch = /^0x[a-fA-F0-9]{40}$/.exec(completedPreview.recipient.trim());
      if (event === "transaction_settled" && savedRecipientsEnabled && addressMatch) {
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
  }, [persistMessage, savedRecipientsEnabled, updateTxCard]);

  const failExecution = useCallback((
    txId: string,
    reason: string,
    txHash?: string,
    recovery?: {
      bridgeOperationId?: string;
      bridgeBatchId?: string;
      bridgeOnly?: boolean;
    },
  ) => {
    const failedPreview = lockedRef.current;
    if (failedPreview) {
      const { id: _id, previewHash: _hash, createdAt: _createdAt, ...draft } = failedPreview;
      const retryDraft =
        recovery?.bridgeOnly && draft.action === "swapAndBridge"
          ? {
              ...draft,
              action: "bridgeUSDC" as const,
              amount: draft.totalAmount ?? draft.receiveAmount ?? draft.amount,
              asset: "USDC" as const,
              receiveAsset: undefined,
              receiveAmount: undefined,
              swapRoute: undefined,
              totalAmount: undefined,
              steps: draft.steps.filter((step) => step.kind === "bridge"),
              executionPath: `CCTP to ${draft.destinationChainLabel ?? draft.destinationChain}`,
            }
          : draft;
      lastFailedDraftRef.current = {
        draft: {
          ...structuredClone(retryDraft),
          ...(recovery?.bridgeOperationId
            ? { bridgeOperationId: recovery.bridgeOperationId }
            : {}),
          ...(recovery?.bridgeBatchId
            ? { bridgeBatchId: recovery.bridgeBatchId }
            : {}),
        },
        token: getApiToken(),
      };
      lastTerminalWasFailureRef.current = true;
    }
    if (executionDelayTimerRef.current) {
      clearTimeout(executionDelayTimerRef.current);
      executionDelayTimerRef.current = null;
    }
    setPhase((current) => (current === "thinking" ? current : "idle"));
    setExecutionsInFlight((count) => Math.max(0, count - 1));
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
    const content = composeDamianResponse(
      {
        event: "transaction_failed",
        facts: {
          action: failedPreview?.action,
          receiveAsset: failedPreview?.receiveAsset,
          operationId: failedPreview?.id ?? txId,
          amount: failedPreview?.amount,
          asset: failedPreview?.asset,
          recipient: failedPreview?.recipient,
          network: failedPreview?.network,
          txHash,
          reason,
        },
      },
      { length: executionResponseLengthRef.current, seed: failedPreview?.id ?? txId },
    );
    const failure = msg("assistant", content);
    setMessages((messages) => [...messages, failure]);
    void persistMessage("assistant", failure.content, failure.id);
  }, [persistMessage, updateTxCard]);

  const cancelPreview = useCallback(() => {
    pendingDraftRef.current = null;
    intentEpochRef.current += 1;
    const cancelled = lockedRef.current;
    setPreview(null);
    lockedRef.current = null;
    setPhase("idle");
    const content = composeDamianResponse(
      {
        event: "preview_cancelled",
        facts: cancelled
          ? {
              operationId: cancelled.id,
              amount: cancelled.amount,
              asset: cancelled.asset,
              recipient: cancelled.recipient,
            }
          : undefined,
      },
      { length: responseLengthRef.current, seed: cancelled?.id },
    );
    const cancelledMessage = msg("assistant", content);
    setMessages((messages) => [...messages, cancelledMessage]);
    void persistMessage("assistant", content, cancelledMessage.id);
  }, [persistMessage]);

  return {
    messages,
    phase,
    preview,
    txCards,
    dismissTxCard,
    executionsInFlight,
    submitUserMessage,
    confirmAndSign,
    markExecuting,
    completeExecution,
    failExecution,
    updateTxCard,
    cancelPreview,
    decideIncomingApproval,
    setPhase,
    memoryEnabled,
    conversations,
    conversationId,
    historyOpen,
    setHistoryOpen,
    refreshConversations,
    loadConversation,
    startNewConversation,
    archiveConversation,
    resetSession,
  };
}
