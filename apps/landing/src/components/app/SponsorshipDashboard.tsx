"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import {
  Clock,
  Shield,
  Sparkles,
  Zap,
  MessageSquare,
  Mic,
  RefreshCw,
  Wallet,
  PenLine,
  Link2,
} from "lucide-react";
import { apiFetch, getApiToken } from "@/lib/api";
import type { UserUsageMetrics } from "@arcremit/shared";
import { fadeUpItem, staggerContainer } from "@/lib/motion";
import { useWalletSession } from "@/hooks/useWalletSession";
import { Button } from "@/components/ui/button";

export default function SponsorshipDashboard() {
  const { address, isConnected } = useAccount();
  const { verified, verifying, verifyOwnership, usageMetrics } = useWalletSession();
  const [metrics, setMetrics] = useState<UserUsageMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  const fetchMetrics = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setError(null);

      if (!isConnected || !address) {
        setMetrics(null);
        setError("Connect a wallet to view live usage for that address.");
        setLoading(false);
        return;
      }

      if (!verified || !getApiToken()) {
        setMetrics(null);
        setError("Verify wallet ownership to enable live usage tracking.");
        setLoading(false);
        return;
      }

      try {
        const data = await apiFetch<UserUsageMetrics>(
          `/v1/user/usage?walletAddress=${encodeURIComponent(address)}`,
        );
        setMetrics(data);
        setLastFetchedAt(Date.now());
        window.dispatchEvent(
          new CustomEvent("coretta-usage-updated", { detail: data }),
        );
      } catch (err) {
        setMetrics(null);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load live usage for this wallet.",
        );
      } finally {
        if (showLoading) setLoading(false);
        else setLoading(false);
      }
    },
    [address, isConnected, verified],
  );

  useEffect(() => {
    void fetchMetrics(true);
    if (!isConnected || !address || !verified) return;
    const interval = window.setInterval(() => void fetchMetrics(false), 3000);
    return () => window.clearInterval(interval);
  }, [fetchMetrics, isConnected, address, verified]);

  // Prefer metrics pushed from ownership auth / track responses.
  useEffect(() => {
    if (
      usageMetrics?.walletAddress &&
      address &&
      usageMetrics.walletAddress.toLowerCase() === address.toLowerCase()
    ) {
      setMetrics(usageMetrics);
      setLastFetchedAt(Date.now());
      setError(null);
      setLoading(false);
    }
  }, [usageMetrics, address]);

  useEffect(() => {
    const onUsage = (e: Event) => {
      const detail = (e as CustomEvent<UserUsageMetrics>).detail;
      if (!detail?.walletAddress || !address) return;
      if (detail.walletAddress.toLowerCase() !== address.toLowerCase()) return;
      setMetrics(detail);
      setLastFetchedAt(Date.now());
      setError(null);
      setLoading(false);
    };
    window.addEventListener("coretta-usage-updated", onUsage);
    return () => window.removeEventListener("coretta-usage-updated", onUsage);
  }, [address]);

  if (loading && !metrics) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-white/50">
        <RefreshCw className="h-6 w-6 animate-spin text-[#8F5CFF]" />
      </div>
    );
  }

  if (!metrics || error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Wallet className="h-8 w-8 text-[#8F5CFF]" />
        <div>
          <h1 className="text-lg font-semibold text-white">Live wallet usage</h1>
          <p className="mt-2 max-w-sm text-sm text-white/50">
            {error ?? "No live metrics yet for this wallet."}
          </p>
          {address && (
            <p className="mt-2 font-mono text-xs text-white/35">
              {address.slice(0, 6)}…{address.slice(-4)}
            </p>
          )}
        </div>
        {isConnected && !verified && (
          <Button
            variant="primary"
            disabled={verifying}
            onClick={() => void verifyOwnership()}
          >
            {verifying ? "Waiting for signature…" : "Sign to enable live tracking"}
          </Button>
        )}
        {isConnected && verified && (
          <Button variant="glass" onClick={() => void fetchMetrics(true)}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  const formatTimer = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const usdPercent = Math.min(
    100,
    Math.round((metrics.sponsoredUsdSpent / (metrics.sponsoredUsdLimit || 1)) * 100),
  );

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex h-full flex-col overflow-y-auto bg-[var(--ar-bg)] p-6 md:p-8"
    >
      <motion.header variants={fadeUpItem} className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Usage & Sponsorship
            </h1>
            <p className="subheading-text mt-1 text-sm text-white/45">
              Live counters for the connected wallet — updates every 3s.
            </p>
            {metrics.walletAddress && (
              <p className="mt-1 font-mono text-xs text-[#8F5CFF]">
                {metrics.walletAddress.slice(0, 8)}…{metrics.walletAddress.slice(-6)}
                {metrics.live ? " · live" : ""}
                {lastFetchedAt
                  ? ` · refreshed ${new Date(lastFetchedAt).toLocaleTimeString()}`
                  : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchMetrics(false)}
              className="rounded-full border border-white/10 p-2 text-white/50 hover:bg-white/5 hover:text-white"
              aria-label="Refresh usage"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#8F5CFF]/30 bg-[#8F5CFF]/10 px-3 py-1 text-xs font-medium text-[#8F5CFF]">
              <Shield className="h-3.5 w-3.5" />
              Tier: {metrics.userTier.replace(/_/g, " ").toUpperCase()}
            </span>
          </div>
        </div>
      </motion.header>

      <div className="mx-auto w-full max-w-xl space-y-6">
        <motion.div
          variants={fadeUpItem}
          className="rounded-2xl border border-[var(--ar-border)] bg-[var(--ar-surface)] p-6 backdrop-blur-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Daily Sponsorship Allowance</h2>
            <span className="flex items-center gap-1 text-xs text-white/45">
              <Clock className="h-3.5 w-3.5 text-[#8F5CFF]" /> Resets in{" "}
              {formatTimer(metrics.resetInSeconds)}
            </span>
          </div>

          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white">
              ${metrics.sponsoredUsdSpent.toFixed(2)}
            </span>
            <span className="text-xs text-white/50">
              / ${metrics.sponsoredUsdLimit} Sponsored
            </span>
          </div>

          <div className="h-3 w-full overflow-hidden rounded-full bg-white/10 p-0.5">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#153E75] via-[#7C4DFF] to-[#8F5CFF]"
              initial={{ width: 0 }}
              animate={{ width: `${usdPercent}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </motion.div>

        <motion.div variants={fadeUpItem} className="grid gap-4 sm:grid-cols-2">
          <QuotaCard
            icon={Zap}
            title="Transactions Sponsored"
            current={metrics.sponsoredTxCount}
            limit={metrics.sponsoredTxLimit}
          />
          <QuotaCard
            icon={Shield}
            title="OTP Requests"
            current={metrics.otpRequestCount}
            limit={metrics.otpRequestLimit}
          />
          <QuotaCard
            icon={MessageSquare}
            title="AI Requests"
            current={metrics.aiRequestCount}
            limit={metrics.aiRequestLimit}
          />
          <QuotaCard
            icon={Sparkles}
            title="Swap Requests"
            current={metrics.swapRequestCount}
            limit={metrics.swapRequestLimit}
          />
          <QuotaCard
            icon={Mic}
            title="Voice Requests"
            current={metrics.voiceRequestCount}
            limit={metrics.voiceRequestLimit}
          />
          <QuotaCard
            icon={PenLine}
            title="Ownership Signatures"
            current={metrics.signatureRequestCount}
            limit={null}
          />
          <QuotaCard
            icon={Link2}
            title="Wallet Connections"
            current={metrics.connectionCount}
            limit={null}
          />
          <QuotaCard
            icon={Wallet}
            title="Wallet Activations"
            current={metrics.walletCreationCount}
            limit={null}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

function QuotaCard({
  icon: Icon,
  title,
  current,
  limit,
}: {
  icon: typeof Zap;
  title: string;
  current: number;
  limit: number | null;
}) {
  const percent =
    limit == null ? 0 : Math.min(100, Math.round((current / (limit || 1)) * 100));

  return (
    <div className="rounded-xl border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#8F5CFF]/30 bg-[#8F5CFF]/10 text-[#8F5CFF]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/50">{title}</p>
          <p className="text-sm font-semibold text-white">
            {current}
            {limit != null && <span className="text-xs text-white/40"> / {limit}</span>}
          </p>
        </div>
      </div>
      {limit != null && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#8F5CFF]" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}
