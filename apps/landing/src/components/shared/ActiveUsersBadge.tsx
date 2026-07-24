"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const SESSION_KEY = "coretta_presence_session";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `sess_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export default function ActiveUsersBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const sessionId = getSessionId();
    if (!sessionId) return;

    const ping = async () => {
      try {
        const res = await fetch(`${API_URL}/v1/presence/ping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (res.ok) {
          const data = (await res.json()) as { activeUsers: number };
          setCount(data.activeUsers);
        }
      } catch {
        /* API offline */
      }
    };

    void ping();
    const interval = window.setInterval(ping, 20_000);
    return () => window.clearInterval(interval);
  }, []);

  if (count === null) return null;

  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-[var(--ar-border)] bg-[var(--ar-input-bg)] px-2.5 py-1 text-[10px] font-medium text-[var(--ar-fg-muted)] lg:inline-flex"
      title="Active users in the last 60 seconds"
    >
      <Users className="h-3 w-3 text-[#8F5CFF]" />
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#16C784]" />
      {count} active
    </span>
  );
}
