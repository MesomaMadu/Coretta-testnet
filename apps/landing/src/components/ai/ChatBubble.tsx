"use client";

import { cn } from "@/lib/utils";
import type { AgentMessage } from "@/lib/agent/types";
import { motion, useReducedMotion } from "framer-motion";
import { Check, ReceiptText, X } from "lucide-react";

const EMPHASIZED_COPY = "Confirm & Sign";

function renderMessage(content: string) {
  return content.split(EMPHASIZED_COPY).map((part, index, parts) => (
    <span key={`${index}-${part.slice(0, 12)}`}>
      {part}
      {index < parts.length - 1 ? <strong>{EMPHASIZED_COPY}</strong> : null}
    </span>
  ));
}

export default function ChatBubble({
  message,
  grouped = false,
  onViewReceipt,
  onApprovalDecision,
}: {
  message: AgentMessage;
  grouped?: boolean;
  onViewReceipt?: (transactionId: string) => void;
  onApprovalDecision?: (approvalId: string, decision: "accept" | "reject") => void;
}) {
  const isUser = message.role === "user";
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
      className={cn("flex flex-col", grouped ? "mt-1" : "mt-3", isUser ? "items-end" : "items-start")}
    >
      <div
        className={cn(
          "max-w-[85%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
          isUser ? "damian-bubble-user" : "damian-bubble-assistant",
        )}
      >
        {renderMessage(message.content)}
      </div>
      {message.kind === "receipt_offer" && message.receiptTxId && onViewReceipt && (
        <button
          type="button"
          onClick={() => onViewReceipt(message.receiptTxId!)}
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:border-black/25"
        >
          <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
          View receipt
        </button>
      )}
      {message.kind === "approval_offer" && message.approvalId && message.approvalStatus === "pending" && onApprovalDecision && (
        <div className="mt-1.5 flex gap-2">
          <button type="button" onClick={() => onApprovalDecision(message.approvalId!, "accept")} className="inline-flex items-center gap-1 rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white"><Check className="h-3.5 w-3.5" />Accept</button>
          <button type="button" onClick={() => onApprovalDecision(message.approvalId!, "reject")} className="inline-flex items-center gap-1 rounded-full border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-black"><X className="h-3.5 w-3.5" />Reject</button>
        </div>
      )}
      {!grouped && (
        <div className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-black/35">
          <time dateTime={new Date(message.timestamp).toISOString()}>
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          {isUser && <span>{message.delivery === "sending" ? "Sending" : message.delivery === "failed" ? "Not saved" : "Sent"}</span>}
        </div>
      )}
    </motion.div>
  );
}
