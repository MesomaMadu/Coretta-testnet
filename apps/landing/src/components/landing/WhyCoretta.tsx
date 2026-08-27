"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
  Clock,
  Coins,
  EyeOff,
  KeyRound,
  Wallet,
  Zap,
} from "lucide-react";
import SectionShell from "@/components/shared/SectionShell";
import { loopSlow, springSmooth } from "@/lib/motion";

const FEATURES = [
  { icon: Zap, title: "USDC-first fees", desc: "Send USDC without holding a separate native gas token." },
  { icon: Clock, title: "Sub-second Finality", desc: "Arc settles transfers almost instantly." },
  { icon: Wallet, title: "Smart Wallets", desc: "Accounts appear automatically for every recipient." },
  { icon: EyeOff, title: "Invisible Blockchain", desc: "Users never see chains, gas, or complexity." },
  { icon: Coins, title: "USDC Powered", desc: "Stable value on Arc's USDC-native network." },
  { icon: KeyRound, title: "No Seed Phrases", desc: "Email or phone — that's your login." },
] as const;

function FeatureCard({
  icon: Icon,
  title,
  desc,
  index,
}: {
  icon: typeof Zap;
  title: string;
  desc: string;
  index: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: false, margin: "-40px" });

  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
      transition={{ ...springSmooth, delay: index * 0.08 }}
      whileHover={{ y: -4 }}
      className="rounded-2xl border border-[var(--ar-border)] bg-[var(--ar-surface)] p-6"
    >
      <motion.div
        className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#7C4DFF]/15"
        whileHover={{ rotate: [0, -6, 6, 0] }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      >
        <Icon className="h-5 w-5 text-[#8F5CFF]" aria-hidden />
      </motion.div>
      <h3 className="text-base font-semibold text-[var(--ar-fg)]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--ar-fg-muted)]">{desc}</p>
    </motion.article>
  );
}

export default function WhyCoretta() {
  return (
    <SectionShell
      id="why"
      title="Why Coretta"
      className="[&_header]:mb-4 md:[&_header]:mb-5"
    >
      <div className="mx-auto -mt-1 mb-12 max-w-3xl space-y-5 text-center md:mb-16">
        <p className="text-base leading-relaxed text-[var(--ar-fg-muted)] md:text-lg">
          Traditional remittance platforms were built around forms, account numbers, and
          fragmented payment rails. Coretta approaches the problem differently.
        </p>
        <p className="text-base leading-relaxed text-[var(--ar-fg-muted)] md:text-lg">
          By combining smart wallets with an AI-native interface, users can describe what they
          want in plain language while the underlying infrastructure handles transaction
          construction, routing, and execution.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.title} {...f} index={i} />
        ))}
      </div>
    </SectionShell>
  );
}
