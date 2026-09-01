"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import AppSidebar from "./AppSidebar";
import AIAgentPanel from "./AIAgentPanel";
import CorettaDashboard from "./CorettaDashboard";
import ActivityPanel from "./ActivityPanel";
import WalletConnectModal from "./WalletConnectModal";
import SettingsPanel from "./SettingsPanel";
import SponsorshipDashboard from "./SponsorshipDashboard";
import ApprovalsPanel from "./ApprovalsPanel";
import PageTransition from "./PageTransition";
import WalletTutorial from "./WalletTutorial";
import { useProfile } from "@/hooks/useProfile";
import { useWalletSession, WalletSessionProvider } from "@/hooks/useWalletSession";
import { useWalletTracking } from "@/hooks/useWalletTracking";
import { apiFetch, getApiToken } from "@/lib/api";

type AppView = "dashboard" | "chat" | "approvals" | "settings" | "usage" | "activity";

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
  const [unreadCount, setUnreadCount] = useState(0);
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

  useEffect(() => {
    let updating = false;
    const updateUnread = async () => {
      if (updating) return;
      updating = true;
      if (!getApiToken()) {
        setUnreadCount(0);
        updating = false;
        return;
      }
      try {
        const response = await apiFetch<{ unreadCount: number }>("/v1/notifications");
        setUnreadCount(response.unreadCount);
      } catch {
        setUnreadCount(0);
      } finally {
        updating = false;
      }
    };
    void updateUnread();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void updateUnread();
    }, 30_000);
    const onCount = (event: Event) => {
      const count = (event as CustomEvent<{ count?: number }>).detail?.count;
      if (typeof count === "number") setUnreadCount(count);
    };
    window.addEventListener("coretta-notifications-count", onCount);
    window.addEventListener("coretta-api-session-updated", updateUnread);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("coretta-notifications-count", onCount);
      window.removeEventListener("coretta-api-session-updated", updateUnread);
    };
  }, [privyAuthenticated, status]);

  // Track in-app navigation only when wallet ownership is verified.
  useEffect(() => {
    if (!verified || !address) return;
    const labels: Record<AppView, string> = {
      dashboard: "Opened dashboard",
      chat: "Opened chat",
      settings: "Opened settings",
      usage: "Opened usage dashboard",
      approvals: "Opened approvals and notifications",
      activity: "Opened activity",
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
    <div className="app-shell relative flex h-dvh overflow-hidden bg-black p-0 text-black md:p-3">
      <div className="relative z-10 flex h-full w-full overflow-hidden md:rounded-[2rem] md:border md:border-white/10">
        <AppSidebar
          active={view}
          onDashboardClick={() => setView("dashboard")}
          onSettingsClick={() => setView("settings")}
          onUsageClick={() => setView("usage")}
          onChatClick={() => setView("chat")}
          onApprovalsClick={() => setView("approvals")}
          onActivityClick={() => setView("activity")}
          onConnectWallet={() => setWalletOpen(true)}
          connected={isConnected || Boolean(privyEmail)}
          address={address}
          email={privyEmail}
          unreadCount={unreadCount}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#F7F5FA] pb-16 md:rounded-r-[1.9rem] md:pb-0">
          <PageTransition viewKey={view}>
            {view === "dashboard" ? (
              <CorettaDashboard />
            ) : view === "settings" ? (
              <SettingsPanel onConnectWallet={() => setWalletOpen(true)} />
            ) : view === "usage" ? (
              <SponsorshipDashboard />
            ) : view === "approvals" ? (
              <ApprovalsPanel />
            ) : view === "activity" ? (
              <ActivityPanel />
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
