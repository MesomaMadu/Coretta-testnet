"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Wallet, RefreshCw, AlertTriangle } from "lucide-react";
import { useAccount, useDisconnect } from "wagmi";
import { useProfile } from "@/hooks/useProfile";
import { useWalletSession } from "@/hooks/useWalletSession";
import { useI18n } from "@/lib/i18n/context";
import { LOCALES } from "@/lib/i18n/translations";
import { AGENT_NAME } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { fadeUpItem, staggerContainer } from "@/lib/motion";
import WalletReplaceModal from "./WalletReplaceModal";

interface Props {
  onConnectWallet: () => void;
}

export default function SettingsPanel({ onConnectWallet }: Props) {
  const { t, locale, setLocale } = useI18n();
  const { profile, setPreferredName } = useProfile();
  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const {
    boundWallet,
    smartWalletAddress,
    smartWalletActive,
    isBoundMismatch,
    syncBindings,
  } = useWalletSession();
  const [activeTab, setActiveTab] = useState<"general" | "networks">("general");
  const [nickname, setNickname] = useState(profile.preferredName);
  const [replaceOpen, setReplaceOpen] = useState(false);

  const [settlementPref, setSettlementPref] = useState("arc");
  const [feeAssetPref, setFeeAssetPref] = useState("sponsored");
  const [advancedShowRoutes, setAdvancedShowRoutes] = useState(true);
  const [advancedShowBundler, setAdvancedShowBundler] = useState(false);
  const [advancedShowUsage, setAdvancedShowUsage] = useState(true);
  const [advancedShowSmartAddr, setAdvancedShowSmartAddr] = useState(true);
  const [advancedDevDiag, setAdvancedDevDiag] = useState(false);

  const saveName = () => {
    if (nickname.trim()) setPreferredName(nickname.trim());
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex h-full flex-col overflow-y-auto bg-[#F5F5F5] p-6 md:p-8"
    >
      <motion.header variants={fadeUpItem} className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-black">{t("settings")}</h1>
        <p className="subheading-text mt-1 text-sm text-black/50">
          Personalize {AGENT_NAME} and manage network and identity preferences.
        </p>

        <div className="mt-4 flex gap-2 border-b border-black/10 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "general"
                ? "bg-black text-white"
                : "text-black/50 hover:bg-black/5 hover:text-black"
            }`}
          >
            General
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("networks")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "networks"
                ? "bg-black text-white"
                : "text-black/50 hover:bg-black/5 hover:text-black"
            }`}
          >
            Networks
          </button>
        </div>
      </motion.header>

      <div className="mx-auto w-full max-w-xl space-y-5">
        {activeTab === "networks" ? (
          <>
            <SettingsCard title="Settlement Preference" variants={fadeUpItem}>
              <div className="space-y-2 text-sm text-black/80">
                {[
                  { id: "arc", label: "Arc (default, instant, zero gas)" },
                  { id: "auto", label: "Automatic (optimal routing)" },
                  { id: "ethereum", label: "Ethereum Sepolia (unsupported)" },
                  { id: "base", label: "Base Sepolia (unsupported)" },
                  { id: "arbitrum", label: "Arbitrum Sepolia (unsupported)" },
                  { id: "optimism", label: "Optimism Sepolia (unsupported)" },
                  { id: "polygon", label: "Polygon Amoy (unsupported)" },
                  { id: "avalanche", label: "Avalanche Fuji (unsupported)" },
                ].map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-center gap-3 py-1">
                    <input
                      type="radio"
                      name="settlement"
                      value={item.id}
                      checked={settlementPref === item.id}
                      onChange={(e) => setSettlementPref(e.target.value)}
                      className="accent-black"
                    />
                    <span className={item.id === "arc" ? "font-semibold text-black" : "text-black/55"}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </SettingsCard>

            <SettingsCard title="Fee Asset Preference" variants={fadeUpItem}>
              <div className="space-y-2 text-sm text-black/80">
                {[
                  { id: "sponsored", label: "Sponsored (Circle Paymaster zero gas)" },
                  { id: "usdc", label: "USDC" },
                  { id: "eurc", label: "EURC" },
                  { id: "auto", label: "Automatic" },
                ].map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-center gap-3 py-1">
                    <input
                      type="radio"
                      name="feeAsset"
                      value={item.id}
                      checked={feeAssetPref === item.id}
                      onChange={(e) => setFeeAssetPref(e.target.value)}
                      className="accent-black"
                    />
                    <span className="text-black/80">{item.label}</span>
                  </label>
                ))}
              </div>
            </SettingsCard>

            <SettingsCard title="Advanced Mode" variants={fadeUpItem}>
              <div className="space-y-3 text-sm text-black/80">
                {[
                  { id: "routes", label: "Show Transaction Routes", val: advancedShowRoutes, set: setAdvancedShowRoutes },
                  { id: "bundler", label: "Show Bundler Details", val: advancedShowBundler, set: setAdvancedShowBundler },
                  { id: "usage", label: "Show Sponsorship Usage", val: advancedShowUsage, set: setAdvancedShowUsage },
                  { id: "smartAddr", label: "Show Smart Wallet Address", val: advancedShowSmartAddr, set: setAdvancedShowSmartAddr },
                  { id: "devDiag", label: "Developer Diagnostics", val: advancedDevDiag, set: setAdvancedDevDiag },
                ].map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-center justify-between py-1">
                    <span>{item.label}</span>
                    <input
                      type="checkbox"
                      checked={item.val}
                      onChange={(e) => item.set(e.target.checked)}
                      className="h-4 w-4 rounded accent-black"
                    />
                  </label>
                ))}
              </div>
            </SettingsCard>
          </>
        ) : (
          <>
            <SettingsCard title={t("profile")} variants={fadeUpItem}>
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-lg font-semibold text-white">
                  {(profile.preferredName || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <label className="text-xs text-black/50">{t("preferredName")}</label>
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    onBlur={saveName}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-[#F5F5F5] px-3 py-2 text-sm text-black outline-none focus:border-black/30"
                  />
                </div>
              </div>
            </SettingsCard>

            <SettingsCard title="Wallet management" variants={fadeUpItem}>
              {isBoundMismatch && (
                <div className="mb-3 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Connected wallet does not match your bound wallet. Transaction features are disabled
                  until you replace or reconnect the bound wallet.
                </div>
              )}
              {isConnected && address ? (
                <div className="space-y-3">
                  {smartWalletActive && smartWalletAddress && (
                    <p className="text-xs text-black/50">
                      Smart Wallet:{" "}
                      <span className="font-mono text-black">
                        {smartWalletAddress.slice(0, 8)}…{smartWalletAddress.slice(-6)}
                      </span>
                    </p>
                  )}
                  {boundWallet && (
                    <p className="text-xs text-black/50">
                      Bound wallet:{" "}
                      <span className="font-mono text-black/70">
                        {boundWallet.slice(0, 8)}…{boundWallet.slice(-6)}
                      </span>
                    </p>
                  )}
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-black/10 bg-[#F5F5F5] p-3">
                    <div className="flex gap-3">
                      <Wallet className="mt-0.5 h-4 w-4 text-black" />
                      <div>
                        <p className="text-sm font-medium text-black">
                          {connector?.name ?? "Wallet"}
                        </p>
                        <p className="font-mono text-xs text-black/50">
                          {address.slice(0, 8)}…{address.slice(-6)}
                        </p>
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-black">
                          <span className="h-1.5 w-1.5 rounded-full bg-black" />
                          Connected
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button variant="glass" size="sm" className="w-full" onClick={() => disconnect()}>
                    {t("disconnectWallet")}
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full" onClick={onConnectWallet}>
                    Switch wallet
                  </Button>
                  <Button
                    variant="glass"
                    size="sm"
                    className="w-full"
                    onClick={() => setReplaceOpen(true)}
                  >
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Replace wallet
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button variant="primary" onClick={onConnectWallet}>
                    Connect wallet
                  </Button>
                  <p className="text-[10px] text-black/40">
                    Wallet connection is the only authentication method right now.
                  </p>
                </div>
              )}
            </SettingsCard>

            <SettingsCard title="Authentication" variants={fadeUpItem}>
              <p className="text-xs leading-relaxed text-black/55">
                Email login and OTP are temporarily disabled. Connect an EVM wallet, verify ownership,
                and use your bound smart wallet for remittance and swaps.
              </p>
            </SettingsCard>

            <SettingsCard title={t("language")} variants={fadeUpItem}>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as typeof locale)}
                className="w-full rounded-xl border border-black/10 bg-[#F5F5F5] px-3 py-2.5 text-sm text-black outline-none focus:border-black/30"
              >
                {LOCALES.map((l) => (
                  <option key={l.code} value={l.code} className="bg-white">
                    {l.label}
                  </option>
                ))}
              </select>
            </SettingsCard>
          </>
        )}
      </div>

      <WalletReplaceModal
        open={replaceOpen}
        onClose={() => setReplaceOpen(false)}
        onConnectWallet={onConnectWallet}
        onComplete={() => void syncBindings()}
        currentAddress={address}
      />
    </motion.div>
  );
}

function SettingsCard({
  title,
  children,
  variants,
}: {
  title: string;
  children: React.ReactNode;
  variants: typeof fadeUpItem;
}) {
  return (
    <motion.section
      variants={variants}
      className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
    >
      <h2 className="mb-4 text-sm font-semibold text-black">{title}</h2>
      {children}
    </motion.section>
  );
}
