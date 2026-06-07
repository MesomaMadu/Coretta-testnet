"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseUserIntent } from "@/lib/agent/intent-parser";
import { buildLockedPreview, verifyPreviewIntegrity } from "@/lib/agent/preview-lock";
import type { AgentMessage, AgentPhase, TransactionPreview } from "@/lib/agent/types";
import { AGENT_NAME, AGENT_TAGLINE } from "@/lib/brand";
import { apiFetch, getApiToken } from "@/lib/api";

function msg(role: AgentMessage["role"], content: string): AgentMessage {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

export function useAgentChat(greeting?: string) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [memoryEnabled, setMemoryEnabled] = useState<boolean>(false);
  const [messages, setMessages] = useState<AgentMessage[]>([
    msg(
      "assistant",
      greeting ??
        `I'm ${AGENT_NAME} — ${AGENT_TAGLINE}. Tell me who to pay and how much. I'll prepare a preview for you to confirm and sign. I never send funds without your approval.`,
    ),
  ]);
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const [preview, setPreview] = useState<TransactionPreview | null>(null);
  const lockedRef = useRef<TransactionPreview | null>(null);

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
          "Say: “Yes — send 50 USDC to the same recipient” or tell me the exact recipient/asset.",
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

    const locked = await buildLockedPreview(result.preview);
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
  }, [memoryEnabled, persistMessage]);

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

  const completeExecution = useCallback((txHash?: string) => {
    setPhase("complete");
    setMessages((m) => [
      ...m,
      msg(
        "assistant",
        txHash
          ? `Transfer submitted. Track on Arcscan: ${txHash.slice(0, 10)}…`
          : "Transfer simulation complete. Connect your wallet on Arc Testnet to sign real transactions.",
      ),
    ]);
    setPreview(null);
    lockedRef.current = null;
    setTimeout(() => setPhase("idle"), 2000);
  }, []);

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
    submitUserMessage,
    confirmAndSign,
    markExecuting,
    completeExecution,
    cancelPreview,
    setPhase,
    memoryEnabled,
  };
}
