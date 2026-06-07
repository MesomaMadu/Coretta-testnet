"use client";



import { useEffect, useState } from "react";

import { useAccount } from "wagmi";

import Background from "@/components/shared/Background";

import AppSidebar from "./AppSidebar";

import AIAgentPanel from "./AIAgentPanel";

import ActivityPanel from "./ActivityPanel";

import WalletConnectModal from "./WalletConnectModal";

import EmailAuthModal from "./EmailAuthModal";

import OnboardingFlow from "./OnboardingFlow";

import SettingsPanel from "./SettingsPanel";

import PageTransition from "./PageTransition";

import { useProfile } from "@/hooks/useProfile";



type AppView = "chat" | "settings" | "history";



export default function AppShell() {

  const [walletOpen, setWalletOpen] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);

  const [view, setView] = useState<AppView>("chat");

  const { address, isConnected } = useAccount();

  const { profile, hydrated, linkEmail } = useProfile();

  const [onboardingOpen, setOnboardingOpen] = useState(false);



  useEffect(() => {

    if (!hydrated) return;

    const needsOnboarding =

      (isConnected || profile.linkedEmail) && !profile.onboardingComplete;

    setOnboardingOpen(needsOnboarding);

  }, [hydrated, isConnected, profile.linkedEmail, profile.onboardingComplete]);



  const activeNav =

    view === "history" ? "history" : view === "settings" ? "settings" : "chat";



  return (

    <div className="relative flex h-dvh overflow-hidden text-[var(--ar-fg)]">

      <Background />

      <div className="relative z-10 flex h-full w-full">

        <AppSidebar

          active={activeNav}

          onActivityClick={() => setView("history")}

          onSettingsClick={() => setView("settings")}

          onChatClick={() => setView("chat")}

          onConnectWallet={() => setWalletOpen(true)}

          onEmailAuth={() => setEmailOpen(true)}

          connected={isConnected}

          address={address}

        />

        <main className="flex min-w-0 flex-1 flex-col">

          <PageTransition viewKey={view}>

            {view === "settings" ? (

              <SettingsPanel

                onLinkEmail={() => setEmailOpen(true)}

                onConnectWallet={() => setWalletOpen(true)}

              />

            ) : view === "history" ? (

              <ActivityPanel onClose={() => setView("chat")} variant="main" />

            ) : (

              <AIAgentPanel onRequestWallet={() => setWalletOpen(true)} />

            )}

          </PageTransition>

        </main>

      </div>

      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />

      <EmailAuthModal

        open={emailOpen}

        onClose={() => setEmailOpen(false)}

        onSuccess={(email) => {

          linkEmail(email);

          setEmailOpen(false);

        }}

      />

      <OnboardingFlow

        open={onboardingOpen}

        onComplete={() => setOnboardingOpen(false)}

      />

    </div>

  );

}


