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
import { getApiToken } from "@/lib/api";
import { fadeUpItem, staggerContainer } from "@/lib/motion";
import { useWalletSession } from "@/hooks/useWalletSession";
import { Button } from "@/components/ui/button";
type UserTier = "anonymous" | "email_verified" | "wallet_verified" | "trusted";

interface UserUsageMetrics {
  userTier: UserTier;
  walletAddress: string | null;
  live: boolean;
  sponsoredTxCount: number;
  sponsoredTxLimit: number;
  sponsoredUsdSpent: number;
  sponsoredUsdLimit: number;
  aiRequestCount: number;
  aiRequestLimit: number;
  otpRequestCount: number;
  otpRequestLimit: number;
  swapRequestCount: number;
  swapRequestLimit: number;
  voiceRequestCount: number;
  voiceRequestLimit: number;
  txSimulationCount: number;
  batchTxCount: number;
  walletCreationCount: number;
  signatureRequestCount: number;
  connectionCount: number;
  resetInSeconds: number;
  lastResetAt: string;
  updatedAt: string;
}

export default function SponsorshipDashboard() {
  const { address, isConnected } = useAccount();
  const {
    verified,
    verifying,
    verifyOwnership,
    usageMetrics,
    refreshUsage,
    verifyError,
    emailAuthenticated,
    emailAddress,
    identityConnected,
  } = useWalletSession();
  const [metrics, setMetrics] = useState<UserUsageMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  /**
   * Single refresh path — do NOT poll here.
   * useWalletSession already polls usage while verified; chatbot settle
   * also calls refreshUsage immediately. A second 3s poll doubled load and
   * made counters look stale when Supabase latency piled up requests.
   */
  const fetchMetrics = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setError(null);

      if (!identityConnected) {
        setMetrics(null);
        setError("Sign in with Privy email or connect a wallet to view live usage.");
        setLoading(false);
        return;
      }

      if ((!emailAuthenticated && !verified) || !getApiToken()) {
        setMetrics(null);
        setError(
          emailAuthenticated
            ? "Your Coretta session has expired. Sign in with Privy again."
            : "Verify wallet ownership to enable live usage tracking.",
        );
        setLoading(false);
        return;
      }

      try {
        const data = await refreshUsage(
          isConnected && verified && address ? address : null,
        );
        if (data) {
          setMetrics(data);
          setLastFetchedAt(Date.now());
          setError(null);
        } else if (showLoading) {
          setError("Failed to load live usage for this account.");
        }
      } catch (err) {
        if (showLoading) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load live usage for this account.",
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [
      address,
      emailAuthenticated,
      identityConnected,
      isConnected,
      refreshUsage,
      verified,
    ],
  );

  useEffect(() => {
    void fetchMetrics(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / wallet change only
  }, [identityConnected, isConnected, address, verified, emailAuthenticated]);

  // Prefer live metrics from the shared session hook (poll + settle refresh).
  useEffect(() => {
    if (
      usageMetrics &&
      (emailAuthenticated ||
        (usageMetrics.walletAddress &&
          address &&
          usageMetrics.walletAddress.toLowerCase() === address.toLowerCase()))
    ) {
      setMetrics(usageMetrics);
      setLastFetchedAt(Date.now());
      setError(null);
      setLoading(false);
    }
  }, [usageMetrics, address, emailAuthenticated]);

  useEffect(() => {
    const onUsage = (e: Event) => {
      const detail = (e as CustomEvent<UserUsageMetrics>).detail;
      if (!detail) return;
      if (
        !emailAuthenticated &&
        (!detail.walletAddress ||
          !address ||
          detail.walletAddress.toLowerCase() !== address.toLowerCase())
      ) {
        return;
      }
      setMetrics(detail);
      setLastFetchedAt(Date.now());
      setError(null);
      setLoading(false);
    };
    window.addEventListener("coretta-usage-updated", onUsage);
    return () => window.removeEventListener("coretta-usage-updated", onUsage);
  }, [address, emailAuthenticated]);

  if (loading && !metrics) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F5F5F5] p-8 text-black/50">
        <RefreshCw className="h-6 w-6 animate-spin text-[#0A0A0A]" />
      </div>
    );
  }

  if (!metrics || error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#F5F5F5] p-8 text-center">
        <Wallet className="h-8 w-8 text-[#0A0A0A]" />
        <div>
          <h1 className="text-lg font-semibold text-black">Live account usage</h1>
          <p className="mt-2 max-w-sm text-sm text-black/50">
            {error ?? "No live metrics yet for this account."}
          </p>
          {emailAuthenticated && emailAddress ? (
            <p className="mt-2 text-xs text-black/50">{emailAddress}</p>
          ) : address ? (
            <p className="mt-2 font-mono text-xs text-black/40">
              {address.slice(0, 6)}…{address.slice(-4)}
            </p>
          ) : null}
        </div>
        {isConnected && !emailAuthenticated && !verified && (
          <div className="flex flex-col items-center gap-2">
            {verifyError && (
              <p className="max-w-sm text-xs text-amber-800">{verifyError}</p>
            )}
            <Button
              variant="primary"
              disabled={verifying}
              onClick={() => void verifyOwnership()}
            >
              {verifying ? "Waiting for signature…" : "Sign to enable live tracking"}
            </Button>
          </div>
        )}
        {identityConnected && (emailAuthenticated || verified) && (
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
      className="flex h-full flex-col overflow-y-auto bg-[#F5F5F5] p-6 md:p-8"
    >
      <motion.header variants={fadeUpItem} className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-black">
              Usage & Limits
            </h1>
            <p className="subheading-text mt-1 text-sm text-black/50">
              Live counters for the signed-in account. They update on each
              remit or swap and while this session is open.
            </p>
            {emailAuthenticated && emailAddress && (
              <p className="mt-1 text-xs text-black/50">Privy email · {emailAddress}</p>
            )}
            {metrics.walletAddress && (
              <p className="mt-1 font-mono text-xs text-[#0A0A0A]">
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
              className="rounded-full border border-black/10 bg-white p-2 text-black/50 hover:bg-black/5 hover:text-black"
              aria-label="Refresh usage"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#0A0A0A]/25 bg-[#0A0A0A]/10 px-3 py-1 text-xs font-medium text-[#0A0A0A]">
              <Shield className="h-3.5 w-3.5" />
              Tier: {metrics.userTier.replace(/_/g, " ").toUpperCase()}
            </span>
          </div>
        </div>
      </motion.header>

      <div className="mx-auto w-full max-w-xl space-y-6">
        <motion.div
          variants={fadeUpItem}
          className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-black">Daily Transfer Allowance</h2>
            <span className="flex items-center gap-1 text-xs text-black/50">
              <Clock className="h-3.5 w-3.5 text-[#0A0A0A]" /> Resets in{" "}
              {formatTimer(metrics.resetInSeconds)}
            </span>
          </div>

          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-black">
              ${metrics.sponsoredUsdSpent.toFixed(2)}
            </span>
            <span className="text-xs text-black/50">
              / ${metrics.sponsoredUsdLimit} volume
            </span>
          </div>

          <div className="h-3 w-full overflow-hidden rounded-full bg-black/10 p-0.5">
            <motion.div
              className="h-full rounded-full bg-black"
              initial={{ width: 0 }}
              animate={{ width: `${usdPercent}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </motion.div>

        <motion.div variants={fadeUpItem} className="grid gap-4 sm:grid-cols-2">
          <QuotaCard
            icon={Zap}
            title="Transactions"
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
    <div className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#0A0A0A]/25 bg-[#0A0A0A]/10 text-[#0A0A0A]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-black/50">{title}</p>
          <p className="text-sm font-semibold text-black">
            {current}
            {limit != null && <span className="text-xs text-black/40"> / {limit}</span>}
          </p>
        </div>
      </div>
      {limit != null && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
          <div className="h-full rounded-full bg-[#0A0A0A]" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}
