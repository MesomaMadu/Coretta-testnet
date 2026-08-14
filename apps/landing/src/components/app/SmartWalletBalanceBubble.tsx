"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Wallet } from "lucide-react";
import { apiFetch, getApiToken } from "@/lib/api";
import { readContract } from "viem/actions";
import { createPublicClient, http, formatUnits, type Address } from "viem";
import { useAccount } from "wagmi";
import { arcTestnet, USDC_ADDRESS, EURC_ADDRESS } from "@/lib/chains";
import { cn } from "@/lib/utils";

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

async function readTokenBalance(token: Address, holder: Address) {
  const raw = await readContract(client, {
    address: token,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [holder],
  });
  return formatUnits(raw as bigint, 6);
}

export function useWalletBalances() {
  const { address, isConnected } = useAccount();
  const [usdc, setUsdc] = useState<string | null>(null);
  const [eurc, setEurc] = useState<string | null>(null);
  const [smartAddress, setSmartAddress] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const clear = useCallback(() => {
    setUsdc(null);
    setEurc(null);
    setSmartAddress(null);
    setUpdatedAt(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!isConnected || !address) {
      clear();
      return;
    }

    let sca: Address | null = null;
    const token = getApiToken();
    if (token) {
      try {
        const me = await apiFetch<{
          walletAddress?: string;
          balanceUsdc?: string;
        }>("/v1/me");
        if (me.walletAddress) {
          sca = me.walletAddress as Address;
          setSmartAddress(me.walletAddress);
        }
      } catch {
        /* fall through — still try on-chain with EOA */
      }
    }

    const holder = (sca ?? (address as Address)) as Address;

    try {
      const [usdcBal, eurcBal] = await Promise.all([
        readTokenBalance(USDC_ADDRESS, holder),
        readTokenBalance(EURC_ADDRESS, holder),
      ]);
      setUsdc(usdcBal);
      setEurc(eurcBal);
      if (!sca) setSmartAddress(holder);
      setUpdatedAt(Date.now());
    } catch {
      setUsdc(null);
      setEurc(null);
    }
  }, [address, isConnected, clear]);

  useEffect(() => {
    void refresh();
    if (!isConnected || !address) return;
    const id = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(id);
  }, [refresh, isConnected, address]);

  return { usdc, eurc, smartAddress, updatedAt, refresh, isConnected };
}

/**
 * Compact wallet icon (placed beside chatbot name).
 * Click → total balance, wallet address, USDC, EURC.
 */
export function SmartWalletBalanceBubble({
  className,
}: {
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { usdc, eurc, smartAddress, updatedAt, isConnected, refresh } =
    useWalletBalances();

  useEffect(() => {
    if (!open) return;
    void refresh();
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, refresh]);

  if (!isConnected) return null;

  const usdcDisplay = usdc ?? "—";
  const eurcDisplay = eurc ?? "—";
  const total =
    usdc != null || eurc != null
      ? (Number.parseFloat(usdc ?? "0") || 0) +
        (Number.parseFloat(eurc ?? "0") || 0)
      : null;
  const totalDisplay =
    total == null
      ? "—"
      : total.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        });

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/15 bg-white text-black shadow-sm transition hover:border-black/30 hover:bg-black/[0.03]",
          open && "border-black/40 bg-black/[0.04]",
        )}
        aria-label="Smart wallet balance"
        aria-expanded={open}
      >
        <Wallet className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute left-1/2 top-full z-40 mt-2 w-64 -translate-x-1/2 rounded-xl border border-black/10 bg-white p-3 text-left shadow-lg md:left-0 md:translate-x-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-black/45">
            Smart wallet
          </p>
          <p className="mt-1 text-sm font-semibold text-black">
            Total balance: {totalDisplay}
          </p>
          {smartAddress && (
            <p className="mt-2 break-all font-mono text-[10px] text-black/55">
              {smartAddress}
            </p>
          )}
          <div className="mt-2 space-y-1 text-xs text-black">
            <p>
              <span className="text-black/50">USDC:</span> {usdcDisplay}
            </p>
            <p>
              <span className="text-black/50">EURC:</span> {eurcDisplay}
            </p>
          </div>
          <p className="mt-2 text-[10px] text-black/40">
            Updated{" "}
            {updatedAt ? new Date(updatedAt).toLocaleTimeString() : "n/a"}
          </p>
        </div>
      )}
    </div>
  );
}
