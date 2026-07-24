"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Mail, Unlink, Wallet, RefreshCw, AlertTriangle } from "lucide-react";
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
  onLinkEmail: () => void;
  onConnectWallet: () => void;
}

export default function SettingsPanel({ onLinkEmail, onConnectWallet }: Props) {
  const { t, locale, setLocale } = useI18n();
  const { profile, setPreferredName, unlinkEmail } = useProfile();
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
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);

  // Network preferences state
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
      className="flex h-full flex-col overflow-y-auto bg-[var(--ar-bg)] p-6 md:p-8"
    >
      <motion.header variants={fadeUpItem} className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white">{t("settings")}</h1>
        <p className="subheading-text mt-1 text-sm text-white/45">
          Personalize {AGENT_NAME} and manage network & identity preferences.
        </p>

        <div className="mt-4 flex gap-2 border-b border-white/10 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "general"
                ? "bg-[#8F5CFF]/20 text-[#8F5CFF] border border-[#8F5CFF]/40"
                : "text-white/50 hover:text-white"
            }`}
          >
            General
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("networks")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "networks"
                ? "bg-[#8F5CFF]/20 text-[#8F5CFF] border border-[#8F5CFF]/40"
                : "text-white/50 hover:text-white"
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
              <div className="space-y-2 text-sm text-white/80">
                {[
                  { id: "arc", label: "Arc (default — instant, zero gas)" },
                  { id: "auto", label: "Automatic (optimal routing)" },
                  { id: "ethereum", label: "Ethereum Sepolia (unsupported)" },
                  { id: "base", label: "Base Sepolia (unsupported)" },
                  { id: "arbitrum", label: "Arbitrum Sepolia (unsupported)" },
                  { id: "optimism", label: "Optimism Sepolia (unsupported)" },
                  { id: "polygon", label: "Polygon Amoy (unsupported)" },
                  { id: "avalanche", label: "Avalanche Fuji (unsupported)" },
                ].map((item) => (
                  <label key={item.id} className="flex items-center gap-3 cursor-pointer py-1">
                    <input
                      type="radio"
                      name="settlement"
                      value={item.id}
                      checked={settlementPref === item.id}
                      onChange={(e) => setSettlementPref(e.target.value)}
                      className="accent-[#8F5CFF]"
                    />
                    <span className={item.id === "arc" ? "font-semibold text-white" : "text-white/60"}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </SettingsCard>

            <SettingsCard title="Fee Asset Preference" variants={fadeUpItem}>
              <div className="space-y-2 text-sm text-white/80">
                {[
                  { id: "sponsored", label: "Sponsored (Circle Paymaster zero gas)" },
                  { id: "usdc", label: "USDC" },
                  { id: "eurc", label: "EURC" },
                  { id: "auto", label: "Automatic" },
                ].map((item) => (
                  <label key={item.id} className="flex items-center gap-3 cursor-pointer py-1">
                    <input
                      type="radio"
                      name="feeAsset"
                      value={item.id}
                      checked={feeAssetPref === item.id}
                      onChange={(e) => setFeeAssetPref(e.target.value)}
                      className="accent-[#8F5CFF]"
                    />
                    <span className="text-white/80">{item.label}</span>
                  </label>
                ))}
              </div>
            </SettingsCard>

            <SettingsCard title="Advanced Mode" variants={fadeUpItem}>
              <div className="space-y-3 text-sm text-white/80">
                {[
                  { id: "routes", label: "Show Transaction Routes", val: advancedShowRoutes, set: setAdvancedShowRoutes },
                  { id: "bundler", label: "Show Bundler Details", val: advancedShowBundler, set: setAdvancedShowBundler },
                  { id: "usage", label: "Show Sponsorship Usage", val: advancedShowUsage, set: setAdvancedShowUsage },
                  { id: "smartAddr", label: "Show Smart Wallet Address", val: advancedShowSmartAddr, set: setAdvancedShowSmartAddr },
                  { id: "devDiag", label: "Developer Diagnostics", val: advancedDevDiag, set: setAdvancedDevDiag },
                ].map((item) => (
                  <label key={item.id} className="flex items-center justify-between cursor-pointer py-1">
                    <span>{item.label}</span>
                    <input
                      type="checkbox"
                      checked={item.val}
                      onChange={(e) => item.set(e.target.checked)}
                      className="h-4 w-4 rounded accent-[#8F5CFF]"
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
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#153E75] to-[#7C4DFF] text-lg font-semibold text-white shadow-[0_0_24px_rgba(124,77,255,0.2)]">
              {(profile.preferredName || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <label className="text-xs text-white/45">{t("preferredName")}</label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onBlur={saveName}
                className="mt-1 w-full rounded-lg border border-[var(--ar-border)] bg-[var(--ar-bg-elevated)] px-3 py-2 text-sm text-white outline-none focus:border-[#7C4DFF]/50"
              />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard title="Wallet management" variants={fadeUpItem}>
          {isBoundMismatch && (
            <div className="mb-3 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Connected wallet does not match your bound wallet. Transaction features are disabled
              until you replace or reconnect the bound wallet.
            </div>
          )}
          {smartWalletActive && smartWalletAddress && (
            <p className="mb-3 text-xs text-white/45">
              Smart Wallet:{" "}
              <span className="font-mono text-[#8F5CFF]">
                {smartWalletAddress.slice(0, 8)}…{smartWalletAddress.slice(-6)}
              </span>
            </p>
          )}
          {boundWallet && (
            <p className="mb-3 text-xs text-white/45">
              Bound wallet:{" "}
              <span className="font-mono text-white/70">
                {boundWallet.slice(0, 8)}…{boundWallet.slice(-6)}
              </span>
            </p>
          )}
          {isConnected && address ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3 rounded-xl border border-white/8 bg-[#151B2E]/80 p-3">
                <div className="flex gap-3">
                  <Wallet className="mt-0.5 h-4 w-4 text-[#8F5CFF]" />
                  <div>
                    <p className="text-sm font-medium text-white">
                      {connector?.name ?? "Wallet"}
                    </p>
                    <p className="font-mono text-xs text-white/45">
                      {address.slice(0, 8)}…{address.slice(-6)}
                    </p>
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#8F5CFF]/90">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#8F5CFF]" />
                      Connected
                    </span>
                  </div>
                </div>
              </div>
              <Button
                variant="glass"
                size="sm"
                className="w-full"
                onClick={() => disconnect()}
              >
                {t("disconnectWallet")}
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={onConnectWallet}>
                Switch wallet
              </Button>
              {profile.linkedEmail && (
                <Button
                  variant="glass"
                  size="sm"
                  className="w-full"
                  onClick={() => setReplaceOpen(true)}
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Replace wallet
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Button variant="primary" onClick={onConnectWallet}>
                Connect wallet
              </Button>
              {profile.linkedEmail && (
                <p className="text-[10px] text-white/40">
                  Email-only mode: view balances and history. Connect a wallet for transactions.
                </p>
              )}
            </div>
          )}
        </SettingsCard>

        <SettingsCard title={t("identity")} variants={fadeUpItem}>
          {profile.linkedEmail ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-white">
                <Mail className="h-4 w-4 text-violet-400" />
                {profile.linkedEmail}
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                  <Check className="h-3 w-3" /> Verified
                </span>
              </div>
              {profile.emailVerifiedAt && (
                <p className="text-[10px] text-white/35">
                  Last verified {new Date(profile.emailVerifiedAt).toLocaleString()}
                </p>
              )}
              {!confirmUnlink ? (
                <Button
                  variant="glass"
                  size="sm"
                  className="w-full"
                  onClick={() => setConfirmUnlink(true)}
                >
                  <Unlink className="mr-2 h-3.5 w-3.5" />
                  {t("disconnectEmail")}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="glass"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      unlinkEmail();
                      setConfirmUnlink(false);
                    }}
                  >
                    Confirm unlink
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmUnlink(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Button variant="primary" className="w-full" onClick={onLinkEmail}>
              <Mail className="mr-2 h-4 w-4" />
              {t("linkEmail")}
            </Button>
          )}
        </SettingsCard>

        <SettingsCard title={t("language")} variants={fadeUpItem}>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as typeof locale)}
            className="w-full rounded-xl border border-white/10 bg-[#151B2E] px-3 py-2.5 text-sm text-white outline-none focus:border-[#1E4F91]/50"
          >
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code} className="bg-[var(--ar-bg-elevated)]">
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
      className="rounded-2xl border border-[var(--ar-border)] bg-[var(--ar-surface)] p-5 backdrop-blur-xl"
    >
      <h2 className="mb-4 text-sm font-semibold text-white/90">{title}</h2>
      {children}
    </motion.section>
  );
}
