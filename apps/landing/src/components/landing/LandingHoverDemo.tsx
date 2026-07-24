"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeftRight, Check, Send } from "lucide-react";
import SectionShell from "@/components/shared/SectionShell";

const DEMO_DURATION_MS = 15_000;
const SWAP_END_MS = 7_000;

function randomEvmAddress(): string {
  const hex = Array.from({ length: 40 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
  return `0x${hex}`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type Phase = "idle" | "swap" | "send" | "done";

export default function LandingHoverDemo() {
  const [hovering, setHovering] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [recipient, setRecipient] = useState("");
  const [swapAmount, setSwapAmount] = useState("100.00");
  const [sendAmount, setSendAmount] = useState("25.00");
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    setHovering(false);
    setPhase("idle");
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (startRef.current === null) return;
    const elapsed = Date.now() - startRef.current;
    const p = Math.min(1, elapsed / DEMO_DURATION_MS);
    setProgress(p);

    if (elapsed < SWAP_END_MS) setPhase("swap");
    else if (elapsed < DEMO_DURATION_MS - 400) setPhase("send");
    else setPhase("done");

    if (elapsed >= DEMO_DURATION_MS) {
      stop();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [stop]);

  const start = useCallback(() => {
    setRecipient(randomEvmAddress());
    setSwapAmount((50 + Math.floor(Math.random() * 150)).toFixed(2));
    setSendAmount((10 + Math.floor(Math.random() * 40)).toFixed(2));
    setHovering(true);
    setPhase("swap");
    setProgress(0);
    startRef.current = Date.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <SectionShell
      id="demo"
      eyebrow="Live preview"
      title="See a transfer in 15 seconds"
      subtitle="Hover to watch a simulated swap and send — no wallet required."
    >
      <div
        className="mx-auto max-w-lg"
        onMouseEnter={start}
        onMouseLeave={stop}
        onFocus={start}
        onBlur={stop}
      >
        <div className="relative overflow-hidden rounded-3xl border border-[var(--ar-border)] bg-[var(--ar-surface)] p-6 shadow-[0_0_40px_rgba(124,77,255,0.08)]">
          <div className="mb-4 h-1 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full bg-gradient-to-r from-[#8F5CFF] to-[#3B82F6]"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          <p className="text-center text-xs text-[var(--ar-fg-subtle)]">
            {hovering ? "Demo playing…" : "Hover here to start"}
          </p>

          <AnimatePresence mode="wait">
            {phase === "swap" && (
              <motion.div
                key="swap"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-6 space-y-3"
              >
                <div className="flex items-center justify-center gap-2 text-[#8F5CFF]">
                  <ArrowLeftRight className="h-4 w-4" />
                  <span className="text-sm font-medium">Swap</span>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-center">
                  <p className="text-lg font-semibold text-white">
                    {swapAmount} USDC → EURC
                  </p>
                  <p className="mt-1 text-xs text-white/45">Arc Testnet · Circle route</p>
                </div>
              </motion.div>
            )}

            {phase === "send" && (
              <motion.div
                key="send"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-6 space-y-3"
              >
                <div className="flex items-center justify-center gap-2 text-[#8F5CFF]">
                  <Send className="h-4 w-4" />
                  <span className="text-sm font-medium">Send</span>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-center">
                  <p className="text-lg font-semibold text-white">{sendAmount} USDC</p>
                  <p className="mt-2 font-mono text-xs text-white/55">To: {shortAddr(recipient)}</p>
                  <p className="mt-1 text-[10px] text-white/35">{recipient}</p>
                </div>
              </motion.div>
            )}

            {phase === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="mt-6 flex flex-col items-center gap-2 py-4"
              >
                <Check className="h-8 w-8 text-[#16C784]" />
                <p className="text-sm font-medium text-white">Demo complete</p>
              </motion.div>
            )}

            {phase === "idle" && !hovering && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 rounded-xl border border-dashed border-white/15 py-12 text-center text-sm text-[var(--ar-fg-muted)]"
              >
                Swap 100 USDC → EURC, then send to an EVM address
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </SectionShell>
  );
}
