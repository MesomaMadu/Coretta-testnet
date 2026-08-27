"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SectionShell from "@/components/shared/SectionShell";
import AIOrb from "@/components/ai/AIOrb";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const SCRIPT = [
  { role: "user" as const, text: "Send 75 USDC to david@email.com" },
  {
    role: "assistant" as const,
    text: "Here's your locked preview: 75 USDC → david@email.com on Arc Testnet. Network fees are paid in USDC.",
  },
  { role: "user" as const, text: "Confirm" },
  {
    role: "assistant" as const,
    text: "Awaiting your wallet signature… I never execute without explicit approval.",
  },
  {
    role: "system" as const,
    text: "✓ Settled on Arc — sub-second finality",
  },
];

export default function AIConversationDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setStep((s) => (s + 1) % (SCRIPT.length + 2));
    }, 2800);
    return () => clearInterval(t);
  }, []);

  const visible = SCRIPT.slice(0, Math.min(step, SCRIPT.length));

  return (
    <SectionShell
      id="demo"
      eyebrow="How it works"
      title="Conversation, preview, confirm"
      subtitle="No infrastructure jargon — just natural language, a locked preview, and your signature."
    >
      <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-[1fr,auto] lg:items-center">
        <div className="min-h-[280px] space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <AnimatePresence mode="popLayout">
            {visible.map((line, i) => (
              <motion.div
                key={`${line.text}-${i}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={
                  line.role === "user"
                    ? "ml-auto max-w-[85%] rounded-2xl bg-gradient-to-br from-cyan-600/70 to-violet-600/70 px-4 py-2.5 text-sm text-white"
                    : line.role === "system"
                      ? "text-center text-xs font-medium text-emerald-400"
                      : "max-w-[90%] rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/80"
                }
              >
                {line.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="flex flex-col items-center gap-6">
          <AIOrb active={step % 2 === 0} size="lg" />
          <Button variant="glow" asChild>
            <Link href="/app">Try the full app</Link>
          </Button>
        </div>
      </div>
    </SectionShell>
  );
}
