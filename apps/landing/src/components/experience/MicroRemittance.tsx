"use client";

import { motion } from "framer-motion";
import { Gauge, Layers, Zap } from "lucide-react";
import SectionShell from "@/components/shared/SectionShell";

const OPTS = [
  { icon: Layers, title: "Batching", desc: "Aggregate operations where possible to reduce per-tx overhead." },
  { icon: Gauge, title: "Transfer limits", desc: "Hard caps per transfer and per day limit account risk." },
  { icon: Zap, title: "Fast indexing", desc: "Off-chain indexer for instant UI — chain is source of truth." },
] as const;

export default function MicroRemittance() {
  return (
    <SectionShell
      eyebrow="Micro-remittance"
      title="Optimized for small, frequent sends"
      subtitle="High-volume remittance without high-volume cost."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {OPTS.map((o, i) => {
          const Icon = o.icon;
          return (
            <motion.div
              key={o.title}
              className="rounded-2xl border border-white/10 p-6 text-center"
              whileInView={{ y: [0, -4, 0] }}
              viewport={{ once: true }}
              transition={{ duration: 3, repeat: Infinity, delay: i * 0.4 }}
            >
              <Icon className="mx-auto h-8 w-8 text-cyan-400" />
              <h3 className="mt-4 font-semibold text-white">{o.title}</h3>
              <p className="mt-2 text-sm text-white/50">{o.desc}</p>
            </motion.div>
          );
        })}
      </div>
    </SectionShell>
  );
}
