"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PIPELINE = [
  { key: "create", label: "Creating transfer", detail: "Packaging your payment securely." },
  { key: "paymaster", label: "USDC gas", detail: "Circle Paymaster enables USDC fees." },
  { key: "bundler", label: "Executing", detail: "Bundler routes to Arc." },
  { key: "settle", label: "Settled", detail: "Funds delivered in under a second." },
] as const;

export default function InteractiveSendDemo() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [pipeStep, setPipeStep] = useState(0);

  async function handleSend() {
    if (!recipient.trim() || !amount.trim()) return;
    setPhase("running");
    setPipeStep(0);
    for (let i = 0; i < PIPELINE.length; i++) {
      setPipeStep(i);
      await new Promise((r) => setTimeout(r, 1200));
    }
    setPhase("done");
  }

  function reset() {
    setPhase("idle");
    setPipeStep(0);
  }

  return (
    <SectionShell
      id="send-demo"
      eyebrow="Interactive demo"
      title="Try a live remittance simulation"
      subtitle="Type a recipient and amount — watch the invisible engine work."
    >
      <div className="mx-auto max-w-md space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl md:p-8">
        <label className="block">
          <span className="text-xs text-white/45">Recipient</span>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="friend@email.com"
            disabled={phase === "running"}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/25 focus:border-cyan-400/50 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs text-white/45">Amount (USDC)</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="25.00"
            disabled={phase === "running"}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/25 focus:border-cyan-400/50 focus:outline-none"
          />
        </label>

        {phase === "idle" && (
          <Button variant="glow" className="w-full" onClick={handleSend}>
            Send
          </Button>
        )}

        <AnimatePresence>
          {(phase === "running" || phase === "done") && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="space-y-3 border-t border-white/10 pt-4"
            >
              {PIPELINE.map((step, i) => (
                <div
                  key={step.key}
                  className={cn(
                    "rounded-xl border px-4 py-3 transition-all",
                    i <= pipeStep || phase === "done"
                      ? "border-cyan-400/30 bg-cyan-500/10"
                      : "border-white/5 opacity-40",
                  )}
                >
                  <p className="text-sm font-medium text-white">{step.label}</p>
                  {(i <= pipeStep || phase === "done") && (
                    <p className="text-xs text-white/45">{step.detail}</p>
                  )}
                </div>
              ))}
              {phase === "done" && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-emerald-400 font-semibold"
                >
                  +${amount} delivered instantly
                </motion.p>
              )}
              {phase === "done" && (
                <Button variant="glass" className="w-full" onClick={reset}>
                  Send another
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SectionShell>
  );
}
