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
  onConnectWallet: () => void;
  connected: boolean;
  address?: string;
  email?: string | null;
}

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, type: "button" as const },
  { id: "chat", label: "Chat", icon: MessageSquare, type: "button" as const },
  { id: "usage", label: "Usage", icon: Wallet, type: "button" as const },
  { id: "settings", label: "Settings", icon: Settings, type: "button" as const },
] as const;

/** Light fintech sidebar — matches landing Halo shell + Coretta CR logo */
export default function AppSidebar({
  active = "dashboard",
  onDashboardClick,
  onSettingsClick,
  onUsageClick,
  onChatClick,
  onConnectWallet,
  connected,
  address,
  email,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-black/10 bg-white p-4 transition-[width] duration-200",
        collapsed ? "w-[4.5rem]" : "w-56",
      )}
    >
      <div
        className={cn(
          "mb-8 flex items-center gap-2",
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
          <CRLogo size="md" showGlow={false} />
          {!collapsed && (
            <span className="truncate text-[15px] font-semibold tracking-tight text-black">
              {BRAND_NAME}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded-lg p-1.5 text-black/50 transition-colors hover:bg-black/5 hover:text-black"
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

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const isActive = active === item.id;
          const className = cn(
            "flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors duration-200",
            collapsed && "justify-center px-0",
            isActive
              ? "bg-black text-white"
              : "text-gray-700 hover:bg-black/5 hover:text-black",
          );

          const inner = (
            <>
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
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

      <div className="mt-auto space-y-2 border-t border-black/10 pt-4">
        <Link
          href="/"
          className={cn(
            "flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors duration-200 hover:bg-black/5 hover:text-black",
            collapsed && "justify-center px-0",
          )}
          title={collapsed ? "Back to home" : undefined}
        >
          <span className="shrink-0 text-base leading-none">↗</span>
          {!collapsed && <span>Back to home</span>}
        </Link>
        <div
          className={cn(
            "group flex w-full items-center gap-2 rounded-full border border-black/10 bg-[#F5F5F5] text-left text-xs text-black",
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
              <Mail className="h-4 w-4 shrink-0 text-black" />
            ) : (
              <Wallet className="h-4 w-4 shrink-0 text-black" />
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
              className="shrink-0 rounded p-0.5 text-black/40 opacity-0 transition-opacity group-hover:opacity-100 hover:text-black"
              aria-label="Copy address"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-black" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
        {!collapsed && (
          <p className="px-1 text-[10px] leading-relaxed text-black/45">
            {email ? "Privy email · Arc Testnet" : "Wallet or email · Arc Testnet"}
          </p>
        )}
      </div>
    </aside>
  );
}
