"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Flag, X } from "lucide-react";
import { useState } from "react";
import { apiFetch, getApiToken } from "@/lib/api";

export default function ReportIssueButton({
  conversationId,
  lastUserMessage,
}: {
  conversationId?: string | null;
  lastUserMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setText("");
    setStatus(null);
  };

  const submit = async () => {
    const comment = text.trim();
    if (!comment) return;
    if (!getApiToken()) {
      setStatus("Sign in before sending a report.");
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      await apiFetch("/v1/ai/feedback", {
        method: "POST",
        body: JSON.stringify({
          kind: "report",
          issueType: "OTHER",
          comment,
          messageId: null,
          context: {
            conversationId: conversationId ?? null,
            lastUserMessage,
            source: "damian_chat_header",
          },
        }),
      });
      setText("");
      setStatus("Report sent.");
    } catch {
      setStatus("Coretta could not send the report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black transition hover:border-black/25"
        aria-expanded={open}
        aria-label="Report an issue"
      >
        <Flag className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Report issue</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="absolute right-0 top-12 z-30 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-white p-4 shadow-[0_18px_50px_rgba(33,29,50,0.16)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-black">Report an issue</p>
                <p className="mt-1 text-xs leading-relaxed text-black/50">Describe what Damian misunderstood or handled incorrectly. Don&apos;t include passwords or private keys.</p>
              </div>
              <button type="button" onClick={close} className="rounded-lg p-1 text-black/40 hover:bg-black/5 hover:text-black" aria-label="Close report form">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Describe the issue"
              rows={4}
              className="mt-3 w-full resize-none rounded-xl border border-black/10 bg-[#F7F5FA] px-3 py-2 text-xs text-black outline-none transition focus:border-[#7C4DFF]/50"
            />
            {status && <p className="mt-2 text-xs text-black/55" role="status">{status}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={close} className="rounded-full px-3 py-1.5 text-xs text-black/50 hover:text-black">Cancel</button>
              <button type="button" disabled={!text.trim() || submitting} onClick={() => void submit()} className="rounded-full bg-[#211D32] px-4 py-1.5 text-xs font-medium text-white transition hover:bg-black disabled:opacity-40">
                {submitting ? "Sending" : "Send report"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
