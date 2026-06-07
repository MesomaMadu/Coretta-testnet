"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Flag, ThumbsDown, ThumbsUp } from "lucide-react";
import { useMemo, useState } from "react";
import { apiFetch, getApiToken } from "@/lib/api";
import type { TransactionPreview } from "@/lib/agent/types";

type NegativeReason =
  | "WRONG_RECIPIENT"
  | "WRONG_AMOUNT"
  | "WRONG_ASSET"
  | "MISUNDERSTOOD_INTENT"
  | "POOR_RESPONSE"
  | "OTHER";

const NEGATIVE_OPTIONS: Array<{ id: NegativeReason; label: string }> = [
  { id: "WRONG_RECIPIENT", label: "Wrong recipient" },
  { id: "WRONG_AMOUNT", label: "Wrong amount" },
  { id: "WRONG_ASSET", label: "Wrong asset" },
  { id: "MISUNDERSTOOD_INTENT", label: "Misunderstood intent" },
  { id: "POOR_RESPONSE", label: "Poor response" },
  { id: "OTHER", label: "Other" },
];

export default function ResponseFeedback({
  messageId,
  serverMessageId,
  context,
  preview,
}: {
  messageId: string;
  serverMessageId?: string;
  context: { lastUserMessage?: string };
  preview?: TransactionPreview | null;
}) {
  const [mode, setMode] = useState<"idle" | "thanks" | "negative" | "report">(
    "idle",
  );
  const [reason, setReason] = useState<NegativeReason | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const signedIn = useMemo(() => !!getApiToken(), []);

  const baseContext = useMemo(
    () => ({
      messageId,
      lastUserMessage: context.lastUserMessage,
      preview: preview
        ? {
            action: preview.action,
            recipient: preview.recipient,
            amount: preview.amount,
            asset: preview.asset,
            previewHash: preview.previewHash,
          }
        : undefined,
    }),
    [context.lastUserMessage, messageId, preview],
  );

  async function sendFeedback(payload: {
    kind: "thumbs" | "report";
    rating?: 1 | -1;
    issueType?: string | null;
    comment?: string | null;
  }) {
    if (!signedIn) {
      // Privacy-first fallback: don't send anywhere if user isn't signed in.
      setMode("thanks");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/v1/ai/feedback", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          messageId: serverMessageId ?? null,
          context: baseContext,
        }),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-1 flex items-center gap-2 text-[11px] text-white/35">
      <button
        type="button"
        disabled={submitting}
        onClick={async () => {
          await sendFeedback({ kind: "thumbs", rating: 1 });
          setMode("thanks");
        }}
        className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 transition hover:border-cyan-400/30 hover:text-white disabled:opacity-50"
        aria-label="Thumbs up"
      >
        <span className="inline-flex items-center gap-1">
          <ThumbsUp className="h-3.5 w-3.5" /> Helpful
        </span>
      </button>

      <button
        type="button"
        disabled={submitting}
        onClick={() => setMode((m) => (m === "negative" ? "idle" : "negative"))}
        className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 transition hover:border-white/25 hover:text-white disabled:opacity-50"
        aria-label="Thumbs down"
      >
        <span className="inline-flex items-center gap-1">
          <ThumbsDown className="h-3.5 w-3.5" /> Not quite
        </span>
      </button>

      <button
        type="button"
        disabled={submitting}
        onClick={() => setMode((m) => (m === "report" ? "idle" : "report"))}
        className="ml-auto rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 transition hover:border-rose-400/30 hover:text-white disabled:opacity-50"
      >
        <span className="inline-flex items-center gap-1">
          <Flag className="h-3.5 w-3.5" /> Report issue
        </span>
      </button>

      <AnimatePresence>
        {mode === "thanks" && (
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="ml-2 text-cyan-200/80"
          >
            Thanks! Damian will use this feedback to improve.
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mode === "negative" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] p-3"
          >
            <p className="mb-2 text-xs text-white/60">What went wrong?</p>
            <div className="flex flex-wrap gap-2">
              {NEGATIVE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setReason(o.id)}
                  className={`rounded-full border px-3 py-1 text-[11px] transition ${
                    reason === o.id
                      ? "border-cyan-400/40 bg-cyan-500/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white/80"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Optional details…"
              className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/80 outline-none focus:border-cyan-400/30"
              rows={3}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode("idle");
                  setText("");
                  setReason(null);
                }}
                className="rounded-full px-3 py-1 text-[11px] text-white/45 hover:text-white/70"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reason || submitting}
                onClick={async () => {
                  await sendFeedback({
                    kind: "thumbs",
                    rating: -1,
                    issueType: reason,
                    comment: text || null,
                  });
                  setMode("thanks");
                  setText("");
                  setReason(null);
                }}
                className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] text-white/80 hover:border-cyan-400/30 disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          </motion.div>
        )}

        {mode === "report" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-2 w-full rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3"
          >
            <p className="mb-2 text-xs text-rose-100/80">
              Report suspicious or confusing behavior.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Describe the issue… (no secrets)"
              className="w-full resize-none rounded-xl border border-rose-500/20 bg-black/20 px-3 py-2 text-xs text-white/80 outline-none focus:border-rose-400/40"
              rows={3}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode("idle");
                  setText("");
                }}
                className="rounded-full px-3 py-1 text-[11px] text-rose-50/70 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!text.trim() || submitting}
                onClick={async () => {
                  await sendFeedback({
                    kind: "report",
                    issueType: "OTHER",
                    comment: text.trim(),
                  });
                  setMode("thanks");
                  setText("");
                }}
                className="rounded-full border border-rose-500/30 bg-rose-500/20 px-3 py-1 text-[11px] text-rose-50 hover:border-rose-400/50 disabled:opacity-50"
              >
                Send report
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

