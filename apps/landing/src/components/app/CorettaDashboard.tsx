"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import NetworkArc from "@web3icons/react/icons/networks/NetworkArc";
import NetworkArbitrumSepolia from "@web3icons/react/icons/networks/NetworkArbitrumSepolia";
import NetworkAvalancheFuji from "@web3icons/react/icons/networks/NetworkAvalancheFuji";
import NetworkBaseSepolia from "@web3icons/react/icons/networks/NetworkBaseSepolia";
import NetworkCodex from "@web3icons/react/icons/networks/NetworkCodex";
import NetworkEdgeless from "@web3icons/react/icons/networks/NetworkEdgeless";
import NetworkEthereum from "@web3icons/react/icons/networks/NetworkEthereum";
import NetworkHyperEvm from "@web3icons/react/icons/networks/NetworkHyperEvm";
import NetworkInjective from "@web3icons/react/icons/networks/NetworkInjective";
import NetworkInk from "@web3icons/react/icons/networks/NetworkInk";
import NetworkLineaSepolia from "@web3icons/react/icons/networks/NetworkLineaSepolia";
import NetworkMonadTestnet from "@web3icons/react/icons/networks/NetworkMonadTestnet";
import NetworkOptimismSepolia from "@web3icons/react/icons/networks/NetworkOptimismSepolia";
import NetworkPlume from "@web3icons/react/icons/networks/NetworkPlume";
import NetworkPolygonAmoy from "@web3icons/react/icons/networks/NetworkPolygonAmoy";
import NetworkSeiNetwork from "@web3icons/react/icons/networks/NetworkSeiNetwork";
import NetworkSonic from "@web3icons/react/icons/networks/NetworkSonic";
import NetworkUnichain from "@web3icons/react/icons/networks/NetworkUnichain";
import NetworkWorld from "@web3icons/react/icons/networks/NetworkWorld";
import NetworkXdc from "@web3icons/react/icons/networks/NetworkXdc";
import { apiFetch, getApiToken } from "@/lib/api";
import { useActivityFeed, type ActivityItem } from "@/hooks/useActivityFeed";
import { useProfile } from "@/hooks/useProfile";
import { useWalletSession } from "@/hooks/useWalletSession";
import { useWalletBalances } from "./SmartWalletBalanceBubble";
import { CCTP_EVM_TESTNET_DESTINATIONS } from "@coretta/shared";

type ChainBalance = {
  id: string;
  label: string;
  chainId: number;
  explorerUrl: string;
  balance: string | null;
  status: "ready" | "unavailable";
};

type ChainBalanceResult = {
  totalBalance: string;
  availableChainCount: number;
  unavailableChainCount: number;
  chains: ChainBalance[];
  updatedAt: string;
};

const CHAIN_COLORS: Record<string, string> = {
  Arc_Testnet: "#7C4DFF",
  Arbitrum_Sepolia: "#28A0F0",
  Avalanche_Fuji: "#E84142",
  Base_Sepolia: "#0052FF",
  Codex_Testnet: "#111111",
  Edge_Testnet: "#F27649",
  Ethereum_Sepolia: "#627EEA",
  HyperEVM_Testnet: "#2ED3B7",
  Injective_Testnet: "#00A3FF",
  Ink_Testnet: "#FA4EE5",
  Linea_Sepolia: "#61DFFF",
  Monad_Testnet: "#836EF9",
  Morph_Testnet: "#77EACB",
  Optimism_Sepolia: "#FF0420",
  Pharos_Testnet: "#FFB547",
  Plume_Testnet: "#E9A6FF",
  Polygon_Amoy_Testnet: "#8247E5",
  Sei_Testnet: "#9A1C1F",
  Sonic_Testnet: "#1C90FF",
  Unichain_Sepolia: "#FF2D78",
  World_Chain_Sepolia: "#171717",
  XDC_Apothem: "#1C8A9E",
};

const CHAIN_ICONS: Record<string, typeof NetworkArc> = {
  Arc_Testnet: NetworkArc,
  Arbitrum_Sepolia: NetworkArbitrumSepolia,
  Avalanche_Fuji: NetworkAvalancheFuji,
  Base_Sepolia: NetworkBaseSepolia,
  Codex_Testnet: NetworkCodex,
  Edge_Testnet: NetworkEdgeless,
  Ethereum_Sepolia: NetworkEthereum,
  HyperEVM_Testnet: NetworkHyperEvm,
  Injective_Testnet: NetworkInjective,
  Ink_Testnet: NetworkInk,
  Linea_Sepolia: NetworkLineaSepolia,
  Monad_Testnet: NetworkMonadTestnet,
  Optimism_Sepolia: NetworkOptimismSepolia,
  Plume_Testnet: NetworkPlume,
  Polygon_Amoy_Testnet: NetworkPolygonAmoy,
  Sei_Testnet: NetworkSeiNetwork,
  Sonic_Testnet: NetworkSonic,
  Unichain_Sepolia: NetworkUnichain,
  World_Chain_Sepolia: NetworkWorld,
  XDC_Apothem: NetworkXdc,
};

function displayBalance(value: string | null | undefined) {
  if (value == null) return "0.00";
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function activityAmount(item: ActivityItem) {
  const number = Number.parseFloat(item.amount ?? "0");
  return Number.isFinite(number) ? number : 0;
}

export default function CorettaDashboard() {
  const [query, setQuery] = useState("");
  const [chainBalances, setChainBalances] = useState<ChainBalanceResult | null>(null);
  const [chainLoading, setChainLoading] = useState(false);
  const { profile } = useProfile();
  const { smartWalletAddress, smartWalletActive, identityConnected } = useWalletSession();
  const { usdc, eurc, refresh: refreshArcBalances } = useWalletBalances();
  const { items, loading: activityLoading, refresh: refreshActivity } = useActivityFeed();

  const refreshChains = useCallback(async () => {
    if (!smartWalletAddress || !getApiToken()) {
      setChainBalances(null);
      return;
    }
    setChainLoading(true);
    try {
      setChainBalances(await apiFetch<ChainBalanceResult>("/v1/balances/chains"));
    } catch {
      setChainBalances(null);
    } finally {
      setChainLoading(false);
    }
  }, [smartWalletAddress]);

  useEffect(() => {
    void refreshChains();
    if (!smartWalletAddress || !getApiToken()) return;
    const timer = window.setInterval(() => void refreshChains(), 60_000);
    return () => window.clearInterval(timer);
  }, [refreshChains, smartWalletAddress]);

  const chains = useMemo(() => {
    if (chainBalances?.chains.length) return chainBalances.chains;
    return [
      {
        id: "Arc_Testnet",
        label: "Arc Testnet",
        chainId: 5042002,
        explorerUrl: "https://testnet.arcscan.app",
        balance: usdc,
        status: "ready" as const,
      },
      ...CCTP_EVM_TESTNET_DESTINATIONS.map((chain) => ({
        id: chain.id,
        label: chain.label,
        chainId: 0,
        explorerUrl: "",
        balance: null,
        status: "unavailable" as const,
      })),
    ];
  }, [chainBalances, usdc]);

  const readyCount = chainBalances?.availableChainCount ?? (smartWalletAddress ? 1 : 0);
  const ring = useMemo(() => {
    const step = 100 / Math.max(chains.length, 1);
    return `conic-gradient(${chains
      .map((chain, index) => {
        const start = (index * step).toFixed(3);
        const end = ((index + 1) * step - 0.35).toFixed(3);
        return `${CHAIN_COLORS[chain.id] ?? "#B6ADC9"} ${start}% ${end}%, transparent ${end}% ${(index + 1) * step}%`;
      })
      .join(", ")})`;
  }, [chains]);

  const recent = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items.slice(0, 5);
    return items
      .filter((item) =>
        [item.label, item.asset, item.amount, item.recipient, item.network]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalized)),
      )
      .slice(0, 5);
  }, [items, query]);

  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const week = items.filter((item) => (item.timestamp ?? 0) >= sevenDaysAgo);
  const completed = week.filter((item) => item.status === "complete").length;
  const terminal = week.filter((item) => item.status !== "pending").length;
  const settledRate = terminal ? Math.round((completed / terminal) * 100) : 0;
  const usdcVolume = week
    .filter((item) => item.asset === "USDC")
    .reduce((total, item) => total + activityAmount(item), 0);
  const name = profile.preferredName?.trim() || "there";

  const refreshAll = () => {
    void Promise.all([refreshArcBalances(), refreshChains()]);
    refreshActivity();
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F7F5FA] px-4 py-5 text-[#17131F] sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[88rem]">
        <header className="grid items-center gap-4 border-b border-[#211D32]/8 pb-5 lg:grid-cols-[1fr_minmax(16rem,28rem)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E9E2FF] text-sm font-semibold uppercase text-[#5C35D6]">
              {name.slice(0, 2)}
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Greetings, {name}</h1>
              <p className="text-xs text-[#6F687C]">Your Coretta wallet overview</p>
            </div>
          </div>

          <label className="relative hidden lg:block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91899D]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search activity"
              className="h-10 w-full rounded-full border border-transparent bg-[#ECE9EF] pl-11 pr-4 text-sm outline-none transition focus:border-[#7C4DFF]/30 focus:bg-white"
            />
          </label>

        </header>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_24rem]">
          <div className="min-w-0 space-y-5">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-[#746D80]">Smart wallet balance</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">Assets</h2>
                </div>
                <button
                  type="button"
                  onClick={refreshAll}
                  className="rounded-full p-2 text-[#746D80] transition hover:bg-white hover:text-[#211D32]"
                  aria-label="Refresh wallet balances"
                >
                  <RefreshCw className={`h-4 w-4 ${chainLoading ? "animate-spin" : ""}`} />
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <motion.article
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative min-h-48 overflow-hidden rounded-[1.6rem] bg-[#211D32] p-6 text-white shadow-[0_18px_45px_rgba(33,29,50,0.18)]"
                >
                  <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#7C4DFF]/35 blur-2xl" />
                  <div className="relative flex h-full flex-col">
                    <div className="flex items-start justify-between">
                      <p className="text-xs text-white/60">USDC across supported chains</p>
                      <Image src="/tokens/usdc.svg" alt="USDC" width={32} height={32} className="h-8 w-8" />
                    </div>
                    <p className="mt-6 text-3xl font-semibold tracking-tight">
                      {displayBalance(chainBalances?.totalBalance ?? usdc)}
                    </p>
                    <div className="mt-auto flex items-end justify-between pt-5">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Coretta smart wallet</p>
                        <p className="mt-1 max-w-64 break-all font-mono text-xs leading-relaxed text-white/75">
                          {smartWalletAddress ?? "Wallet not ready"}
                        </p>
                      </div>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold">
                        {smartWalletActive ? "Active" : "Preparing"}
                      </span>
                    </div>
                  </div>
                </motion.article>

                <motion.article
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 }}
                  className="relative min-h-48 overflow-hidden rounded-[1.6rem] border border-[#211D32]/8 bg-white p-6 shadow-[0_14px_35px_rgba(41,35,62,0.08)]"
                >
                  <div className="absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-[#DAD0FF]/70 blur-2xl" />
                  <div className="relative flex h-full flex-col">
                    <div className="flex items-start justify-between">
                      <p className="text-xs text-[#746D80]">EURC on Arc Testnet</p>
                      <Image src="/tokens/eurc.svg" alt="EURC" width={32} height={32} className="h-8 w-8" />
                    </div>
                    <p className="mt-6 text-3xl font-semibold tracking-tight text-[#211D32]">
                      {displayBalance(eurc)}
                    </p>
                    <div className="mt-auto flex items-end justify-between pt-5">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[#8B8496]">Network</p>
                        <p className="mt-1 text-xs font-medium text-[#514A5D]">Arc Testnet</p>
                      </div>
                      <span className="h-5 w-9 rounded-full bg-[#211D32] p-0.5">
                        <span className="block h-4 w-4 translate-x-4 rounded-full bg-white" />
                      </span>
                    </div>
                  </div>
                </motion.article>
              </div>
            </section>

            <section className="rounded-[1.6rem] border border-[#211D32]/8 bg-white p-5 shadow-[0_14px_35px_rgba(41,35,62,0.06)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-[#746D80]">Activity overview</p>
                  <h2 className="mt-1 text-lg font-semibold">Recent payments</h2>
                </div>
                <div className="flex gap-2 text-[11px]">
                  <span className="rounded-full bg-[#F0ECFF] px-3 py-1.5 text-[#603ADB]">{week.length} transfers</span>
                  <span className="rounded-full bg-[#E9F8F1] px-3 py-1.5 text-[#17734D]">{settledRate}% settled</span>
                  <span className="rounded-full bg-[#F4F1F6] px-3 py-1.5 text-[#5A5266]">{displayBalance(String(usdcVolume))} USDC</span>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto">
                <div className="min-w-[36rem]">
                  <div className="grid grid-cols-[minmax(0,1.5fr)_8rem_7rem_7rem] px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[#9A93A3]">
                    <span>Activity</span><span>Date</span><span>Status</span><span className="text-right">Amount</span>
                  </div>
                  <div className="space-y-2">
                    {recent.map((item) => <DashboardActivityRow key={item.id} item={item} />)}
                    {!recent.length && (
                      <p className="rounded-2xl bg-[#F7F5FA] px-4 py-8 text-center text-sm text-[#81798C]">
                        {activityLoading ? "Loading activity" : identityConnected ? "No matching activity yet" : "Sign in to view activity"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="min-w-0 rounded-[1.8rem] border border-[#211D32]/8 bg-white p-5 shadow-[0_18px_45px_rgba(41,35,62,0.08)] xl:sticky xl:top-5 xl:h-[calc(100dvh-6rem)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-[#746D80]">Statistics</p>
                <h2 className="mt-1 text-lg font-semibold">Supported chains</h2>
              </div>
              <span className="rounded-full bg-[#F2EFF5] px-3 py-1 text-[10px] text-[#6F687C]">CCTP testnets</span>
            </div>

            <div className="mt-5 flex justify-center">
              <motion.div
                initial={{ opacity: 0, rotate: -75, scale: 0.75 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 90, damping: 14 }}
                className="relative h-44 w-44 rounded-full"
                style={{ background: ring }}
              >
                <div className="absolute inset-[1.15rem] flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
                  <p className="text-[10px] text-[#8A8295]">Added</p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight">{chains.length}</p>
                  <p className="text-[10px] text-[#8A8295]">{readyCount} readable now</p>
                </div>
              </motion.div>
            </div>

            <div className="mt-5 max-h-[calc(100%-15rem)] space-y-2 overflow-y-auto pr-1">
              {chains.map((chain, index) => {
                const Icon = CHAIN_ICONS[chain.id] ?? NetworkArc;
                const color = CHAIN_COLORS[chain.id] ?? "#9B93AA";
                return (
                  <motion.div
                    key={chain.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.025, 0.35) }}
                    className="flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 transition hover:border-[#211D32]/8 hover:bg-[#FAF9FB]"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: `${color}18` }}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[#332D3F]">{chain.label}</p>
                      <p className="mt-0.5 text-[10px] text-[#938B9E]">{chain.status === "ready" ? "Balance available" : "Route added"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-[#332D3F]">{chain.balance == null ? "USDC" : displayBalance(chain.balance)}</p>
                      <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function DashboardActivityRow({ item }: { item: ActivityItem }) {
  const StatusIcon = item.status === "complete" ? CheckCircle2 : item.status === "failed" ? XCircle : Clock3;
  const statusClass = item.status === "complete" ? "bg-[#DDF5E8] text-[#17734D]" : item.status === "failed" ? "bg-[#FFE2E4] text-[#B32631]" : "bg-[#F2EFF5] text-[#716978]";
  const direction = /receive/i.test(item.label) ? "received" : "sent";
  return (
    <div className="grid grid-cols-[minmax(0,1.5fr)_8rem_7rem_7rem] items-center rounded-2xl bg-[#F8F7F9] px-3 py-3 text-xs">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${direction === "received" ? "bg-[#E7F7F0] text-[#17734D]" : "bg-[#EEE9FF] text-[#603ADB]"}`}>
          {direction === "received" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#302A3B]">{item.label}</p>
          <p className="mt-0.5 truncate text-[10px] text-[#91899D]">{item.network ?? "Arc Testnet"}</p>
        </div>
      </div>
      <span className="text-[10px] text-[#81798C]">{item.time}</span>
      <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass}`}>
        <StatusIcon className="h-3 w-3" /> {item.status}
      </span>
      <span className="truncate text-right font-semibold text-[#302A3B]">{item.amount ?? "0"} {item.asset ?? ""}</span>
    </div>
  );
}
