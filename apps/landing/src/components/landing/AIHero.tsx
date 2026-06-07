"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Mic, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import AIOrb from "@/components/ai/AIOrb";
import { parseUserIntent } from "@/lib/agent/intent-parser";

const SUGGESTIONS = [
  "Send 50 USDC to Maria",
  "Convert 100 USDC to EURC and send to James",
  "Swap 25 USDC to EURC",
];

export default function AIHero() {
  const [input, setInput] = useState("");
  const [reply, setReply] = useState<string | null>(null);

  const tryPrompt = (text: string) => {
    setInput(text);
    const result = parseUserIntent(text);
    if (result.ok) {
      setReply(
        `Preview ready: ${result.preview.amount} ${result.preview.asset} → ${result.preview.recipient}. Open the app to confirm & sign.`,
      );
    } else {
      setReply(result.message);
    }
  };

  return (
    <section className="relative z-10 px-4 pb-12 pt-28 md:px-8 md:pt-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <div className="text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-cyan-400/90"
          >
            AI-native · Gasless · Arc Testnet
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl"
          >
            Talk money.
            <br />
            <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
              Send in seconds.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="mx-auto mt-6 max-w-xl text-base text-white/55 md:text-lg lg:mx-0"
          >
            Your conversational remittance copilot on Arc. Say who to pay — review a
            locked preview — confirm and sign. No autonomous transfers. Ever.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button variant="primary" size="lg" asChild>
              <Link href="/app">Go To App</Link>
            </Button>
            <Button variant="glass" size="lg" asChild>
              <Link href="/#demo">See it work</Link>
            </Button>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl"
        >
          <div className="mb-6 flex flex-col items-center">
            <AIOrb active={!!reply} size="md" />
            <p className="mt-3 text-sm font-medium text-white/70">Damian</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              tryPrompt(input);
            }}
            className="space-y-3"
          >
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Send 50 USDC to Alex…"
                className="flex-1 rounded-full border border-white/15 bg-black/30 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400/40"
              />
              <Button type="submit" variant="primary" size="sm" className="h-10 w-10 rounded-full p-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="flex items-center gap-1 text-[10px] text-white/35">
              <Mic className="h-3 w-3" /> Full voice in app — always requires your confirmation
            </p>
          </form>

          {reply && (
            <p className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-950/30 px-4 py-3 text-sm text-cyan-100/90">
              {reply}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => tryPrompt(s)}
                className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/50 transition hover:border-cyan-400/30 hover:text-white/80"
              >
                {s}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
