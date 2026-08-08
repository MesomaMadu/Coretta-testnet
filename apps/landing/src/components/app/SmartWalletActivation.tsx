"use client";

import { Button } from "@/components/ui/button";

interface Props {
  onActivate: () => void;
  activating?: boolean;
}

export default function SmartWalletActivation({ onActivate, activating }: Props) {
  return (
    <div className="mx-4 mb-4 rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-black">Smart Wallet Required</h3>
      <p className="mt-2 text-xs leading-relaxed text-black/60">
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
