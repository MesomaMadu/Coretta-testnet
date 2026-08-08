"use client";

import { useConnect, useAccount, useDisconnect } from "wagmi";
import { X, Wallet, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { arcTestnet } from "@/lib/chains";
import { useEip6963 } from "@/hooks/useEip6963";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function WalletConnectModal({ open, onClose }: Props) {
  const { connect, connectors, isPending } = useConnect();
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const { supportedWallets, installedWallets } = useEip6963();

  if (!open) return null;

  const injected = connectors.find((c) => c.id === "injected");
  const wc = connectors.find((c) => c.id === "walletConnect");
  const wrongChain = isConnected && chain?.id !== arcTestnet.id;

  const hasInstalled = installedWallets.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-2xl"
        role="dialog"
        aria-labelledby="wallet-modal-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="wallet-modal-title" className="text-lg font-semibold text-black">
            Connect Wallet
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

        {isConnected && address ? (
          <div className="space-y-4">
            <p className="text-sm text-black/70">
              Connected Address:{" "}
              <span className="font-mono font-semibold text-[#0A0A0A]">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            </p>
            {wrongChain && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Please switch to Arc Testnet (chain {arcTestnet.id}) in your wallet.
              </p>
            )}
            <Button variant="glass" className="w-full" onClick={() => disconnect()}>
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
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
                        disabled={isPending}
                        onClick={() => {
                          if (!injected) return;
                          // Close only after connect resolves so the session is not dropped mid-handshake.
                          connect(
                            { connector: injected, chainId: arcTestnet.id },
                            {
                              onSuccess: () => onClose(),
                              onError: () => {
                                /* keep modal open so user can retry */
                              },
                            },
                          );
                        }}
                        className="flex w-full items-center justify-between rounded-xl border border-black/10 bg-[#F5F5F5] px-4 py-3 text-left transition hover:border-[#0A0A0A]/50 hover:bg-white"
                      >
                        <div className="flex items-center gap-3">
                          <Wallet className="h-5 w-5 text-[#0A0A0A]" />
                          <div>
                            <p className="font-medium text-black">{w.name}</p>
                            <p className="text-[10px] font-medium text-[#0A0A0A]">Installed</p>
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
                  disabled={isPending}
                  onClick={() => {
                    connect(
                      { connector: wc, chainId: arcTestnet.id },
                      {
                        onSuccess: () => onClose(),
                        onError: () => {
                          /* keep modal open so user can retry */
                        },
                      },
                    );
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-black/10 bg-[#F5F5F5] px-4 py-3 text-left transition hover:border-[#0A0A0A]/50 hover:bg-white"
                >
                  <div className="flex items-center gap-3">
                    <Wallet className="h-5 w-5 text-[#0A0A0A]" />
                    <div>
                      <p className="font-medium text-black">WalletConnect</p>
                      <p className="text-xs text-black/45">Scan QR code with mobile wallet</p>
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
          </div>
        )}
      </div>
    </div>
  );
}
