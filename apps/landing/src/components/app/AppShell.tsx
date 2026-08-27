"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import AppSidebar from "./AppSidebar";
import AIAgentPanel from "./AIAgentPanel";
import DashboardPanel from "./DashboardPanel";
import WalletConnectModal from "./WalletConnectModal";
import SettingsPanel from "./SettingsPanel";
import SponsorshipDashboard from "./SponsorshipDashboard";
import PageTransition from "./PageTransition";
import WalletTutorial from "./WalletTutorial";
import { useProfile } from "@/hooks/useProfile";
import { useWalletSession, WalletSessionProvider } from "@/hooks/useWalletSession";
import { useWalletTracking } from "@/hooks/useWalletTracking";

type AppView = "dashboard" | "chat" | "settings" | "usage";

/**
 * App shell redesigned to match Halo-style landing:
 * light canvas #F5F5F5, clean sidebar, black CTAs.
 */
export default function AppShell() {
  const { profile, hydrated } = useProfile();
  const onboardingRequired = hydrated && profile.onboardingVersion < 1;
  return (
    <WalletSessionProvider autoVerify={hydrated && !onboardingRequired}>
      <AppShellContent />
    </WalletSessionProvider>
  );
}

function AppShellContent() {
  const router = useRouter();
  const [walletOpen, setWalletOpen] = useState(false);
  const [view, setView] = useState<AppView>("dashboard");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const { address, status } = useAccount();
  const isConnected = status === "connected";
  const {
    ready: privyReady,
    authenticated: privyAuthenticated,
    user: privyUser,
  } = usePrivy();
  const privyEmail =
    privyReady && privyAuthenticated ? (privyUser?.email?.address ?? null) : null;
  const {
    profile,
    hydrated,
    skipWalletTutorial,
    linkEmail,
  } = useProfile();
  const { verified } = useWalletSession();
  const { track } = useWalletTracking();
  const onboardingOpen = hydrated && profile.onboardingVersion < 1;

  useEffect(() => {
    if (onboardingOpen) router.replace("/app/onboarding");
  }, [onboardingOpen, router]);

  // Disconnect UI reset is owned by useWalletSession (debounced) via coretta-wallet-disconnect.
  // Do not fire that event here on status flicker — it was clearing the agent mid-reconnect.

  useEffect(() => {
    if (!hydrated || onboardingOpen) return;
    if (isConnected && verified && !profile.walletTutorialComplete) {
      setTutorialOpen(true);
    }
  }, [hydrated, isConnected, verified, profile.walletTutorialComplete, onboardingOpen]);

  // Track in-app navigation only when wallet ownership is verified.
  useEffect(() => {
    if (!verified || !address) return;
    const labels: Record<AppView, string> = {
      dashboard: "Opened dashboard",
      chat: "Opened chat",
      settings: "Opened settings",
      usage: "Opened usage dashboard",
    };
    void track({
      kind: "navigation",
      label: labels[view],
      metadata: { view },
    });
  }, [view, verified, address, track]);

  if (!hydrated || onboardingOpen) {
    return <div className="h-dvh bg-[#F5F5F5]" aria-label="Loading Coretta" />;
  }

  return (
    <div className="app-shell relative flex h-dvh overflow-hidden bg-[#F5F5F5] text-black">
      <div className="relative z-10 flex h-full w-full">
        <AppSidebar
          active={view}
          onDashboardClick={() => setView("dashboard")}
          onSettingsClick={() => setView("settings")}
          onUsageClick={() => setView("usage")}
          onChatClick={() => setView("chat")}
          onConnectWallet={() => setWalletOpen(true)}
          connected={isConnected || Boolean(privyEmail)}
          address={address}
          email={privyEmail}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-[#F5F5F5]">
          <PageTransition viewKey={view}>
            {view === "dashboard" ? (
              <DashboardPanel onConnectWallet={() => setWalletOpen(true)} />
            ) : view === "settings" ? (
              <SettingsPanel onConnectWallet={() => setWalletOpen(true)} />
            ) : view === "usage" ? (
              <SponsorshipDashboard />
            ) : (
              <AIAgentPanel onRequestWallet={() => setWalletOpen(true)} />
            )}
          </PageTransition>
        </main>
      </div>

      <WalletConnectModal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        emailEnabled={Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID)}
        onEmailSuccess={linkEmail}
      />
      <WalletTutorial
        open={tutorialOpen}
        onComplete={() => {
          skipWalletTutorial();
          setTutorialOpen(false);
        }}
        onSkip={() => {
          skipWalletTutorial();
          setTutorialOpen(false);
        }}
      />
    </div>
  );
}
