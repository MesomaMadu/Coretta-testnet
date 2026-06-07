"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Fingerprint, Lock, Shield, ShieldCheck } from "lucide-react";
import SectionShell from "@/components/shared/SectionShell";
import { loopSlow, springSmooth, staggerContainer, fadeUpItem } from "@/lib/motion";

const ITEMS = [
  {
    icon: ShieldCheck,
    title: "Secure smart wallets",
    desc: "Programmable accounts with policy controls and non-custodial signing.",
  },
  {
    icon: Lock,
    title: "Sponsored gas",
    desc: "Circle Paymaster validates every sponsored transfer before execution.",
  },
  {
    icon: Shield,
    title: "Protected infrastructure",
    desc: "Bundler, paymaster, and Arc nodes form a hardened settlement stack.",
  },
  {
    icon: Fingerprint,
    title: "Encrypted identity mapping",
    desc: "Email and phone map to wallets — encrypted at rest, never on-chain.",
  },
] as const;

function TrustCard({
  icon: Icon,
  title,
  desc,
  index,
}: {
  icon: typeof Shield;
  title: string;
  desc: string;
  index: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: false, margin: "-50px" });

  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ ...springSmooth, delay: index * 0.07 }}
      whileHover={{ y: -4, borderColor: "rgba(52,211,153,0.35)" }}
      className="relative flex gap-4 overflow-hidden rounded-2xl border border-[var(--ar-border)] bg-[var(--ar-surface)] p-6 backdrop-blur-sm"
    >
      <motion.div
        className="pointer-events-none absolute -left-4 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full bg-emerald-400/10 blur-xl"
        animate={{ opacity: [0.2, 0.5, 0.2], scale: [1, 1.2, 1] }}
        transition={{ ...loopSlow, delay: index * 0.35 }}
        aria-hidden
      />

      <motion.div
        className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10"
        animate={{
          boxShadow: [
            "0 0 0 rgba(52,211,153,0)",
            "0 0 24px rgba(52,211,153,0.25)",
            "0 0 0 rgba(52,211,153,0)",
          ],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: index * 0.5 }}
      >
        <Icon className="h-7 w-7 text-emerald-400" aria-hidden />
        <motion.span
          className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-[8px] font-bold text-slate-900"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        >
          ✓
        </motion.span>
      </motion.div>

      <div>
        <h3 className="font-semibold text-[var(--ar-fg)]">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--ar-fg-muted)]">{desc}</p>
      </div>
    </motion.article>
  );
}

export default function TrustSecurity() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: false, margin: "-60px" });

  return (
    <SectionShell
      id="security"
      eyebrow="Trust & Security"
      title="Infrastructure you can trust"
      subtitle="Security without sacrificing the simplicity users expect."
    >
      <motion.div
        ref={ref}
        variants={staggerContainer}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
        className="grid gap-6 md:grid-cols-2"
      >
        {ITEMS.map((item, i) => (
          <motion.div key={item.title} variants={fadeUpItem}>
            <TrustCard {...item} index={i} />
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: false, margin: "-40px" }}
        transition={{ duration: 0.8, ease: [0.33, 1, 0.68, 1] }}
        className="mt-10 flex flex-wrap items-center justify-center gap-4"
      >
        {["Policy validated", "Preview locked", "Wallet signed", "Arc settled"].map((step, i) => (
          <motion.div
            key={step}
            className="flex items-center gap-2 text-xs text-[var(--ar-fg-muted)]"
            animate={inView ? { opacity: [0.5, 1, 0.5] } : {}}
            transition={{ duration: 3, repeat: Infinity, delay: i * 0.5, ease: "easeInOut" }}
          >
            <span className="h-px w-6 bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
            {step}
          </motion.div>
        ))}
      </motion.div>
    </SectionShell>
  );
}
