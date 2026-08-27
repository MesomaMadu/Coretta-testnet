"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getApiToken } from "@/lib/api";
import { useWalletSession } from "@/hooks/useWalletSession";

export interface ActivityItem {
  id: string;
  label: string;
  status: "pending" | "complete" | "failed";
  time: string;
  timestamp?: number;
  asset?: string;
  amount?: string;
  recipient?: string;
  txHash?: string;
  failureReason?: string;
  network?: string;
  explorerUrl?: string;
  state?: string;
}

interface ActivityResponseItem {
  id: string;
  kind: "send" | "swap";
  label: string;
  status: "pending" | "complete" | "failed";
  state: string;
  createdAt: string;
  asset?: string;
  amount?: string;
  recipient?: string;
  txHash?: string;
  failureReason?: string;
  network?: string;
  explorerUrl?: string;
}

interface ActivityResponse {
  activities: ActivityResponseItem[];
}

export function formatRelativeTime(ts?: number) {
  if (!ts) return "Just now";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatAbsoluteTime(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function useActivityFeed() {
  const { identityConnected } = useWalletSession();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [hasApiSession, setHasApiSession] = useState(() => Boolean(getApiToken()));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const canShowHistory = identityConnected && hasApiSession;

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const syncSession = () => setHasApiSession(Boolean(getApiToken()));
    window.addEventListener("coretta-api-session-updated", syncSession);
    window.addEventListener("storage", syncSession);
    return () => {
      window.removeEventListener("coretta-api-session-updated", syncSession);
      window.removeEventListener("storage", syncSession);
    };
  }, []);

  useEffect(() => {
    if (!canShowHistory) {
      setItems([]);
      setLoadError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void apiFetch<ActivityResponse>("/v1/activity?limit=50")
      .then(({ activities }) => {
        if (cancelled) return;
        setItems(
          activities.map((item) => {
            const timestamp = Date.parse(item.createdAt);
            return {
              ...item,
              timestamp,
              time: formatRelativeTime(timestamp),
            };
          }),
        );
      })
      .catch((error) => {
        if (cancelled) return;
        setItems([]);
        setLoadError(
          error instanceof Error ? error.message : "Activity could not be loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canShowHistory, refreshKey]);

  return {
    items,
    identityConnected,
    hasApiSession,
    canShowHistory,
    loading,
    loadError,
    refresh,
  };
}
