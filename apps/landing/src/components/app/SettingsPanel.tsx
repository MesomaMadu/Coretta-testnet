"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, AlertTriangle, LogOut } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useDisconnect } from "wagmi";
import { useProfile } from "@/hooks/useProfile";
import { useWalletSession } from "@/hooks/useWalletSession";
import { clearApiToken } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { LOCALES } from "@/lib/i18n/translations";
import { AGENT_NAME } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import DamianMemorySettings from "./DamianMemorySettings";
import { fadeUpItem, staggerContainer } from "@/lib/motion";
import {
  getDeveloperDiagnosticsEnabled,
  setDeveloperDiagnosticsEnabled,
} from "@/lib/developer-diagnostics";
import {
  CCTP_EVM_TESTNET_DESTINATIONS,
  supportsCctpScaDestination,
} from "@coretta/shared";

interface Props {
  onConnectWallet: () => void;
}

export default function SettingsPanel({ onConnectWallet }: Props) {
  const { t, locale, setLocale } = useI18n();
  const { profile, setPreferredName, linkEmail, signOutEmail } = useProfile();
  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const {
    ready: privyReady,
    authenticated: privyAuthenticated,
    user: privyUser,
    logout: logoutPrivy,
  } = usePrivy();
  const {
    boundWallet,
    smartWalletAddress,
    smartWalletActive,
    isBoundMismatch,
    requiresWalletSignature,
  } = useWalletSession();
  const [activeTab, setActiveTab] = useState<"general" | "networks">("general");
  const [nickname, setNickname] = useState(profile.preferredName);
  const [editingName, setEditingName] = useState(!profile.preferredName);
  const [nameSavePending, setNameSavePending] = useState(false);
  const [nameSaveError, setNameSaveError] = useState<string | null>(null);
  const [emailLogoutPending, setEmailLogoutPending] = useState(false);
  const [emailLogoutError, setEmailLogoutError] = useState<string | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const [feeAssetPref, setFeeAssetPref] = useState("usdc");
  const [advancedShowRoutes, setAdvancedShowRoutes] = useState(true);
  const [advancedShowBundler, setAdvancedShowBundler] = useState(false);
  const [advancedShowUsage, setAdvancedShowUsage] = useState(true);
  const [advancedShowSmartAddr, setAdvancedShowSmartAddr] = useState(true);
  const [advancedDevDiag, setAdvancedDevDiag] = useState(false);

  const privyEmail = privyUser?.email?.address ?? null;
  const emailSessionActive = privyReady && privyAuthenticated && Boolean(privyEmail);

  useEffect(() => {
    if (emailSessionActive && privyEmail && profile.linkedEmail !== privyEmail) {
      linkEmail(privyEmail);
    }
  }, [emailSessionActive, linkEmail, privyEmail, profile.linkedEmail]);

  useEffect(() => {
    setAdvancedDevDiag(getDeveloperDiagnosticsEnabled());
  }, []);

  useEffect(() => {
    setNickname(profile.preferredName);
    setEditingName(!profile.preferredName);
  }, [profile.preferredName]);

  useEffect(() => {
    if (profile.preferredName && !profile.canEditPreferredName) {
      setNickname(profile.preferredName);
      setEditingName(false);
    }
  }, [profile.canEditPreferredName, profile.preferredName]);

  useEffect(() => {
    if (!logoutConfirmOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !emailLogoutPending) {
        setLogoutConfirmOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [emailLogoutPending, logoutConfirmOpen]);

  const updateDeveloperDiagnostics = (enabled: boolean) => {
    setAdvancedDevDiag(enabled);
    setDeveloperDiagnosticsEnabled(enabled);
  };

  const saveName = async () => {
    if (!nickname.trim() || nameSavePending) return;
    setNameSavePending(true);
    setNameSaveError(null);
    try {
      await setPreferredName(nickname);
      setEditingName(false);
    } catch (error) {
      setNameSaveError(
        error instanceof Error ? error.message : "Coretta could not save that name.",
      );
    } finally {
      setNameSavePending(false);
    }
  };

  const hasSavedName = Boolean(profile.preferredName.trim());
  const nextNameEditLabel = profile.nextPreferredNameEditAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(profile.nextPreferredNameEditAt),
      )
    : null;

  const logoutEmail = async () => {
    setEmailLogoutPending(true);
    setEmailLogoutError(null);
    try {
      await logoutPrivy();
      if (!isConnected) {
        clearApiToken();
        signOutEmail();
      }
      setLogoutConfirmOpen(false);
    } catch {
      setEmailLogoutError("Coretta could not log out the email session. Please try again.");
    } finally {
      setEmailLogoutPending(false);
    }
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
            <SettingsCard title="Supported Networks" variants={fadeUpItem}>
              <div className="space-y-5 text-sm text-black/80">
                <p className="text-xs leading-5 text-black/55">
                  Arc Testnet is the source. Every network below supports USDC bridging from Arc.
                </p>
                <NetworkSupportGroup
                  title="Coretta smart wallet"
                  description="Circle can create your Coretta smart wallet on these networks. You can say “my wallet” in Damian."
                  networks={CCTP_EVM_TESTNET_DESTINATIONS.filter((network) =>
                    supportsCctpScaDestination(network.id),
                  ).map((network) => network.label)}
                />
                <NetworkSupportGroup
                  title="External EVM wallet"
                  description="These routes work with a full EVM address. Circle cannot create your Coretta smart wallet on these networks yet."
                  networks={CCTP_EVM_TESTNET_DESTINATIONS.filter(
                    (network) => !supportsCctpScaDestination(network.id),
                  ).map((network) => network.label)}
                />
              </div>
            </SettingsCard>

            <SettingsCard title="Fee Asset Preference" variants={fadeUpItem}>
              <div className="space-y-2 text-sm text-black/80">
                {[
                  { id: "usdc", label: "USDC network fees (Circle Paymaster)" },
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
                  { id: "usage", label: "Show Transfer Usage", val: advancedShowUsage, set: setAdvancedShowUsage },
                  { id: "smartAddr", label: "Show Smart Wallet Address", val: advancedShowSmartAddr, set: setAdvancedShowSmartAddr },
                  { id: "devDiag", label: "Developer Diagnostics", val: advancedDevDiag, set: updateDeveloperDiagnostics },
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
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && editingName) void saveName();
                      }}
                      maxLength={40}
                      readOnly={!editingName}
                      className="min-w-0 flex-1 rounded-xl border border-black/10 bg-[#F5F5F5] px-3 py-2 text-sm text-black outline-none focus:border-black/30 read-only:text-black/60"
                    />
                    {hasSavedName && !editingName ? (
                      <Button
                        variant="glass"
                        size="sm"
                        disabled={!profile.canEditPreferredName}
                        onClick={() => {
                          setNameSaveError(null);
                          setEditingName(true);
                        }}
                      >
                        Edit
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!nickname.trim() || nameSavePending}
                        onClick={() => void saveName()}
                      >
                        {nameSavePending ? "Saving..." : "Save"}
                      </Button>
                    )}
                  </div>
                  {hasSavedName && !profile.canEditPreferredName && nextNameEditLabel ? (
                    <p className="mt-2 text-[10px] text-black/45">
                      You can edit this name again on {nextNameEditLabel}.
                    </p>
                  ) : null}
                  {nameSaveError ? (
                    <p className="mt-2 text-xs text-rose-700">{nameSaveError}</p>
                  ) : null}
                </div>
              </div>
            </SettingsCard>

            <SettingsCard title="Chat Memory" variants={fadeUpItem}>
              <DamianMemorySettings />
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
                    Link or replace wallet
                  </Button>
                  <p className="text-[10px] text-black/40">
                    A new wallet must sign an ownership message and link to this Coretta account before it can be used.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {emailSessionActive && smartWalletActive && smartWalletAddress && (
                    <p className="text-xs text-black/50">
                      Smart Wallet:{" "}
                      <span className="font-mono text-black">
                        {smartWalletAddress.slice(0, 8)}…{smartWalletAddress.slice(-6)}
                      </span>
                    </p>
                  )}
                  <Button variant="primary" onClick={onConnectWallet}>
                    {emailSessionActive ? "Link wallet to this account" : "Connect wallet"}
                  </Button>
                  <p className="text-[10px] text-black/40">
                    {emailSessionActive && requiresWalletSignature === false
                      ? "Your Privy email session uses the managed smart wallet without external wallet approval signatures."
                      : emailSessionActive
                        ? "Your Privy email is signed in. Reconnect the linked wallet to approve remittances and swaps."
                        : "Connect a wallet to approve remittances and swaps."}
                  </p>
                </div>
              )}
            </SettingsCard>

            <SettingsCard title="Authentication" variants={fadeUpItem}>
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-black/55">
                  {!privyReady
                    ? "Checking email authentication..."
                    : emailSessionActive && privyEmail
                      ? `Signed in with email: ${privyEmail}`
                      : profile.linkedEmail
                        ? `Linked email: ${profile.linkedEmail}. The email session is signed out.`
                        : "Email login and wallet connection are available from the same sign-in window."}
                </p>
                {emailLogoutError && (
                  <p className="rounded-xl border border-rose-500/30 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {emailLogoutError}
                  </p>
                )}
                {emailSessionActive ? (
                  <Button
                    variant="glass"
                    size="sm"
                    className="w-full border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-400 hover:bg-rose-100 focus-visible:outline-rose-500/50"
                    disabled={emailLogoutPending}
                    onClick={() => {
                      setEmailLogoutError(null);
                      setLogoutConfirmOpen(true);
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {emailLogoutPending ? "Logging out..." : "Log out"}
                  </Button>
                ) : privyReady ? (
                  <Button variant="glass" size="sm" className="w-full" onClick={onConnectWallet}>
                    Open login options
                  </Button>
                ) : null}
              </div>
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
      {logoutConfirmOpen && (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !emailLogoutPending) {
              setLogoutConfirmOpen(false);
            }
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-confirmation-title"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-sm rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700">
              <LogOut className="h-4 w-4" />
            </div>
            <h2 id="logout-confirmation-title" className="text-lg font-semibold text-black">
              Are you sure you want to log out?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-black/55">
              You will need to sign in again to access this Coretta account.
            </p>
            {emailLogoutError && (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {emailLogoutError}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="glass"
                size="sm"
                disabled={emailLogoutPending}
                onClick={() => setLogoutConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-500/60"
                disabled={emailLogoutPending}
                onClick={() => void logoutEmail()}
              >
                <LogOut className="h-4 w-4" />
                {emailLogoutPending ? "Logging out..." : "Yes, log out"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function NetworkSupportGroup({
  title,
  description,
  networks,
}: {
  title: string;
  description: string;
  networks: string[];
}) {
  return (
    <section>
      <h3 className="font-semibold text-black">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-black/50">{description}</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {networks.map((network) => (
          <li
            key={network}
            className="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-[#F7F7F7] px-3 py-2"
          >
            <span className="text-xs text-black/70">{network}</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              Supported
            </span>
          </li>
        ))}
      </ul>
    </section>
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
