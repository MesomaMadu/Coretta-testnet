"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";
import { Home, MessageSquare, History, Settings, Wallet, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import Logo from "@/components/shared/Logo";
import { AGENT_NAME } from "@/lib/brand";

interface Props {
  active?: string;
  onActivityClick: () => void;
  onSettingsClick: () => void;
  onUsageClick: () => void;
  onChatClick: () => void;
  onConnectWallet: () => void;
  onEmailAuth: () => void;
  connected: boolean;
  address?: string;
}

const NAV = [
  { id: "home", label: "Home", icon: Home, href: "/" as const, type: "link" as const },
  { id: "chat", label: AGENT_NAME, icon: MessageSquare, type: "button" as const },
  { id: "history", label: "Activity", icon: History, type: "button" as const },
  { id: "usage", label: "Usage", icon: Wallet, type: "button" as const },
  { id: "settings", label: "Settings", icon: Settings, type: "button" as const },
] as const;

export default function AppSidebar({
  active = "chat",
  onActivityClick,
  onSettingsClick,
  onUsageClick,
  onChatClick,
  onConnectWallet,
  onEmailAuth,
  connected,
  address,
}: Props) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-[var(--ar-border)] bg-[var(--ar-surface)] p-4 backdrop-blur-xl">
      <div className="mb-8 origin-left scale-90">
        <Logo href="/app" />
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const isActive = active === item.id;
          const className = cn(
            "relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200",
            isActive
              ? "bg-[var(--ar-input-bg)] text-[var(--ar-fg)]"
              : "text-[var(--ar-fg-muted)] hover:bg-[var(--ar-input-bg)] hover:text-[var(--ar-fg)]",
          );

          const inner = (
            <>
              {isActive && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#7C4DFF]/15 to-[#3B82F6]/10 shadow-[0_0_20px_rgba(124,77,255,0.12)]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <item.icon className="relative h-4 w-4" />
              <span className="relative">{item.label}</span>
            </>
          );

          if (item.type === "link") {
            return (
              <Link key={item.id} href={item.href} className={className}>
                {inner}
              </Link>
            );
          }

          const onClick =
            item.id === "history"
              ? onActivityClick
              : item.id === "settings"
                ? onSettingsClick
                : item.id === "usage"
                  ? onUsageClick
                  : item.id === "chat"
                    ? onChatClick
                    : undefined;

          return (
            <button
              key={item.id}
              type="button"
              className={className}
              onClick={onClick}
              aria-pressed={isActive}
            >
              {inner}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 border-t border-[var(--ar-border)] pt-4">
        <div className="group flex w-full items-center gap-2 rounded-xl border border-[var(--ar-border)] bg-[var(--ar-input-bg)] px-3 py-2.5 text-left text-xs text-[var(--ar-fg)] transition hover:border-[#7C4DFF]/40">
          <button
            type="button"
            onClick={onConnectWallet}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <Wallet className="h-4 w-4 shrink-0 text-[#8F5CFF]" />
            {connected && address ? (
              <span className="truncate">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            ) : (
              "Connect wallet"
            )}
          </button>
          {connected && address && (
            <button
              type="button"
              onClick={() => void copyAddress()}
              className="shrink-0 rounded p-0.5 text-[var(--ar-fg-subtle)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:text-[var(--ar-fg)]"
              aria-label="Copy address"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[#8F5CFF]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onEmailAuth}
          className="w-full rounded-xl px-3 py-2 text-xs text-[var(--ar-fg-subtle)] hover:text-[var(--ar-fg-muted)]"
        >
          Sign in with email
        </button>
      </div>
    </aside>
  );
}
