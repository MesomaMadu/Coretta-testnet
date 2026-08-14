"use client";

import { apiFetch, getApiToken } from "@/lib/api";
import { isWalletVerifiedFor } from "@/lib/wallet-session";

export type InteractionKind =
  | "session"
  | "chat"
  | "preview"
  | "transfer"
  | "swap"
  | "navigation"
  | "signature"
  | "other";

export type InteractionStatus = "pending" | "complete" | "failed";

export interface WalletInteractionRecord {
  id: string;
  walletAddress: string;
  kind: string;
  label: string;
  status: InteractionStatus;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Track an app interaction only when the wallet is properly connected
 * (ownership verified + API session token).
 */
export async function trackWalletInteraction(params: {
  walletAddress: string | null | undefined;
  kind: InteractionKind;
  label: string;
  status?: InteractionStatus;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const address = params.walletAddress?.toLowerCase();
  if (!address) return false;
  if (!getApiToken()) return false;
  if (!isWalletVerifiedFor(address)) return false;

  try {
    await apiFetch("/v1/wallet/interactions", {
      method: "POST",
      body: JSON.stringify({
        walletAddress: address,
        kind: params.kind,
        label: params.label,
        status: params.status ?? "complete",
        metadata: params.metadata,
      }),
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("coretta-interaction-tracked", {
          detail: {
            walletAddress: address,
            kind: params.kind,
            label: params.label,
            status: params.status ?? "complete",
          },
        }),
      );
    }
    return true;
  } catch {
    return false;
  }
}

/** Load past interactions for a verified wallet. */
export async function fetchWalletInteractions(
  walletAddress: string,
  limit = 50,
): Promise<WalletInteractionRecord[]> {
  if (!getApiToken() || !isWalletVerifiedFor(walletAddress)) return [];
  try {
    const res = await apiFetch<{ interactions: WalletInteractionRecord[] }>(
      `/v1/wallet/interactions?walletAddress=${encodeURIComponent(walletAddress)}&limit=${limit}`,
    );
    return res.interactions ?? [];
  } catch {
    return [];
  }
}
