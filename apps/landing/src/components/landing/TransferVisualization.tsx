"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Check, Shield, Zap } from "lucide-react";

const STEPS = [
  { id: 0, label: "Send initiated", icon: Zap },
  { id: 1, label: "Gas sponsored", icon: Shield },
  { id: 2, label: "Settled on Arc", icon: Zap },
  { id: 3, label: "Funds received", icon: Check },
] as const;

export default function TransferVisualization() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % 4), 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative mx-auto mt-14 w-full max-w-lg" aria-hidden>
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/10" />

        <div className="absolute left-[12%] top-[38%] z-10">
          <motion.div
            className="flex h-16 w-16 flex-col items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10 text-center"
            animate={{ boxShadow: ["0 0 0 rgba(0,229,255,0)", "0 0 24px rgba(0,229,255,0.35)", "0 0 0 rgba(0,229,255,0)"] }}
            transition={{ duration: 2.8, repeat: Infinity }}
          >
            <span className="text-[10px] text-white/50">You</span>
            <span className="text-xs font-semibold text-white">$24.00</span>
          </motion.div>
        </div>

        <div className="absolute right-[12%] top-[38%] z-10">
          <motion.div
            className="flex h-16 w-16 flex-col items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10"
            animate={{
              scale: step === 3 ? [1, 1.06, 1] : 1,
              boxShadow: step === 3 ? "0 0 28px rgba(52,211,153,0.4)" : "none",
            }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-[10px] text-white/50">Them</span>
            <span className="text-xs font-semibold text-emerald-300">
              {step >= 3 ? "$24.00" : "—"}
            </span>
          </motion.div>
        </div>

        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 300">
          <defs>
            <linearGradient id="beam" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00E5FF" stopOpacity="0" />
              <stop offset="50%" stopColor="#7B61FF" stopOpacity="1" />
              <stop offset="100%" stopColor="#34D399" stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            d="M 95 150 Q 200 120 305 150"
            fill="none"
            stroke="url(#beam)"
            strokeWidth="2"
            strokeDasharray="8 6"
            animate={{
              strokeDashoffset: step >= 1 ? [0, -28] : 0,
              opacity: step >= 1 ? 1 : 0.25,
            }}
            transition={{ strokeDashoffset: { duration: 1.2, repeat: Infinity, ease: "linear" }, opacity: { duration: 0.4 } }}
          />
          <AnimatePresence>
            {step >= 1 && (
              <motion.circle
                r="6"
                fill="#00E5FF"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: [0.4, 1, 0.4],
                  cx: [95, 200, 305],
                  cy: [150, 130, 150],
                }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                style={{ filter: "blur(1px)" }}
              />
            )}
          </AnimatePresence>
        </svg>

        <div className="absolute bottom-4 left-4 right-4 flex justify-between gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = step === i;
            return (
              <div
                key={s.id}
                className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 transition-colors ${
                  active ? "bg-white/10" : "opacity-40"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? "text-cyan-400" : "text-white/50"}`} />
                <span className="text-center text-[9px] leading-tight text-white/70">{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
