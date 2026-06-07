"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2 } from "lucide-react";
import { useAccount } from "wagmi";
import AIOrb from "@/components/ai/AIOrb";
import ChatBubble from "@/components/ai/ChatBubble";
import TransactionPreviewCard from "./TransactionPreviewCard";
import { useAgentChat } from "@/hooks/useAgentChat";
import { useProfile } from "@/hooks/useProfile";
import { useVoice } from "@/hooks/useVoice";
import { useI18n } from "@/lib/i18n/context";
import { AGENT_NAME, AGENT_TAGLINE } from "@/lib/brand";
import { emitActivity } from "./ActivityPanel";
import { Button } from "@/components/ui/button";

interface Props {
  onRequestWallet: () => void;
}

export default function AIAgentPanel({ onRequestWallet }: Props) {
  const [input, setInput] = useState("");
  const [voiceDraft, setVoiceDraft] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isConnected } = useAccount();
  const { profile, hydrated } = useProfile();
  const { t } = useI18n();

  const greeting =
    hydrated && profile.preferredName
      ? `${t("welcomeBack", { name: profile.preferredName })}\n${t("readyTransfer")}`
      : undefined;

  const {
    messages,
    phase,
    preview,
    submitUserMessage,
    confirmAndSign,
    markExecuting,
    completeExecution,
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
  }, [messages, preview]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || phase === "executing" || phase === "awaiting_signature") return;
    setInput("");
    setVoiceDraft(null);
    await submitUserMessage(text);
  };

  const handleConfirm = async () => {
    if (!isConnected) {
      onRequestWallet();
      return;
    }
    const ok = await confirmAndSign();
    if (!ok) return;

    markExecuting();
    emitActivity(`Signing ${preview?.action ?? "transfer"}…`, "pending");

    await new Promise((r) => setTimeout(r, 1200));
    setPhase("executing");

    await new Promise((r) => setTimeout(r, 800));
    const mockHash = `0x${Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("")}`;
    emitActivity(`Transfer submitted`, "complete");
    completeExecution(mockHash);
    speak("Transfer submitted. Awaiting confirmation on Arc Testnet.");
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
        {preview && (
          <TransactionPreviewCard
            preview={preview}
            phase={phase}
            onConfirm={handleConfirm}
            onCancel={cancelPreview}
            connected={isConnected}
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
            disabled={phase === "awaiting_signature" || phase === "executing"}
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
