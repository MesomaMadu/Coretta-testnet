"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  RefreshCw,
  WalletCards,
  XCircle,
} from "lucide-react";
import {
  formatAbsoluteTime,
  useActivityFeed,
  type ActivityItem,
} from "@/hooks/useActivityFeed";
import { useWalletSession } from "@/hooks/useWalletSession";
import { useWalletBalances } from "./SmartWalletBalanceBubble";
import { cn } from "@/lib/utils";
import {
  getDeveloperDiagnosticsEnabled,
  subscribeDeveloperDiagnostics,
} from "@/lib/developer-diagnostics";

interface Props {
  onConnectWallet: () => void;
}

const ARC_EXPLORER = "https://testnet.arcscan.app";

function formatBalance(value: string | null) {
  if (value == null) return "—";
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function parseAmount(item: ActivityItem) {
  const amount = Number.parseFloat(item.amount ?? "0");
  return Number.isFinite(amount) ? amount : 0;
}

function combineTokenBalances(...balances: Array<string | null>) {
  const parsed = balances
    .map((balance) => Number.parseFloat(balance ?? ""))
    .filter((balance) => Number.isFinite(balance));
  if (parsed.length === 0) return null;
  return parsed.reduce((sum, balance) => sum + balance, 0).toString();
}

export default function DashboardPanel({ onConnectWallet }: Props) {
  const [balanceDetailsOpen, setBalanceDetailsOpen] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [developerDiagnostics, setDeveloperDiagnostics] = useState(false);
  const { smartWalletActive, identityConnected, smartWalletAddress } = useWalletSession();
  const {
    usdc,
    eurc,
    updatedAt,
    refresh: refreshBalances,
    isConnected,
  } = useWalletBalances();
  const {
    items,
    loading,
    loadError,
    hasApiSession,
    refresh: refreshActivity,
  } = useActivityFeed();

  useEffect(() => {
    setDeveloperDiagnostics(getDeveloperDiagnosticsEnabled());
    return subscribeDeveloperDiagnostics(setDeveloperDiagnostics);
  }, []);

  const combinedBalance = smartWalletAddress ? combineTokenBalances(usdc, eurc) : null;

  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const recentPeriod = items.filter((item) => (item.timestamp ?? 0) >= sevenDaysAgo);
  const completedCount = recentPeriod.filter((item) => item.status === "complete").length;
  const terminalCount = recentPeriod.filter((item) => item.status !== "pending").length;
  const settledRate = terminalCount > 0 ? Math.round((completedCount / terminalCount) * 100) : 0;
  const usdcVolume = recentPeriod
    .filter((item) => item.asset?.toUpperCase() === "USDC")
    .reduce((sum, item) => sum + parseAmount(item), 0);
  const dailyCounts = Array.from({ length: 7 }, (_, index) => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - (6 - index));
    const start = dayStart.getTime();
    const end = start + 86_400_000;
    return recentPeriod.filter((item) => {
      const timestamp = item.timestamp ?? 0;
      return timestamp >= start && timestamp < end;
    }).length;
  });
  const maxDailyCount = Math.max(...dailyCounts, 1);

  const emptyActivityMessage = !identityConnected
    ? "Sign in or connect a wallet to see your activity."
    : !hasApiSession
      ? "Your Coretta session has expired. Sign in again to continue."
      : loadError ?? "Your completed transfers will appear here.";

  return (
    <div className="h-full overflow-y-auto bg-[#F5F5F5] p-5 text-black md:p-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7C4DFF]">
            Overview
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black">Dashboard</h1>
          <p className="subheading-text mt-1 text-sm text-black/50">
            Your smart wallet and recent Coretta activity in one place.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="flex min-h-64 flex-col rounded-[20px] border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  Smart wallet
                </p>
                <h2 className="mt-1 text-sm font-semibold text-black">Managed balances</h2>
              </div>
              <div className="flex items-center gap-2">
                {isConnected && (
                  <button
                    type="button"
                    onClick={() => void refreshBalances()}
                    className="rounded-full p-2 text-black/40 transition hover:bg-black/5 hover:text-black"
                    aria-label="Refresh smart wallet balances"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                )}
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-white">
                  <WalletCards className="h-5 w-5" />
                </div>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl bg-[#F5F5F5]">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 p-4 text-left"
                onClick={() => setBalanceDetailsOpen((open) => !open)}
                aria-expanded={balanceDetailsOpen}
                aria-controls="managed-balance-breakdown"
              >
                <div className="min-w-0">
                  <p className="text-[10px] text-black/45">Total</p>
                  <p className="mt-2 truncate text-xl font-semibold tracking-tight text-black">
                    {formatBalance(combinedBalance)}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-black/40">
                    Combined USDC + EURC amount
                  </p>
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black/55">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      balanceDetailsOpen && "rotate-180",
                    )}
                  />
                </span>
              </button>

              {balanceDetailsOpen && (
                <div
                  id="managed-balance-breakdown"
                  className="grid grid-cols-2 gap-3 border-t border-black/10 p-3"
                >
                  <BalanceCard
                    label="USDC balance"
                    value={smartWalletAddress ? formatBalance(usdc) : "—"}
                    asset="USDC"
                  />
                  <BalanceCard
                    label="EURC balance"
                    value={smartWalletAddress ? formatBalance(eurc) : "—"}
                    asset="EURC"
                  />
                </div>
              )}
            </div>

            <div className="mt-auto pt-5">
              {smartWalletAddress ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/10 pt-4">
                  <div className="min-w-0">
                    <p className="text-[10px] text-black/40">Smart wallet address</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-black/70">
                      {smartWalletAddress}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-semibold",
                      smartWalletActive
                        ? "bg-[#7C4DFF]/10 text-[#7C4DFF]"
                        : "bg-black/5 text-black/45",
                    )}
                  >
                    {smartWalletActive ? "Active" : "Preparing"}
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
                  <p className="text-xs text-black/45">
                    {identityConnected
                      ? "Your smart wallet will appear after activation."
                      : "Connect to view your smart wallet."}
                  </p>
                  <button
                    type="button"
                    onClick={onConnectWallet}
                    className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition hover:bg-black/80"
                  >
                    {identityConnected ? "Manage access" : "Connect wallet"}
                  </button>
                </div>
              )}
              {updatedAt && (
                <p className="mt-2 text-[9px] text-black/35">
                  Updated {new Date(updatedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          </section>

          <section className="flex min-h-64 flex-col rounded-[20px] border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  Activity overview
                </p>
                <h2 className="mt-1 text-sm font-semibold text-black">Last 7 days</h2>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7C4DFF]/10 text-[#7C4DFF]">
                <Activity className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <Metric label="Transfers" value={recentPeriod.length.toString()} />
              <Metric
                label="USDC volume"
                value={usdcVolume.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              />
              <Metric label="Settled rate" value={`${settledRate}%`} />
            </div>

            <div className="mt-auto flex h-16 items-end gap-2 pt-5" aria-label="Activity over the last seven days">
              {dailyCounts.map((count, index) => (
                <div key={index} className="flex h-full flex-1 items-end">
                  <span
                    className="block w-full rounded-t-md bg-gradient-to-t from-[#7C4DFF] to-[#8F5CFF] transition-[height]"
                    style={{ height: count > 0 ? `${Math.max(18, (count / maxDailyCount) * 100)}%` : "8%" }}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[20px] border border-black/10 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  Activity
                </p>
                <h2 className="mt-1 text-sm font-semibold text-black">
                  {activityExpanded ? "All transfers" : "Latest transfers"}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {identityConnected && hasApiSession && (
                  <button
                    type="button"
                    onClick={refreshActivity}
                    className="rounded-full p-2 text-black/40 transition hover:bg-black/5 hover:text-black"
                    aria-label="Refresh recent activity"
                    disabled={loading}
                  >
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  </button>
                )}
                {items.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setActivityExpanded((expanded) => !expanded)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-2 text-xs font-semibold text-black transition hover:bg-black/5"
                    aria-expanded={activityExpanded}
                  >
                    {activityExpanded ? "View less" : "View all"}
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        activityExpanded && "rotate-180",
                      )}
                    />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 divide-y divide-black/10">
              {loading && items.length === 0 && (
                <p className="py-8 text-center text-xs text-black/40">Loading activity…</p>
              )}
              {!loading && items.length === 0 && (
                <p className="py-8 text-center text-xs text-black/40">{emptyActivityMessage}</p>
              )}
              {items.slice(0, activityExpanded ? items.length : 4).map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </div>
          </section>

          {developerDiagnostics && (
            <ArcInfrastructure smartWalletActive={smartWalletActive} />
          )}
        </div>
      </div>
    </div>
  );
}

function BalanceCard({ label, value, asset }: { label: string; value: string; asset: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-[10px] text-black/45">{label}</p>
      <p className="mt-2 truncate text-xl font-semibold tracking-tight text-black">{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-black/40">{asset}</p>
    </div>
  );
}

function ArcInfrastructure({ smartWalletActive }: { smartWalletActive: boolean }) {
  const services = [
    { label: "Arc RPC", value: "Arc Testnet" },
    { label: "Bundler", value: "Coretta route" },
    { label: "Circle Wallets", value: smartWalletActive ? "Active" : "Standby" },
    { label: "Circle Paymaster", value: "USDC gas" },
  ];

  return (
    <section className="rounded-[20px] border border-black/10 bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
            Infrastructure
          </p>
          <h2 className="mt-1 text-sm font-semibold text-black">Arc services</h2>
        </div>
        <span className="rounded-full bg-[#7C4DFF]/10 px-2.5 py-1 text-[10px] font-semibold text-[#7C4DFF]">
          Developer diagnostics
        </span>
      </div>

      <div className="mt-4 divide-y divide-black/10">
        {services.map((service) => (
          <div key={service.label} className="flex items-center justify-between gap-4 py-3 text-xs">
            <span className="font-medium text-black">{service.label}</span>
            <span className="inline-flex items-center gap-1.5 text-black/55">
              <span className="h-1.5 w-1.5 rounded-full bg-[#7C4DFF]" />
              {service.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] text-black/40">{label}</p>
      <p className="mt-1 truncate text-base font-semibold tracking-tight text-black">{value}</p>
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const Icon = item.status === "complete" ? CheckCircle2 : item.status === "failed" ? XCircle : Clock;
  const statusLabel = item.status === "complete" ? "Settled" : item.status === "failed" ? "Failed" : "Pending";
  const explorer =
    item.explorerUrl ??
    (item.txHash ? `${ARC_EXPLORER}/tx/${item.txHash}` : undefined);
  const detailsId = `transaction-details-${item.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            item.status === "complete"
              ? "bg-[#7C4DFF]/10 text-[#7C4DFF]"
              : item.status === "failed"
                ? "bg-[#7C4DFF]/20 text-[#4F2BB5]"
                : "bg-[#7C4DFF]/5 text-[#8F5CFF]",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-black">{item.label}</p>
          <p className="mt-0.5 text-[10px] text-black/40">{item.time}</p>
        </div>
        <div className="shrink-0 text-right">
          {item.amount && item.asset && (
            <p className="text-xs font-semibold text-black">
              {item.amount} {item.asset}
            </p>
          )}
          <p className="mt-0.5 text-[10px] text-black/40">{statusLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-black/45 transition hover:bg-black/5 hover:text-black"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          aria-label={`${detailsOpen ? "Hide" : "View"} details for ${item.label}`}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              detailsOpen && "rotate-180",
            )}
          />
        </button>
      </div>

      {detailsOpen && (
        <div
          id={detailsId}
          className="mt-3 grid gap-3 rounded-xl bg-[#F5F5F5] p-3 sm:grid-cols-2"
        >
          <TransactionDetail label="Status" value={statusLabel} />
          <TransactionDetail label="State" value={item.state} />
          <TransactionDetail label="Transaction" value={item.label} />
          <TransactionDetail
            label="Amount"
            value={item.amount && item.asset ? `${item.amount} ${item.asset}` : item.amount}
          />
          <TransactionDetail label="Recipient" value={item.recipient} mono />
          <TransactionDetail label="Network" value={item.network ?? "Arc Testnet"} />
          <TransactionDetail label="Timestamp" value={formatAbsoluteTime(item.timestamp)} />
          <TransactionDetail label="Relative time" value={item.time} />
          <TransactionDetail
            label="Transaction hash"
            value={item.txHash}
            mono
            href={explorer}
          />
          <TransactionDetail
            label="Explorer"
            value={explorer ? "Open on Arcscan" : undefined}
            href={explorer}
          />
          <TransactionDetail label="Failure reason" value={item.failureReason} />
          <TransactionDetail label="Activity ID" value={item.id} mono />
        </div>
      )}
    </div>
  );
}

function TransactionDetail({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  href?: string;
}) {
  if (!value) return null;

  return (
    <div className="min-w-0">
      <p className="text-[9px] font-medium uppercase tracking-wide text-black/40">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "mt-1 inline-flex max-w-full items-center gap-1 break-all text-[10px] text-black underline-offset-2 hover:underline",
            mono && "font-mono",
          )}
        >
          {value}
          <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
        </a>
      ) : (
        <p className={cn("mt-1 break-all text-[10px] text-black/75", mono && "font-mono")}>
          {value}
        </p>
      )}
    </div>
  );
}
