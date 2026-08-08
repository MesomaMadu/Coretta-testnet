"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { AGENT_NAME } from "@/lib/brand";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    title: "You're connected",
    body: "Your EVM wallet is linked. Coretta verified ownership with a signed message, no gas cost.",
  },
  {
    title: "Activate Smart Wallet",
    body: "Tap Activate Smart Wallet after verification. This is your operational account for sponsored transfers.",
  },
  {
    title: "Chat with Damian",
    body: `Use the ${AGENT_NAME} panel to describe transfers in plain language. Damian builds a locked preview; nothing sends without your approval.`,
  },
  {
    title: "Confirm & sign",
    body: "Review the preview card, tap Confirm & Sign, then approve in your wallet. Sponsored transactions still require your signature.",
  },
  {
    title: "Track activity",
    body: "Watch status in the chat and open Activity for pending, completed, and failed transfers with live hash updates.",
  },
  {
    title: "Email is optional",
    body: "You can send with your connected wallet right away. The smart wallet binds to your EOA. Link email later in Settings for recovery when email delivery is configured.",
  },
] as const;

interface Props {
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export default function WalletTutorial({ open, onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0);

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-2xl"
        >
          <button
            type="button"
            onClick={onSkip}
            className="absolute right-4 top-4 rounded-full p-1 text-black/40 hover:bg-black/5 hover:text-black"
            aria-label="Skip tutorial"
          >
            <X className="h-4 w-4" />
          </button>

          <p className="text-xs font-medium uppercase tracking-widest text-[#0A0A0A]">
            Quick tour · Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-black">{current.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-black/60">{current.body}</p>

          <div className="mt-6 flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= step ? "bg-[#0A0A0A]" : "bg-black/10"}`}
              />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-black/40 hover:text-black/70"
            >
              Skip tutorial
            </button>
            {isLast ? (
              <Button type="button" variant="primary" size="sm" onClick={onComplete}>
                Get started
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setStep((s) => s + 1)}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
