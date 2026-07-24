"use client";

import { Button } from "@/components/ui/button";

interface Props {
  onActivate: () => void;
  activating?: boolean;
}

export default function SmartWalletActivation({ onActivate, activating }: Props) {
  return (
    <div className="mx-4 mb-4 rounded-2xl border border-[#8F5CFF]/30 bg-[#8F5CFF]/10 p-4">
      <h3 className="text-sm font-semibold text-white">Smart Wallet Required</h3>
      <p className="mt-2 text-xs leading-relaxed text-white/60">
        Coretta uses a Smart Wallet to simplify transactions, sponsorship, account recovery, and
        AI-assisted transfers. Activate your Smart Wallet to continue.
      </p>
      <Button
        variant="primary"
        className="mt-4 w-full"
        onClick={onActivate}
        disabled={activating}
      >
        {activating ? "Activating…" : "Activate Smart Wallet"}
      </Button>
    </div>
  );
}
