"use client";

import { useConnect, useAccount, useDisconnect } from "wagmi";
import { X, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { arcTestnet } from "@/lib/chains";

interface Props {
  open: boolean;
  onClose: () => void;
}

const WALLETS = [
  { id: "injected", label: "Browser wallet", hint: "MetaMask, Rabby, OKX, Zerion (EIP-6963)" },
  { id: "walletConnect", label: "WalletConnect", hint: "Scan QR with mobile wallet" },
] as const;

export default function WalletConnectModal({ open, onClose }: Props) {
  const { connect, connectors, isPending } = useConnect();
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();

  if (!open) return null;

  const injected = connectors.find((c) => c.id === "injected");
  const wc = connectors.find((c) => c.id === "walletConnect");

  const wrongChain = isConnected && chain?.id !== arcTestnet.id;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f172a]/95 p-6 shadow-2xl"
        role="dialog"
        aria-labelledby="wallet-modal-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="wallet-modal-title" className="text-lg font-semibold text-white">
            Connect wallet
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-white/50 hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isConnected && address ? (
          <div className="space-y-4">
            <p className="text-sm text-white/70">
              Connected:{" "}
              <span className="font-mono text-cyan-300">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            </p>
            {wrongChain && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Switch to Arc Testnet (chain {arcTestnet.id}) in your wallet.
              </p>
            )}
            <Button variant="glass" className="w-full" onClick={() => disconnect()}>
              Disconnect
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {WALLETS.map((w) => {
              const connector = w.id === "injected" ? injected : wc;
              if (!connector) {
                if (w.id === "walletConnect") {
                  return (
                    <li
                      key={w.id}
                      className="rounded-xl border border-white/10 px-4 py-3 text-sm text-white/40"
                    >
                      WalletConnect — set NEXT_PUBLIC_WC_PROJECT_ID to enable
                    </li>
                  );
                }
                return null;
              }
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      connect({ connector, chainId: arcTestnet.id });
                      onClose();
                    }}
                    className="flex w-full items-start gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left transition hover:border-cyan-400/40 hover:bg-white/10"
                  >
                    <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" />
                    <div>
                      <p className="font-medium text-white">{w.label}</p>
                      <p className="text-xs text-white/45">{w.hint}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
