"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useSignMessage } from "wagmi";
import { arcTestnet } from "@/lib/chains";
import { apiFetch, getApiToken, setApiToken, clearApiToken } from "@/lib/api";
import {
  buildOwnershipMessage,
  clearBoundWallet,
  clearWalletSession,
  clearWalletVerification,
  getBoundWallet,
  isSmartWalletActive,
  isWalletVerifiedFor,
  setBoundWallet,
  setOwnershipPromptedAddress,
  setSmartWalletActive,
  setWalletVerified,
  wasOwnershipPromptedFor,
} from "@/lib/wallet-session";
import type { UserUsageMetrics } from "@coretta/shared";

/** Shared across hook instances — one ownership sign flow at a time. */
let ownershipVerifyInFlight: Promise<boolean> | null = null;

/** Debounce real disconnect so reconnect flicker does not wipe the session. */
const DISCONNECT_CLEAR_MS = 2500;
/** Wait until connector is stable before the one-time auto ownership prompt. */
const STABLE_CONNECT_MS = 900;

let disconnectClearTimer: ReturnType<typeof setTimeout> | null = null;
/** Last address that held a stable connected session (module-wide). */
let lastStableAddress: string | null = null;

function hasValidOwnershipSession(address: string): boolean {
  return isWalletVerifiedFor(address) && Boolean(getApiToken());
}

function cancelPendingDisconnectClear() {
  if (disconnectClearTimer) {
    clearTimeout(disconnectClearTimer);
    disconnectClearTimer = null;
  }
}

function scheduleDisconnectClear(onCleared: () => void) {
  cancelPendingDisconnectClear();
  disconnectClearTimer = setTimeout(() => {
    disconnectClearTimer = null;
    clearWalletSession();
    clearApiToken();
    lastStableAddress = null;
    ownershipVerifyInFlight = null;
    onCleared();
    window.dispatchEvent(new Event("coretta-wallet-disconnect"));
  }, DISCONNECT_CLEAR_MS);
}

function useWalletSessionState(autoVerify: boolean) {
  const { address, chainId, status } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const {
    ready: privyReady,
    authenticated: privyAuthenticated,
    user: privyUser,
  } = usePrivy();
  const [verified, setVerified] = useState(false);
  const [smartWalletActive, setSmartActive] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [activating, setActivating] = useState(false);
  const [boundWallet, setBound] = useState<string | null>(null);
  const [smartWalletAddress, setSmartWalletAddress] = useState<string | null>(null);
  const [usageMetrics, setUsageMetrics] = useState<UserUsageMetrics | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [bindingsReady, setBindingsReady] = useState(false);
  const [requiresWalletSignature, setRequiresWalletSignature] = useState<
    boolean | null
  >(null);
  const usageRefreshInFlight = useRef<Promise<UserUsageMetrics | null> | null>(null);
  /** True only after connected+address have been stable long enough. */
  const [connectionStable, setConnectionStable] = useState(false);

  const isConnected = status === "connected" && Boolean(address);
  const emailAddress =
    privyReady && privyAuthenticated ? (privyUser?.email?.address ?? null) : null;
  const emailAuthenticated = Boolean(emailAddress);
  const emailOnlyMode =
    bindingsReady &&
    emailAuthenticated &&
    requiresWalletSignature === false &&
    Boolean(getApiToken());
  const identityConnected = emailAuthenticated || isConnected;

  const syncBindings = useCallback(async () => {
    const token = getApiToken();
    if (!token) {
      setBound(getBoundWallet());
      setRequiresWalletSignature(null);
      setBindingsReady(false);
      return null;
    }
    try {
      const statusRes = await apiFetch<{
        boundPrimaryWallet?: string | null;
        smartWalletActivated?: boolean;
        smartWalletAddress?: string | null;
        verifiedEmail?: string | null;
        requiresWalletSignature?: boolean;
      }>("/v1/wallet/status");
      if (statusRes.boundPrimaryWallet) {
        setBoundWallet(statusRes.boundPrimaryWallet);
        setBound(statusRes.boundPrimaryWallet);
      } else {
        clearBoundWallet();
        setBound(null);
      }
      const emailSmartWalletReady = Boolean(
        statusRes.verifiedEmail &&
          statusRes.smartWalletAddress &&
          !statusRes.boundPrimaryWallet,
      );
      const active = Boolean(
        statusRes.smartWalletActivated || emailSmartWalletReady,
      );
      setSmartWalletActive(active);
      setSmartActive(active);
      setSmartWalletAddress(statusRes.smartWalletAddress ?? null);
      setRequiresWalletSignature(statusRes.requiresWalletSignature ?? true);
      return statusRes;
    } catch {
      setBound(getBoundWallet());
      setRequiresWalletSignature(null);
      return null;
    } finally {
      setBindingsReady(true);
    }
  }, []);

  const refreshUsage = useCallback(
    async (walletAddr?: string | null) => {
      const addr = walletAddr === null ? null : (walletAddr ?? address);
      const token = getApiToken();
      if (!token) {
        setUsageMetrics(null);
        return null;
      }
      if (usageRefreshInFlight.current) return usageRefreshInFlight.current;
      const request = (async () => {
        try {
          const query = addr
            ? `?walletAddress=${encodeURIComponent(addr)}&_=${Date.now()}`
            : `?_=${Date.now()}`;
          const data = await apiFetch<UserUsageMetrics>(`/v1/user/usage${query}`);
          setUsageMetrics(data);
          window.dispatchEvent(
            new CustomEvent("coretta-usage-updated", { detail: data }),
          );
          return data;
        } catch {
          return null;
        }
      })();
      usageRefreshInFlight.current = request;
      try {
        return await request;
      } finally {
        usageRefreshInFlight.current = null;
      }
    },
    [address],
  );

  useEffect(() => {
    void syncBindings();
  }, [syncBindings]);

  useEffect(() => {
    const onSessionUpdated = () => void syncBindings();
    window.addEventListener("coretta-api-session-updated", onSessionUpdated);
    return () =>
      window.removeEventListener("coretta-api-session-updated", onSessionUpdated);
  }, [syncBindings]);

  // Wallet/auth events can also be emitted by the connect and transaction flows.
  useEffect(() => {
    const onVerified = (e: Event) => {
      const detail = (e as CustomEvent<{ address?: string }>).detail;
      if (!address || !detail?.address) return;
      if (detail.address.toLowerCase() === address.toLowerCase()) {
        setVerified(true);
        setVerifyError(null);
      }
    };
    const onCleared = () => {
      setVerified(false);
      setUsageMetrics(null);
      setConnectionStable(false);
    };
    const onUsage = (e: Event) => {
      const detail = (e as CustomEvent<UserUsageMetrics>).detail;
      if (!detail) return;
      if (
        emailAuthenticated ||
        (address &&
          detail.walletAddress &&
          detail.walletAddress.toLowerCase() === address.toLowerCase())
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
  }, [address, emailAuthenticated]);

  /**
   * Stabilize connect / disconnect:
   * - Do NOT treat missing address alone as logout (common during provider re-init).
   * - Debounce disconnect clears so brief flicker does not force another sign.
   * - Same address reconnect within the debounce keeps the existing session.
   */
  useEffect(() => {
    if (status === "connecting" || status === "reconnecting") {
      setConnectionStable(false);
      return;
    }

    if (status === "disconnected") {
      setConnectionStable(false);
      if (emailAuthenticated && getApiToken()) {
        cancelPendingDisconnectClear();
        setVerified(false);
        setVerifying(false);
        setVerifyError(null);
        return;
      }
      // Only schedule a session wipe if we had a live session.
      if (lastStableAddress || hasAnySessionHint()) {
        scheduleDisconnectClear(() => {
          setVerified(false);
          setSmartActive(false);
          setVerifying(false);
          setUsageMetrics(null);
          setVerifyError(null);
        });
      } else {
        setVerified(false);
        setSmartActive(false);
        setVerifying(false);
        setUsageMetrics(null);
      }
      return;
    }

    // status === "connected" — need address before treating as stable
    if (status !== "connected" || !address) {
      setConnectionStable(false);
      return;
    }

    cancelPendingDisconnectClear();

    const key = address.toLowerCase();

    // Account switch (different address while still "connected")
    if (lastStableAddress && lastStableAddress !== key) {
      clearWalletSession();
      clearApiToken();
      ownershipVerifyInFlight = null;
      setVerified(false);
      setVerifyError(null);
    }

    lastStableAddress = key;

    const already = hasValidOwnershipSession(address);
    setVerified(already);
    setSmartActive(isSmartWalletActive());
    setBound(getBoundWallet());
    if (already) {
      setOwnershipPromptedAddress(key);
      void refreshUsage(address);
    }

    // Mark connection stable only after a short settle window (one timer per address).
    setConnectionStable(false);
    const t = setTimeout(() => {
      // Re-check status/address still match before enabling auto-prompt.
      setConnectionStable(true);
    }, STABLE_CONNECT_MS);

    return () => clearTimeout(t);
  }, [status, address, refreshUsage, emailAuthenticated]);

  // One provider-owned background poll. Mutations also trigger an immediate refresh.
  useEffect(() => {
    if (!getApiToken()) return;
    const usageAddress = isConnected && address && verified ? address : emailAuthenticated ? null : undefined;
    if (usageAddress === undefined) return;
    void refreshUsage(usageAddress);
    const id = window.setInterval(() => void refreshUsage(usageAddress), 30_000);
    return () => window.clearInterval(id);
  }, [isConnected, address, verified, emailAuthenticated, refreshUsage]);

  const isBoundMismatch = Boolean(
    boundWallet && address && boundWallet.toLowerCase() !== address.toLowerCase(),
  );

  const verifyOwnership = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!address) return false;
      if (chainId !== arcTestnet.id) {
        setVerified(false);
        setVerifyError("Switch your wallet to Arc Testnet before signing in.");
        return false;
      }

      // Already signed this connection — never open another wallet prompt.
      if (hasValidOwnershipSession(address)) {
        setVerified(true);
        setOwnershipPromptedAddress(address);
        setVerifyError(null);
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
      setVerifyError(null);
      // Remember we asked so remounts / reconnect flicker cannot open a second prompt.
      setOwnershipPromptedAddress(address);

      ownershipVerifyInFlight = (async () => {
        try {
          const message = buildOwnershipMessage(
            address,
            chainId,
          );
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
          setSmartWalletActive(true);
          setSmartActive(true);
          if (auth.smartWalletAddress) {
            setSmartWalletAddress(auth.smartWalletAddress);
          }
          setUsageMetrics(auth.metrics);
          setVerifyError(null);
          window.dispatchEvent(
            new CustomEvent("coretta-usage-updated", { detail: auth.metrics }),
          );
          void syncBindings();
          return true;
        } catch (err) {
          // Keep connector session. Do not auto-reprompt; surface error for manual retry.
          clearWalletVerification(address);
          setVerified(false);
          setUsageMetrics(null);
          // Keep prompted flag so we do not spam another automatic sign request.
          setOwnershipPromptedAddress(address);
          const msg =
            err instanceof Error
              ? err.message
              : "Ownership verification failed";
          // User rejected in wallet — softer message, no loop.
          if (/user rejected|denied|rejected the request/i.test(msg)) {
            setVerifyError("Signature cancelled. Click Sign now when ready.");
          } else if (/Failed to fetch|NetworkError|ECONNREFUSED/i.test(msg)) {
            setVerifyError(
              "API unreachable. Start the API server, then click Sign now.",
            );
          } else {
            setVerifyError(msg.slice(0, 180));
          }
          return false;
        }
      })();

      try {
        return await ownershipVerifyInFlight;
      } finally {
        ownershipVerifyInFlight = null;
        setVerifying(false);
      }
    },
    [address, chainId, signMessageAsync, refreshUsage, syncBindings],
  );

  const verifyOwnershipRef = useRef(verifyOwnership);
  verifyOwnershipRef.current = verifyOwnership;

  // Exactly one automatic ownership prompt after a stable connect (not on flicker / remount).
  useEffect(() => {
    if (!autoVerify) return;
    if (emailOnlyMode) return;
    if (!connectionStable || !address || status !== "connected") return;
    if (hasValidOwnershipSession(address)) {
      setOwnershipPromptedAddress(address);
      setVerified(true);
      return;
    }
    // Already prompted for this address in this tab session — do not open wallet again.
    // Manual "Sign now" still works (verifyOwnership does not re-check this flag).
    if (wasOwnershipPromptedFor(address)) return;
    if (ownershipVerifyInFlight) return;
    // Mark before calling so concurrent hook instances cannot double-fire.
    setOwnershipPromptedAddress(address);
    void verifyOwnershipRef.current();
  }, [autoVerify, connectionStable, address, status, emailOnlyMode]);

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

  const canTransact = emailOnlyMode
    ? smartWalletActive && Boolean(smartWalletAddress)
    : verified &&
      smartWalletActive &&
      !isBoundMismatch &&
      chainId === arcTestnet.id;

  const retryVerifyOwnership = useCallback(
    () => verifyOwnership({ force: true }),
    [verifyOwnership],
  );

  return {
    verified,
    smartWalletActive,
    verifying,
    activating,
    verifyOwnership: retryVerifyOwnership,
    activateSmartWallet,
    canTransact,
    boundWallet,
    smartWalletAddress,
    isBoundMismatch,
    emailOnlyMode,
    emailAuthenticated,
    emailAddress,
    identityConnected,
    bindingsReady,
    requiresWalletSignature,
    syncBindings,
    usageMetrics,
    refreshUsage,
    verifyError,
  };
}

export type WalletSessionState = ReturnType<typeof useWalletSessionState>;

const WalletSessionContext = createContext<WalletSessionState | null>(null);

export function WalletSessionProvider({
  children,
  autoVerify = true,
}: {
  children: ReactNode;
  autoVerify?: boolean;
}) {
  const value = useWalletSessionState(autoVerify);
  return createElement(WalletSessionContext.Provider, { value }, children);
}

export function useWalletSession(): WalletSessionState {
  const value = useContext(WalletSessionContext);
  if (!value) {
    throw new Error("useWalletSession must be used inside WalletSessionProvider");
  }
  return value;
}

function hasAnySessionHint(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    getApiToken() ||
      sessionStorage.getItem("coretta_wallet_verified") === "true" ||
      sessionStorage.getItem("coretta_ownership_prompted_address"),
  );
}

/** Call on full wallet disconnect from UI if token was wallet-scoped. */
export function clearWalletApiSession() {
  cancelPendingDisconnectClear();
  clearWalletSession();
  clearApiToken();
  lastStableAddress = null;
  ownershipVerifyInFlight = null;
}
