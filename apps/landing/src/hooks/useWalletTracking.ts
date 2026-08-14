"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useWalletSession } from "@/hooks/useWalletSession";
import {
  trackWalletInteraction,
  type InteractionKind,
  type InteractionStatus,
} from "@/lib/wallet-tracking";

/**
 * Tracks wallet-scoped app interactions only while ownership is verified.
 * Safe to mount in AppShell — no-ops until properly connected.
 */
export function useWalletTracking() {
  const { address } = useAccount();
  const { verified } = useWalletSession();
  const sessionTrackedFor = useRef<string | null>(null);

  const track = useCallback(
    async (params: {
      kind: InteractionKind;
      label: string;
      status?: InteractionStatus;
      metadata?: Record<string, unknown>;
    }) => {
      if (!verified || !address) return false;
      return trackWalletInteraction({
        walletAddress: address,
        kind: params.kind,
        label: params.label,
        status: params.status,
        metadata: params.metadata,
      });
    },
    [verified, address],
  );

  // One "session active" event when wallet becomes properly connected.
  useEffect(() => {
    if (!verified || !address) {
      if (!verified) sessionTrackedFor.current = null;
      return;
    }
    const key = address.toLowerCase();
    if (sessionTrackedFor.current === key) return;
    sessionTrackedFor.current = key;
    void track({
      kind: "session",
      label: "App session active with verified wallet",
      metadata: { source: "app_shell" },
    });
  }, [verified, address, track]);

  return { track, canTrack: Boolean(verified && address) };
}
