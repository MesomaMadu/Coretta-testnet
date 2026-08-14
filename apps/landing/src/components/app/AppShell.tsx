"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import AppSidebar from "./AppSidebar";
import AIAgentPanel from "./AIAgentPanel";
import ActivityPanel from "./ActivityPanel";
import WalletConnectModal from "./WalletConnectModal";
import OnboardingFlow from "./OnboardingFlow";
import SettingsPanel from "./SettingsPanel";
import SponsorshipDashboard from "./SponsorshipDashboard";
import PageTransition from "./PageTransition";
import WalletTutorial from "./WalletTutorial";
import { useProfile } from "@/hooks/useProfile";
import { useWalletSession } from "@/hooks/useWalletSession";
import { useWalletTracking } from "@/hooks/useWalletTracking";

type AppView = "chat" | "settings" | "history" | "usage";

/**
 * App shell redesigned to match Halo-style landing:
 * light canvas #F5F5F5, clean sidebar, black CTAs.
 */
export default function AppShell() {
  const [walletOpen, setWalletOpen] = useState(false);
  const [view, setView] = useState<AppView>("chat");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const { address, status } = useAccount();
  const isConnected = status === "connected";
  const { profile, hydrated, skipWalletTutorial } = useProfile();
  const { verified } = useWalletSession();
  const { track } = useWalletTracking();
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    const needsOnboarding = Boolean(isConnected && !profile.onboardingComplete);
    setOnboardingOpen(needsOnboarding);
  }, [hydrated, isConnected, profile.onboardingComplete]);

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
      chat: "Opened chat",
      settings: "Opened settings",
      history: "Opened activity history",
      usage: "Opened usage dashboard",
    };
    void track({
      kind: "navigation",
      label: labels[view],
      metadata: { view },
    });
  }, [view, verified, address, track]);

  return (
    <div className="app-shell relative flex h-dvh overflow-hidden bg-[#F5F5F5] text-black">
      <div className="relative z-10 flex h-full w-full">
        <AppSidebar
          active={view}
          onActivityClick={() => setView("history")}
          onSettingsClick={() => setView("settings")}
          onUsageClick={() => setView("usage")}
          onChatClick={() => setView("chat")}
          onConnectWallet={() => setWalletOpen(true)}
          connected={isConnected}
          address={address}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-[#F5F5F5]">
          <PageTransition viewKey={view}>
            {view === "settings" ? (
              <SettingsPanel onConnectWallet={() => setWalletOpen(true)} />
            ) : view === "usage" ? (
              <SponsorshipDashboard />
            ) : view === "history" ? (
              <ActivityPanel onClose={() => setView("chat")} variant="main" />
            ) : (
              <AIAgentPanel onRequestWallet={() => setWalletOpen(true)} />
            )}
          </PageTransition>
        </main>
      </div>

      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />

      <OnboardingFlow open={onboardingOpen} onComplete={() => setOnboardingOpen(false)} />

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
