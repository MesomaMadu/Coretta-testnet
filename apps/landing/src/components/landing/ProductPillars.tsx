"use client";

import { MessageSquare, Shield, Zap } from "lucide-react";
import SectionShell from "@/components/shared/SectionShell";

const PILLARS = [
  {
    icon: MessageSquare,
    title: "Talk, don't tap through forms",
    body: "Describe transfers in plain language. USDC, EURC, and swaps — parsed into strict, reviewable previews.",
  },
  {
    icon: Shield,
    title: "You always sign",
    body: "The AI never moves funds alone. Prompt-injection patterns are blocked. Preview hashes are locked before signing.",
  },
  {
    icon: Zap,
    title: "USDC gas on Arc",
    body: "Circle Paymaster lets compatible smart wallets pay gas in USDC. Smart wallets and bundlers stay out of the user's way.",
  },
];

export default function ProductPillars() {
  return (
    <SectionShell
      id="why"
      eyebrow="Why Coretta"
      title="Remittance built for humans"
      subtitle="Consumer-first design with production-grade safety underneath."
    >
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
        {PILLARS.map((p) => (
          <article
            key={p.title}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm"
          >
            <p.icon className="mb-4 h-8 w-8 text-cyan-400" />
            <h3 className="text-lg font-semibold text-white">{p.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/50">{p.body}</p>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
