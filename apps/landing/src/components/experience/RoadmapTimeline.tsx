"use client";

import { motion } from "framer-motion";
import SectionShell from "@/components/shared/SectionShell";

const PHASES = [
  { phase: "Phase 1", title: "Core setup", items: ["Circle Wallets", "Arc RPC", "USDC transfers"] },
  { phase: "Phase 2", title: "USDC fee infrastructure", items: ["Paymaster", "Fee policy", "Bundler"] },
  { phase: "Phase 3", title: "UX layer", items: ["Identity system", "Onboarding", "History"] },
  { phase: "Phase 4", title: "Advanced", items: ["Username sends", "Notifications", "Link transfers"] },
] as const;

export default function RoadmapTimeline() {
  return (
    <SectionShell
      id="roadmap"
      eyebrow="Roadmap"
      title="Implementation strategy"
      subtitle="A phased path from core rails to world-class UX."
    >
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-cyan-400/50 via-violet-400/50 to-transparent md:left-1/2 md:-translate-x-px" />
        <div className="space-y-12">
          {PHASES.map((p, i) => (
            <motion.div
              key={p.phase}
              className={`relative flex flex-col gap-4 md:w-1/2 ${
                i % 2 === 0 ? "md:ml-0 md:pr-12 md:text-right" : "md:ml-auto md:pl-12"
              }`}
              initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <div
                className={`absolute top-2 h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(0,229,255,0.6)] md:top-3 ${
                  i % 2 === 0 ? "right-0 md:right-auto md:left-1/2 md:-translate-x-1/2" : "left-0 md:left-1/2 md:-translate-x-1/2"
                }`}
              />
              <p className="text-xs font-medium uppercase tracking-wider text-violet-400">{p.phase}</p>
              <h3 className="text-lg font-bold text-white">{p.title}</h3>
              <ul className={`space-y-1 text-sm text-white/50 ${i % 2 === 0 ? "md:items-end" : ""}`}>
                {p.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
