"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowRight, Send, Shield, Sparkles, Wallet, Zap } from "lucide-react";
import SectionShell from "@/components/shared/SectionShell";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DEMO_STEPS = [
  {
    title: "Send in one tap",
    desc: "Enter who you're paying and how much. That's it.",
    icon: Send,
    visual: "send",
  },
  {
    title: "Smart wallet ready",
    desc: "We create a secure wallet behind the scenes — no seed phrases.",
    icon: Wallet,
    visual: "wallet",
  },
  {
    title: "Gas sponsored",
    desc: "Circle Paymaster covers network fees. You never touch gas.",
    icon: Shield,
    visual: "paymaster",
  },
  {
    title: "Settled on Arc",
    desc: "Arc confirms in under a second. Stable, predictable fees.",
    icon: Zap,
    visual: "arc",
  },
  {
    title: "Money arrives",
    desc: "Recipient sees funds instantly. No claim step ever.",
    icon: Sparkles,
    visual: "done",
  },
] as const;

export default function HowItWorksDemo() {
  const [step, setStep] = useState(0);
  const [autoplay, setAutoplay] = useState(true);

  useEffect(() => {
    if (!autoplay) return;
    const t = setInterval(() => setStep((s) => (s + 1) % DEMO_STEPS.length), 4000);
    return () => clearInterval(t);
  }, [autoplay]);

  const current = DEMO_STEPS[step];
  const Icon = current.icon;

  return (
    <SectionShell
      id="how-it-works"
      eyebrow="How it works"
      title="See remittance without the complexity"
      subtitle="A five-step story anyone can understand — no jargon required."
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div className="flex flex-col gap-2">
          {DEMO_STEPS.map((s, i) => {
            const StepIcon = s.icon;
            return (
              <button
                key={s.title}
                type="button"
                onClick={() => {
                  setAutoplay(false);
                  setStep(i);
                }}
                className={cn(
                  "flex items-start gap-4 rounded-xl border px-4 py-3 text-left transition-all",
                  step === i
                    ? "border-cyan-400/40 bg-cyan-500/10"
                    : "border-transparent bg-white/[0.02] hover:bg-white/[0.05]",
                )}
              >
                <StepIcon
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0",
                    step === i ? "text-cyan-400" : "text-white/40",
                  )}
                />
                <div>
                  <p className="font-medium text-white">{s.title}</p>
                  <p className="text-sm text-white/45">{s.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        <Card className="relative min-h-[360px] overflow-hidden">
          <CardContent className="flex h-full min-h-[360px] flex-col justify-between p-6 md:p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.35 }}
                className="flex flex-1 flex-col"
              >
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20">
                    <Icon className="h-5 w-5 text-cyan-300" />
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Step {step + 1} of 5</p>
                    <p className="font-semibold text-white">{current.title}</p>
                  </div>
                </div>

                <DemoVisual type={current.visual} />
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
              <div className="flex gap-1.5">
                {DEMO_STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1 rounded-full transition-all",
                      i === step ? "w-6 bg-cyan-400" : "w-1.5 bg-white/20",
                    )}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setAutoplay(false);
                  setStep((s) => (s + 1) % DEMO_STEPS.length);
                }}
                className="flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </SectionShell>
  );
}

function DemoVisual({ type }: { type: string }) {
  if (type === "send") {
    return (
      <div className="mx-auto w-full max-w-xs space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4">
        <input readOnly value="friend@email.com" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80" />
        <input readOnly value="$42.00" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80" />
        <motion.button
          className="w-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 py-2.5 text-sm font-semibold text-slate-900"
          animate={{ boxShadow: ["0 0 0 rgba(0,229,255,0)", "0 0 32px rgba(0,229,255,0.5)", "0 0 0 rgba(0,229,255,0)"] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          Send
        </motion.button>
      </div>
    );
  }

  if (type === "wallet") {
    return (
      <div className="relative flex h-48 items-center justify-center">
        {[...Array(12)].map((_, i) => (
          <motion.span
            key={i}
            className="absolute h-2 w-2 rounded-full bg-cyan-400"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0, 1, 0], x: Math.cos(i) * 60, y: Math.sin(i) * 60 }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.12 }}
          />
        ))}
        <motion.div
          className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl border border-cyan-400/40 bg-cyan-500/15"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
        >
          <Wallet className="h-8 w-8 text-cyan-300" />
        </motion.div>
      </div>
    );
  }

  if (type === "paymaster") {
    return (
      <div className="relative flex h-48 items-center justify-center">
        <motion.div
          className="absolute h-32 w-32 rounded-full border-2 border-violet-400/50"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.2, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <Shield className="relative z-10 h-14 w-14 text-violet-300" />
        <motion.p className="absolute bottom-2 text-xs text-violet-300/80" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2 }}>
          Fees covered
        </motion.p>
      </div>
    );
  }

  if (type === "arc") {
    return (
      <div className="relative flex h-48 items-center justify-center gap-4">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-12 w-12 rounded-xl border border-blue-400/30 bg-blue-500/10"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.2, 0], opacity: [0, 0.6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <div className="h-24 w-24 rounded-full border border-cyan-400/40" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2">
      <motion.p
        className="text-3xl font-bold text-emerald-400"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring" }}
      >
        +$42.00
      </motion.p>
      <p className="text-sm text-white/50">Received instantly</p>
    </div>
  );
}
