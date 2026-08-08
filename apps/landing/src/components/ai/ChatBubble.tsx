"use client";

import { cn } from "@/lib/utils";
import type { AgentMessage, TransactionPreview } from "@/lib/agent/types";
import ResponseFeedback from "./ResponseFeedback";

export default function ChatBubble({
  message,
  context,
  preview,
}: {
  message: AgentMessage;
  context: { lastUserMessage?: string };
  preview?: TransactionPreview | null;
}) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
          isUser ? "damian-bubble-user" : "damian-bubble-assistant",
        )}
      >
        {message.content}
      </div>
      {isAssistant && (
        <div className="max-w-[85%]">
          <ResponseFeedback
            messageId={message.id}
            serverMessageId={message.serverId}
            context={context}
            preview={preview}
          />
        </div>
      )}
    </div>
  );
}
