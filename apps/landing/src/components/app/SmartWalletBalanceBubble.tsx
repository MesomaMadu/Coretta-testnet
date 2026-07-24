"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { apiFetch, getApiToken } from "@/lib/api";
import { readContract } from "viem/actions";
import { createPublicClient, http, formatUnits } from "viem";
import { useAccount } from "wagmi";
import { arcTestnet, USDC_ADDRESS, EURC_ADDRESS } from "@/lib/chains";

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

export function useWalletBalances() {
  const { address } = useAccount();
  const [usdc, setUsdc] = useState<string | null>(null);
  const [eurc, setEurc] = useState<string | null>(null);
  const [smartAddress, setSmartAddress] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const token = getApiToken();
    if (token) {
      try {
        const me = await apiFetch<{
          walletAddress?: string;
          balanceUsdc: string;
        }>("/v1/me");
        setSmartAddress(me.walletAddress ?? null);
        setUsdc(me.balanceUsdc);
        setEurc(null);
        setUpdatedAt(Date.now());
        return;
      } catch {
        /* fall through to on-chain */
      }
    }

    if (!address) {
      setUsdc(null);
      setEurc(null);
      setSmartAddress(null);
      return;
    }

    try {
      const [usdcRaw, eurcRaw] = await Promise.all([
        readContract(client, {
          address: USDC_ADDRESS,
          abi: [{ name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }],
          functionName: "balanceOf",
          args: [address],
        }),
        readContract(client, {
          address: EURC_ADDRESS,
          abi: [{ name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }],
          functionName: "balanceOf",
          args: [address],
        }),
      ]);
      setUsdc(formatUnits(usdcRaw as bigint, 6));
      setEurc(formatUnits(eurcRaw as bigint, 6));
      setSmartAddress(address);
      setUpdatedAt(Date.now());
    } catch {
      setUsdc(null);
      setEurc(null);
    }
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { usdc, eurc, smartAddress, updatedAt, refresh };
}

export function SmartWalletBalanceBubble() {
  const [open, setOpen] = useState(false);
  const { usdc, eurc, smartAddress, updatedAt } = useWalletBalances();

  if (usdc === null && eurc === null) return null;

  return (
    <div className="mx-4 mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl border border-[#8F5CFF]/25 bg-[#8F5CFF]/10 px-4 py-3 text-left transition hover:border-[#8F5CFF]/40"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[#8F5CFF]">Smart Wallet</p>
            <p className="text-sm font-medium text-white">
              Balance: {usdc ?? "—"} USDC
            </p>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 text-white/40" />
          ) : (
            <ChevronDown className="h-4 w-4 text-white/40" />
          )}
        </div>
        {!open && <p className="mt-1 text-[10px] text-white/40">View</p>}
      </button>

      {open && (
        <div className="mt-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-xs text-white/70">
          {smartAddress && (
            <p className="font-mono text-[10px] break-all">
              {smartAddress.slice(0, 6)}…{smartAddress.slice(-4)}
            </p>
          )}
          <p className="mt-2">USDC: {usdc ?? "—"}</p>
          {eurc !== null && <p>EURC: {eurc}</p>}
          <p className="mt-2 text-white/40">
            Last updated: {updatedAt ? "Just now" : "—"}
          </p>
        </div>
      )}
    </div>
  );
}
