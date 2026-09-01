"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useConnect, useAccount, useDisconnect } from "wagmi";
import { X, Wallet, ExternalLink, ShieldCheck, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { arcTestnet } from "@/lib/chains";
import { useEip6963 } from "@/hooks/useEip6963";
import { useWalletSession } from "@/hooks/useWalletSession";
import { getApiToken } from "@/lib/api";
import { restoreCorettaSessionFromPrivy } from "@/lib/privy/coretta-session";
import { EmailAuthPanel } from "./EmailAuthModal";

interface Props {
  open: boolean;
  onClose: () => void;
  emailEnabled?: boolean;
  onEmailSuccess?: (email: string) => void;
}

export default function WalletConnectModal({
  open,
  onClose,
  emailEnabled = false,
  onEmailSuccess,
}: Props) {
  const { connectAsync, connectors, isPending } = useConnect();
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const {
    ready: privyReady,
    authenticated: privyAuthenticated,
    user: privyUser,
  } = usePrivy();
  const {
    boundWallet,
    linkWalletToCurrentAccount,
    verified,
    verifying,
    verifyError,
  } = useWalletSession();
  const { supportedWallets, installedWallets } = useEip6963();
  const [view, setView] = useState<"options" | "email">("options");
  const [walletActionError, setWalletActionError] = useState<string | null>(null);
  const [walletActionSuccess, setWalletActionSuccess] = useState<string | null>(null);
  const [showWalletChoices, setShowWalletChoices] = useState(false);

  useEffect(() => {
    if (!open) {
      setView("options");
      setWalletActionError(null);
      setWalletActionSuccess(null);
      setShowWalletChoices(false);
    }
  }, [open]);

  if (!open) return null;

  const injected = connectors.find((c) => c.id === "injected");
  const wc = connectors.find((c) => c.id === "walletConnect");
  const wrongChain = isConnected && chain?.id !== arcTestnet.id;
  const privyEmail =
    privyReady && privyAuthenticated ? (privyUser?.email?.address ?? null) : null;
  const emailSessionActive = Boolean(privyEmail);
  const corettaSessionActive = Boolean(getApiToken());
  const corettaAccountActive = corettaSessionActive || emailSessionActive;
  const signedIn = corettaAccountActive || isConnected || (privyReady && privyAuthenticated);
  const walletLinkedToAccount = Boolean(
    address &&
      verified &&
      boundWallet &&
      boundWallet.toLowerCase() === address.toLowerCase(),
  );
  const walletBusy = isPending || verifying;

  const hasInstalled = installedWallets.length > 0;

  const restoreEmailSession = async () => {
    if (!emailSessionActive) return Boolean(getApiToken());
    return restoreCorettaSessionFromPrivy(privyEmail);
  };

  const connectWallet = async (connector: (typeof connectors)[number]) => {
    const linkToCurrentAccount = corettaAccountActive;
    setWalletActionError(null);
    setWalletActionSuccess(null);
    try {
      if (linkToCurrentAccount && !(await restoreEmailSession())) {
        throw new Error("Your Coretta session expired. Sign in again before linking a wallet.");
      }
      const result = await connectAsync({ connector, chainId: arcTestnet.id });
      const connectedAddress = result.accounts[0];
      if (!connectedAddress) throw new Error("No wallet address was returned.");
      if (!linkToCurrentAccount) {
        onClose();
        return;
      }
      const linked = await linkWalletToCurrentAccount(connectedAddress, result.chainId);
      if (!linked) return;
      setWalletActionSuccess("Wallet ownership verified and linked to this Coretta account.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wallet connection failed.";
      if (/user rejected|denied|rejected the request/i.test(message)) {
        setWalletActionError("The wallet request was cancelled. Your Coretta account did not change.");
      } else {
        setWalletActionError(message.slice(0, 180));
      }
    }
  };

  const linkCurrentWallet = async () => {
    if (!address) return;
    setWalletActionError(null);
    setWalletActionSuccess(null);
    try {
      if (!(await restoreEmailSession())) {
        throw new Error("Your Coretta session expired. Sign in again before linking a wallet.");
      }
      const linked = await linkWalletToCurrentAccount(address, chain?.id ?? 0);
      if (linked) {
        setWalletActionSuccess("Wallet ownership verified and linked to this Coretta account.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wallet linking failed.";
      setWalletActionError(message.slice(0, 180));
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-2xl"
        role="dialog"
        aria-labelledby="wallet-modal-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="wallet-modal-title" className="text-lg font-semibold text-black">
            {view === "email"
              ? isConnected
                ? "Link email"
                : "Continue with email"
              : signedIn
                ? emailSessionActive
                  ? "Your Coretta account"
                  : "Link wallet to your account"
                : "Log in or sign up"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-black/40 hover:bg-black/5"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {view === "email" ? (
          <EmailAuthPanel
            onCancel={() => setView("options")}
            onSuccess={(email) => {
              onEmailSuccess?.(email);
              onClose();
            }}
          />
        ) : (
          <>
            <p className="mb-5 text-sm leading-relaxed text-black/55">
              {emailSessionActive
                ? "Your Privy session and Coretta managed wallet are ready. You don't need to connect an external wallet to use Coretta."
                : isConnected
                  ? corettaAccountActive
                    ? "Verify and link this wallet to the Coretta account that is already signed in."
                    : "Manage your connected wallet or link an email to this account."
                  : signedIn
                    ? "Connect a wallet only to link it to the Coretta account that is already signed in."
                    : "Log in or sign up with email, or connect a wallet."}
            </p>

            {(walletActionError || verifyError) && (
              <p className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
                {walletActionError || verifyError}
              </p>
            )}
            {walletActionSuccess && (
              <p className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" role="status">
                {walletActionSuccess}
              </p>
            )}

            {emailSessionActive && privyEmail && (
              <div className="mb-4 rounded-xl border border-black/10 bg-[#F5F5F5] p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-black p-2 text-white">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-black">Signed in with Privy</p>
                      <ShieldCheck className="h-4 w-4 text-black" />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-black/65" title={privyEmail}>
                      {privyEmail}
                    </p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-black/40">
                      Privy sign-in · Managed wallet active
                    </p>
                  </div>
                </div>
              </div>
            )}

        {isConnected && address ? (
          <div className="space-y-4">
            <p className="text-sm text-black/70">
              {walletLinkedToAccount ? "Linked wallet:" : "Connected wallet, link required:"}{" "}
              <span className="font-mono font-semibold text-[#0A0A0A]">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            </p>
            {wrongChain && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Please switch to Arc Testnet (chain {arcTestnet.id}) in your wallet.
              </p>
            )}
            {emailEnabled && !emailSessionActive && (
              <Button variant="primary" className="w-full" onClick={() => setView("email")}>
                <Mail className="mr-2 h-4 w-4" />
                Link email to this wallet
              </Button>
            )}
            {corettaAccountActive && !walletLinkedToAccount && !wrongChain && (
              <Button
                variant="primary"
                className="w-full"
                disabled={walletBusy}
                onClick={() => void linkCurrentWallet()}
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                {verifying ? "Waiting for wallet signature..." : "Sign and link this wallet"}
              </Button>
            )}
            <Button variant="glass" className="w-full" onClick={() => disconnect()}>
              Disconnect
            </Button>
            {walletLinkedToAccount && (
              <Button variant="primary" className="w-full" onClick={onClose}>
                Done
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {emailSessionActive && !showWalletChoices ? (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-950">
                  No external wallet connection is required.
                </p>
                <p className="text-xs leading-relaxed text-emerald-900/75">
                  Keep using the managed wallet created for this Privy account. Link an external wallet only if you want that address attached as another verified sign-in and authorization method.
                </p>
                <Button variant="primary" className="w-full" onClick={onClose}>
                  Continue without linking a wallet
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs font-medium text-emerald-950 underline underline-offset-4"
                  onClick={() => setShowWalletChoices(true)}
                >
                  Link an external wallet instead
                </button>
              </div>
            ) : (
              <>
            {emailEnabled && !emailSessionActive && (
              <>
                <button
                  type="button"
                  onClick={() => setView("email")}
                  className="flex w-full items-center justify-between rounded-xl border border-black bg-black px-4 py-3 text-left text-white transition hover:bg-black/85"
                >
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5" />
                    <div>
                      <p className="font-medium">Continue with email</p>
                      <p className="text-xs text-white/60">Secure one-time code by Privy</p>
                    </div>
                  </div>
                  <ShieldCheck className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-wider text-black/35">
                  <span className="h-px flex-1 bg-black/10" />
                  Or connect a wallet
                  <span className="h-px flex-1 bg-black/10" />
                </div>
              </>
            )}
            {emailSessionActive && (
              <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-wider text-black/35">
                <span className="h-px flex-1 bg-black/10" />
                Link a wallet to this account
                <span className="h-px flex-1 bg-black/10" />
              </div>
            )}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-black/40">
                1. Browser Wallets
              </p>
              {hasInstalled ? (
                <ul className="space-y-2">
                  {installedWallets.map((w) => (
                    <li key={w.id}>
                      <button
                        type="button"
                        disabled={walletBusy}
                        onClick={() => injected && void connectWallet(injected)}
                        className="flex w-full items-center justify-between rounded-xl border border-black/10 bg-[#F5F5F5] px-4 py-3 text-left transition hover:border-[#0A0A0A]/50 hover:bg-white"
                      >
                        <div className="flex items-center gap-3">
                          <Wallet className="h-5 w-5 text-[#0A0A0A]" />
                          <div>
                            <p className="font-medium text-black">{w.name}</p>
                            <p className="text-[10px] font-medium text-[#0A0A0A]">
                              {corettaAccountActive ? "Link to this account" : "Installed"}
                            </p>
                          </div>
                        </div>
                        <ShieldCheck className="h-4 w-4 text-[#0A0A0A]" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-black/10 bg-[#F5F5F5] p-4 text-center">
                  <p className="text-sm font-medium text-black/70">
                    No supported browser wallet detected.
                  </p>
                  <p className="mt-1 text-xs text-black/45">
                    Install one of the supported extensions below or connect via WalletConnect.
                  </p>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-black/40">
                2. Mobile & Cross-Platform
              </p>
              {wc ? (
                <button
                  type="button"
                  disabled={walletBusy}
                  onClick={() => void connectWallet(wc)}
                  className="flex w-full items-center justify-between rounded-xl border border-black/10 bg-[#F5F5F5] px-4 py-3 text-left transition hover:border-[#0A0A0A]/50 hover:bg-white"
                >
                  <div className="flex items-center gap-3">
                    <Wallet className="h-5 w-5 text-[#0A0A0A]" />
                    <div>
                      <p className="font-medium text-black">WalletConnect</p>
                      <p className="text-xs text-black/45">
                        {corettaAccountActive ? "Scan, sign, and link to this account" : "Scan QR code with mobile wallet"}
                      </p>
                    </div>
                  </div>
                </button>
              ) : (
                <div className="rounded-xl border border-black/10 px-4 py-3 text-xs text-black/45">
                  WalletConnect setup: set NEXT_PUBLIC_WC_PROJECT_ID in environment
                </div>
              )}
            </div>

            {!hasInstalled && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-black/40">
                  Install Supported Wallets
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {supportedWallets.map((w) => (
                    <a
                      key={w.id}
                      href={w.installUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-lg border border-black/10 bg-[#F5F5F5] px-3 py-2 text-xs text-black/80 transition hover:bg-white hover:text-black"
                    >
                      <span>Install {w.name}</span>
                      <ExternalLink className="h-3 w-3 text-black/40" />
                    </a>
                  ))}
                </div>
              </div>
            )}
              </>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
