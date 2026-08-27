"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Layers, Network, Shield, Wallet } from "lucide-react";
import SectionShell from "@/components/shared/SectionShell";
import { cn } from "@/lib/utils";

const LAYERS = [
  {
    id: "wallet",
    label: "Smart Wallet Layer",
    icon: Wallet,
    tagline: "Every user gets a smart wallet automatically.",
    points: ["ERC-4337 smart accounts", "No seed phrases", "Circle Programmable Wallets", "Auto-created on first interaction"],
    color: "from-cyan-500/20 to-cyan-500/5",
    border: "border-cyan-400/30",
  },
  {
    id: "gas",
    label: "USDC Fee Layer",
    icon: Shield,
    tagline: "Compatible smart accounts pay gas in USDC.",
    points: ["Circle Paymaster", "USDC fee abstraction", "Validation before execution", "No native ETH needed"],
    color: "from-violet-500/20 to-violet-500/5",
    border: "border-violet-400/30",
  },
  {
    id: "exec",
    label: "Execution Layer",
    icon: Cpu,
    tagline: "UserOperations are executed seamlessly.",
    points: ["Bundler infrastructure", "Pimlico-compatible relay", "Transaction packaging", "Queue & retry logic"],
    color: "from-fuchsia-500/20 to-fuchsia-500/5",
    border: "border-fuchsia-400/30",
  },
  {
    id: "arc",
    label: "Arc Network Layer",
    icon: Network,
    tagline: "Finalized in under a second.",
    points: ["Sub-second finality", "USDC-native gas", "Deterministic settlement", "Account abstraction native"],
    color: "from-blue-500/20 to-blue-500/5",
    border: "border-blue-400/30",
  },
] as const;

export default function InfrastructureLayers() {
  const [active, setActive] = useState(0);
  const layer = LAYERS[active];
  const Icon = layer.icon;

  return (
    <SectionShell
      id="infrastructure"
      eyebrow="Live architecture"
      title="Four layers. One invisible experience."
      subtitle="Tap each layer to see how Coretta orchestrates remittance."
    >
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-2">
          {LAYERS.map((l, i) => {
            const LIcon = l.icon;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                  active === i ? l.border + " bg-white/[0.06]" : "border-transparent hover:bg-white/[0.03]",
                )}
              >
                <LIcon className={cn("h-5 w-5", active === i ? "text-cyan-400" : "text-white/40")} />
                <span className="text-sm font-medium text-white">{l.label}</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={layer.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={cn(
              "relative min-h-[320px] overflow-hidden rounded-3xl border bg-gradient-to-br p-8",
              layer.border,
              layer.color,
            )}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
                <Icon className="h-7 w-7 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{layer.label}</h3>
                <p className="mt-1 text-cyan-300/90">{layer.tagline}</p>
              </div>
            </div>

            <ul className="mt-8 space-y-3">
              {layer.points.map((p, i) => (
                <motion.li
                  key={p}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex items-center gap-2 text-sm text-white/70"
                >
                  <Layers className="h-4 w-4 shrink-0 text-white/30" />
                  {p}
                </motion.li>
              ))}
            </ul>

            <LayerAnimation id={layer.id} />
          </motion.div>
        </AnimatePresence>
      </div>
    </SectionShell>
  );
}

function LayerAnimation({ id }: { id: string }) {
  if (id === "wallet") {
    return (
      <motion.div
        className="absolute bottom-8 right-8 flex gap-2"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-8 w-8 rounded-lg border border-cyan-400/40 bg-cyan-500/10" />
        ))}
      </motion.div>
    );
  }
  if (id === "gas") {
    return (
      <motion.div
        className="absolute bottom-6 right-6 h-20 w-20 rounded-full border-2 border-violet-400/50"
        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.8, 0.4] }}
        transition={{ repeat: Infinity, duration: 2 }}
      />
    );
  }
  if (id === "exec") {
    return (
      <motion.div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="h-8 w-2 rounded-full bg-fuchsia-400/60"
            animate={{ scaleY: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
          />
        ))}
      </motion.div>
    );
  }
  return (
    <motion.div
      className="absolute bottom-8 right-8 h-16 w-16 rounded-full border border-blue-400/50"
      animate={{ boxShadow: ["0 0 0 rgba(41,121,255,0)", "0 0 40px rgba(41,121,255,0.5)", "0 0 0 rgba(41,121,255,0)"] }}
      transition={{ repeat: Infinity, duration: 1.5 }}
    />
  );
}
