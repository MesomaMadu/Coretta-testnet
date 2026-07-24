"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { arcTestnet } from "@/lib/chains";
import { apiFetch, getApiToken, setApiToken, clearApiToken } from "@/lib/api";
import {
  buildOwnershipMessage,
  clearWalletSession,
  clearWalletVerification,
  getBoundWallet,
  isSmartWalletActive,
  isWalletVerifiedFor,
  setBoundWallet,
  setSmartWalletActive,
  setWalletVerified,
} from "@/lib/wallet-session";
import type { UserUsageMetrics } from "@arcremit/shared";

/** Shared across hook instances so only one ownership prompt fires per connect. */
let ownershipVerifyInFlight: Promise<boolean> | null = null;
let autoPromptedForAddress: string | null = null;

export function useWalletSession() {
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const [verified, setVerified] = useState(false);
  const [smartWalletActive, setSmartActive] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [activating, setActivating] = useState(false);
  const [boundWallet, setBound] = useState<string | null>(null);
  const [smartWalletAddress, setSmartWalletAddress] = useState<string | null>(null);
  const [usageMetrics, setUsageMetrics] = useState<UserUsageMetrics | null>(null);

  const syncBindings = useCallback(async () => {
    const token = getApiToken();
    if (!token) {
      setBound(getBoundWallet());
      return;
    }
    try {
      const status = await apiFetch<{
        boundPrimaryWallet?: string | null;
        smartWalletActivated?: boolean;
        smartWalletAddress?: string | null;
      }>("/v1/wallet/status");
      if (status.boundPrimaryWallet) {
        setBoundWallet(status.boundPrimaryWallet);
        setBound(status.boundPrimaryWallet);
      }
      if (status.smartWalletActivated) {
        setSmartWalletActive(true);
        setSmartActive(true);
      }
      setSmartWalletAddress(status.smartWalletAddress ?? null);
    } catch {
      setBound(getBoundWallet());
    }
  }, []);

  const refreshUsage = useCallback(async (walletAddr?: string | null) => {
    const addr = walletAddr ?? address;
    const token = getApiToken();
    if (!token || !addr) {
      setUsageMetrics(null);
      return null;
    }
    try {
      const data = await apiFetch<UserUsageMetrics>(
        `/v1/user/usage?walletAddress=${encodeURIComponent(addr)}`,
      );
      setUsageMetrics(data);
      window.dispatchEvent(
        new CustomEvent("coretta-usage-updated", { detail: data }),
      );
      return data;
    } catch {
      setUsageMetrics(null);
      return null;
    }
  }, [address]);

  useEffect(() => {
    void syncBindings();
  }, [syncBindings]);

  // Keep verified flag in sync across hook instances + storage changes.
  useEffect(() => {
    const onVerified = (e: Event) => {
      const detail = (e as CustomEvent<{ address?: string }>).detail;
      if (!address || !detail?.address) return;
      if (detail.address.toLowerCase() === address.toLowerCase()) {
        setVerified(true);
      }
    };
    const onCleared = () => {
      setVerified(false);
      setUsageMetrics(null);
    };
    const onUsage = (e: Event) => {
      const detail = (e as CustomEvent<UserUsageMetrics>).detail;
      if (!detail) return;
      if (
        address &&
        detail.walletAddress &&
        detail.walletAddress.toLowerCase() === address.toLowerCase()
      ) {
        setUsageMetrics(detail);
      }
    };
    window.addEventListener("coretta-wallet-verified", onVerified);
    window.addEventListener("coretta-wallet-verification-cleared", onCleared);
    window.addEventListener("coretta-usage-updated", onUsage);
    return () => {
      window.removeEventListener("coretta-wallet-verified", onVerified);
      window.removeEventListener("coretta-wallet-verification-cleared", onCleared);
      window.removeEventListener("coretta-usage-updated", onUsage);
    };
  }, [address]);

  useEffect(() => {
    if (!isConnected || !address) {
      autoPromptedForAddress = null;
      ownershipVerifyInFlight = null;
      clearWalletSession();
      setVerified(false);
      setSmartActive(false);
      setVerifying(false);
      setUsageMetrics(null);
      return;
    }

    const already = isWalletVerifiedFor(address);
    setVerified(already);
    setSmartActive(isSmartWalletActive());
    setBound(getBoundWallet());
    if (already && getApiToken()) {
      void refreshUsage(address);
    }
  }, [isConnected, address, refreshUsage]);

  // Live poll usage for the currently connected wallet while verified.
  useEffect(() => {
    if (!isConnected || !address || !verified || !getApiToken()) return;
    void refreshUsage(address);
    const id = window.setInterval(() => void refreshUsage(address), 3000);
    return () => window.clearInterval(id);
  }, [isConnected, address, verified, refreshUsage]);

  const isBoundMismatch =
    Boolean(boundWallet && address && boundWallet.toLowerCase() !== address.toLowerCase());

  const verifyOwnership = useCallback(async () => {
    if (!address) return false;

    if (isWalletVerifiedFor(address) && getApiToken()) {
      setVerified(true);
      void refreshUsage(address);
      return true;
    }

    if (ownershipVerifyInFlight) {
      setVerifying(true);
      try {
        return await ownershipVerifyInFlight;
      } finally {
        setVerifying(false);
      }
    }

    setVerifying(true);
    ownershipVerifyInFlight = (async () => {
      try {
        const message = buildOwnershipMessage(address, chainId ?? arcTestnet.id);
        const signature = await signMessageAsync({ message });

        const auth = await apiFetch<{
          token: string;
          walletAddress: string;
          smartWalletAddress?: string | null;
          smartWalletActivated?: boolean;
          boundPrimaryWallet?: string | null;
          metrics: UserUsageMetrics;
        }>("/v1/auth/wallet", {
          method: "POST",
          auth: false,
          body: JSON.stringify({
            address,
            message,
            signature,
          }),
        });

        setApiToken(auth.token);
        setWalletVerified(address);
        setBoundWallet(auth.boundPrimaryWallet ?? address);
        setBound((auth.boundPrimaryWallet ?? address).toLowerCase());
        setVerified(true);
        // Smart wallet is bound to the connected EOA on ownership verify — no email required.
        setSmartWalletActive(true);
        setSmartActive(true);
        if (auth.smartWalletAddress) {
          setSmartWalletAddress(auth.smartWalletAddress);
        }
        setUsageMetrics(auth.metrics);
        window.dispatchEvent(
          new CustomEvent("coretta-usage-updated", { detail: auth.metrics }),
        );
        void syncBindings();
        return true;
      } catch {
        clearWalletVerification(address);
        setVerified(false);
        setUsageMetrics(null);
        disconnect();
        return false;
      }
    })();

    try {
      return await ownershipVerifyInFlight;
    } finally {
      ownershipVerifyInFlight = null;
      setVerifying(false);
    }
  }, [address, chainId, signMessageAsync, disconnect, refreshUsage, syncBindings]);

  // One-time ownership sign immediately after a fresh wallet connect.
  useEffect(() => {
    if (!isConnected || !address) return;
    if (isWalletVerifiedFor(address) && getApiToken()) return;

    const key = address.toLowerCase();
    if (autoPromptedForAddress === key) return;
    autoPromptedForAddress = key;
    void verifyOwnership();
  }, [isConnected, address, verifyOwnership]);

  const activateSmartWallet = useCallback(async () => {
    if (!verified || !address) return false;
    setActivating(true);
    try {
      setSmartWalletActive(true);
      setSmartActive(true);
      setBoundWallet(address);
      setBound(address.toLowerCase());

      const token = getApiToken();
      if (token) {
        const res = await apiFetch<{
          boundPrimaryWallet?: string | null;
          smartWalletAddress?: string | null;
        }>("/v1/wallet/activate", {
          method: "POST",
          body: JSON.stringify({ primaryWalletAddress: address }),
        });
        if (res.boundPrimaryWallet) setBound(res.boundPrimaryWallet);
        if (res.smartWalletAddress) setSmartWalletAddress(res.smartWalletAddress);
        void refreshUsage(address);
      }
      return true;
    } catch {
      setSmartWalletActive(false);
      setSmartActive(false);
      return false;
    } finally {
      setActivating(false);
    }
  }, [verified, address, refreshUsage]);

  const canTransact = verified && smartWalletActive && !isBoundMismatch;
  const emailOnlyMode = !isConnected && Boolean(getApiToken());

  return {
    verified,
    smartWalletActive,
    verifying,
    activating,
    verifyOwnership,
    activateSmartWallet,
    canTransact,
    boundWallet,
    smartWalletAddress,
    isBoundMismatch,
    emailOnlyMode,
    syncBindings,
    usageMetrics,
    refreshUsage,
  };
}

/** Call on full wallet disconnect from UI if token was wallet-scoped. */
export function clearWalletApiSession() {
  clearApiToken();
}
