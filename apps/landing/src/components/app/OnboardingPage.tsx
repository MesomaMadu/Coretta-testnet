"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/hooks/useProfile";
import { WalletSessionProvider } from "@/hooks/useWalletSession";
import OnboardingFlow from "./OnboardingFlow";

export default function OnboardingPage() {
  return (
    <WalletSessionProvider autoVerify={false}>
      <OnboardingPageContent />
    </WalletSessionProvider>
  );
}

function OnboardingPageContent() {
  const router = useRouter();
  const {
    profile,
    hydrated,
    completeOnboarding,
    linkEmail,
  } = useProfile();
  const onboardingComplete = hydrated && profile.onboardingVersion >= 1;

  useEffect(() => {
    if (onboardingComplete) router.replace("/app");
  }, [onboardingComplete, router]);

  if (!hydrated || onboardingComplete) {
    return <div className="h-dvh bg-[#F5F5F5]" aria-label="Loading Coretta" />;
  }

  return (
    <OnboardingFlow
      open
      onComplete={() => {
        completeOnboarding();
        router.replace("/app");
      }}
      onEmailLinked={linkEmail}
    />
  );
}
