"use client";

import { Archive, MessageSquarePlus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { ConversationSummary } from "@/lib/agent/types";

interface Props {
  open: boolean;
  conversations: ConversationSummary[];
  activeId: string | null;
  onClose: () => void;
  onNew: () => void;
  onLoad: (id: string) => void;
  onArchive: (id: string) => void;
}

export default function ChatHistoryDrawer({
  open,
  conversations,
  activeId,
  onClose,
  onNew,
  onLoad,
  onArchive,
}: Props) {
  const reduceMotion = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close conversation history"
            className="absolute inset-0 z-20 bg-black/15 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            initial={reduceMotion ? false : { x: -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { x: -24, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            className="absolute inset-y-0 left-0 z-30 flex w-[min(22rem,88vw)] flex-col border-r border-black/10 bg-white shadow-xl"
            aria-label="Conversation history"
          >
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-black">Conversation history</h2>
                <p className="text-xs text-black/45">Encrypted and scoped to your account</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-black/45 hover:bg-black/5 hover:text-black"
                aria-label="Close history"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3">
              <button
                type="button"
                onClick={onNew}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-3 py-2.5 text-sm font-medium text-white hover:bg-black/80"
              >
                <MessageSquarePlus className="h-4 w-4" />
                New conversation
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`group rounded-xl border p-3 ${
                    conversation.id === activeId
                      ? "border-black/30 bg-black/[0.04]"
                      : "border-black/10 bg-white"
                  } ${conversation.status === "ARCHIVED" ? "opacity-60" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => onLoad(conversation.id)}
                    className="w-full text-left"
                  >
                    <p className="truncate text-sm font-medium text-black">{conversation.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-black/50">
                      {conversation.preview ?? "No messages yet"}
                    </p>
                    <p className="mt-2 text-[10px] text-black/35">
                      {conversation.messageCount} messages · {new Date(conversation.updatedAt).toLocaleDateString()}
                    </p>
                  </button>
                  {conversation.status === "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => onArchive(conversation.id)}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-black/40 hover:text-black"
                    >
                      <Archive className="h-3 w-3" />
                      Archive
                    </button>
                  )}
                </div>
              ))}
              {!conversations.length && (
                <p className="px-2 py-8 text-center text-sm text-black/45">
                  Your saved conversations will appear here.
                </p>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
