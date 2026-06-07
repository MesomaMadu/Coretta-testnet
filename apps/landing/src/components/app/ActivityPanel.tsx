"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  label: string;
  status: "pending" | "complete";
  time: string;
}

const DEMO: ActivityItem[] = [
  { id: "1", label: "Wallet connected", status: "complete", time: "Just now" },
  { id: "2", label: "Arc Testnet ready", status: "complete", time: "1m ago" },
];

interface Props {
  onClose: () => void;
  variant?: "sidebar" | "main";
}

export default function ActivityPanel({ onClose, variant = "sidebar" }: Props) {
  const isMain = variant === "main";
  const [items, setItems] = useState<ActivityItem[]>(DEMO);

  useEffect(() => {
    const onActivity = (e: CustomEvent<ActivityItem>) => {
      setItems((prev) => [e.detail, ...prev].slice(0, 20));
    };
    window.addEventListener("Coretta-activity", onActivity as EventListener);
    return () =>
      window.removeEventListener("Coretta-activity", onActivity as EventListener);
  }, []);

  return (
    <aside
      id="activity"
      className={cn(
        "flex h-full flex-col bg-[var(--ar-surface)] p-4 backdrop-blur-xl",
        isMain
          ? "damian-chat-bg w-full flex-1"
          : "w-72 shrink-0 border-l border-[var(--ar-border)] fixed right-0 top-0 z-30 shadow-2xl md:relative md:z-auto md:shadow-none",
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ar-fg)]">
          <Activity className="h-4 w-4 text-cyan-500" />
          Activity
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-[var(--ar-fg-subtle)] hover:bg-[var(--ar-input-bg)] hover:text-[var(--ar-fg)]"
          aria-label="Close activity panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2 rounded-xl border border-[var(--ar-border)] bg-[var(--ar-input-bg)] px-3 py-2.5"
          >
            {item.status === "complete" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            )}
            <div>
              <p className="text-xs font-medium text-[var(--ar-fg)]">{item.label}</p>
              <p className="text-[10px] text-[var(--ar-fg-subtle)]">{item.time}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[10px] text-[var(--ar-fg-subtle)]">
        Live transfers appear here after you confirm and sign.
      </p>
    </aside>
  );
}

export function emitActivity(label: string, status: ActivityItem["status"] = "complete") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("Coretta-activity", {
      detail: {
        id: `act_${Date.now()}`,
        label,
        status,
        time: "Just now",
      },
    }),
  );
}
