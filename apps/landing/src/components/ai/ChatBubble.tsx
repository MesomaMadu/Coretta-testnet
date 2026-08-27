"use client";

import { cn } from "@/lib/utils";
import type { AgentMessage } from "@/lib/agent/types";

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
}: {
  message: AgentMessage;
}) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
          isUser ? "damian-bubble-user" : "damian-bubble-assistant",
        )}
      >
        {renderMessage(message.content)}
      </div>
    </div>
  );
}
