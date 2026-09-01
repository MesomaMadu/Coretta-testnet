"use client";

import Link from "next/link";
import { useState } from "react";
import {
  LayoutDashboard,
  MessageSquare,
  Settings,
  Wallet,
  Mail,
  Copy,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import CRLogo from "@/components/shared/CRLogo";
import { BRAND_NAME } from "@/lib/brand";

interface Props {
  active?: string;
  onDashboardClick: () => void;
  onSettingsClick: () => void;
  onUsageClick: () => void;
  onChatClick: () => void;
  onApprovalsClick: () => void;
  onActivityClick: () => void;
  onConnectWallet: () => void;
  connected: boolean;
  address?: string;
  email?: string | null;
  unreadCount?: number;
}

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, type: "button" as const },
  { id: "chat", label: "Chat", icon: MessageSquare, type: "button" as const },
  { id: "approvals", label: "Approvals", icon: Bell, type: "button" as const },
  { id: "usage", label: "Usage", icon: Wallet, type: "button" as const },
  { id: "settings", label: "Settings", icon: Settings, type: "button" as const },
  { id: "activity", label: "Activity", icon: Activity, type: "button" as const },
] as const;

/** Compact fintech sidebar for the Coretta workspace. */
export default function AppSidebar({
  active = "dashboard",
  onDashboardClick,
  onSettingsClick,
  onUsageClick,
  onChatClick,
  onApprovalsClick,
  onActivityClick,
  onConnectWallet,
  connected,
  address,
  email,
  unreadCount = 0,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <aside
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex h-16 w-full shrink-0 flex-row border-t border-white/10 bg-[#211D32]/95 p-2 text-white shadow-[inset_-1px_0_0_rgba(255,255,255,0.08),0_18px_45px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-[width] duration-200 md:static md:h-full md:flex-col md:border-r-0 md:border-t-0 md:p-4",
        collapsed ? "md:w-[4.5rem]" : "md:w-56",
      )}
    >
      <div
        className={cn(
          "mb-8 hidden items-center gap-2 md:flex",
          collapsed ? "flex-col gap-3" : "justify-between",
        )}
      >
        <Link
          href="/app"
          className={cn(
            "flex min-w-0 items-center gap-2.5",
            collapsed && "justify-center",
          )}
          aria-label={`${BRAND_NAME} app`}
        >
          <CRLogo size="md" showGlow={false} className="text-white" />
          {!collapsed && (
            <span className="truncate text-[15px] font-semibold tracking-tight text-white">
              {BRAND_NAME}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded-lg p-1.5 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="flex flex-1 flex-row gap-1 md:flex-col">
        {NAV.map((item) => {
          const isActive = active === item.id;
          const className = cn(
            "relative flex w-full flex-1 items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-medium transition-colors duration-200 md:flex-none md:justify-start md:gap-3 md:rounded-full md:px-3 md:py-2.5 md:text-sm",
            collapsed && "md:justify-center md:px-0",
            isActive
              ? "bg-[#7C4DFF] text-white shadow-[0_10px_24px_rgba(124,77,255,0.28)] md:bg-transparent md:shadow-none"
              : "text-white/60 hover:bg-white/8 hover:text-white",
          );

          const inner = (
            <>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 hidden -left-4 -translate-y-1/2 border-y-[5px] border-l-[6px] border-y-transparent border-l-[#F7F5FA] md:block"
                />
              )}
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="hidden sm:inline">{item.label}</span>}
              {item.id === "approvals" && unreadCount > 0 && (
                <span className="absolute right-1.5 top-1 min-w-4 rounded-full bg-white px-1 text-center text-[9px] leading-4 text-[#5C35D6] md:right-2">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </>
          );

          const onClick =
            item.id === "dashboard"
              ? onDashboardClick
              : item.id === "settings"
                  ? onSettingsClick
                  : item.id === "usage"
                    ? onUsageClick
                  : item.id === "chat"
                      ? onChatClick
                      : item.id === "approvals"
                        ? onApprovalsClick
                      : item.id === "activity"
                        ? onActivityClick
                      : undefined;

          return (
            <button
              key={item.id}
              type="button"
              className={className}
              onClick={onClick}
              aria-pressed={isActive}
              title={collapsed ? item.label : undefined}
            >
              {inner}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto hidden space-y-2 border-t border-white/10 pt-4 md:block">
        <Link
          href="/"
          className={cn(
            "flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium text-white/60 transition-colors duration-200 hover:bg-white/8 hover:text-white",
            collapsed && "justify-center px-0",
          )}
          title={collapsed ? "Back to home" : undefined}
        >
          <span className="shrink-0 text-base leading-none">↗</span>
          {!collapsed && <span>Back to home</span>}
        </Link>
        <div
          className={cn(
            "group flex w-full items-center gap-2 rounded-full border border-white/10 bg-white/8 text-left text-xs text-white",
            collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
          )}
        >
          <button
            type="button"
            onClick={onConnectWallet}
            className={cn(
              "flex min-w-0 items-center gap-2 text-left font-medium",
              collapsed ? "justify-center" : "flex-1",
            )}
            title={
              collapsed
                ? email ||
                  (connected && address
                    ? `${address.slice(0, 6)}…${address.slice(-4)}`
                    : "Log in or connect")
                : undefined
            }
          >
            {email ? (
              <Mail className="h-4 w-4 shrink-0 text-white" />
            ) : (
              <Wallet className="h-4 w-4 shrink-0 text-white" />
            )}
            {!collapsed &&
              (email ? (
                <span className="truncate">{email}</span>
              ) : connected && address ? (
                <span className="truncate font-mono">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
              ) : (
                "Log in or connect"
              ))}
          </button>
          {!collapsed && !email && connected && address && (
            <button
              type="button"
              onClick={() => void copyAddress()}
              className="shrink-0 rounded p-0.5 text-white/45 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
              aria-label="Copy address"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-white" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
        {!collapsed && (
          <p className="px-1 text-[10px] leading-relaxed text-white/35">
            {email ? "Privy email · Arc Testnet" : "Wallet or email · Arc Testnet"}
          </p>
        )}
      </div>
    </aside>
  );
}
