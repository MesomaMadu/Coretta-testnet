"use client";

import { motion } from "framer-motion";
import { fadeUpItem, staggerContainer } from "@/lib/motion";

const STEPS = [
  { n: "01", title: "Describe your transfer", body: "Tell the AI who to pay and how much in plain language." },
  { n: "02", title: "Review locked preview", body: "See recipient, asset, amount, and gas sponsorship before you sign." },
  { n: "03", title: "Confirm in your wallet", body: "Approve on Arc Testnet. Funds move only after explicit consent." },
] as const;

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative z-10 px-4 py-24 md:px-8">
      <div className="mx-auto max-w-4xl">
        <motion.h2
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, margin: "-80px" }}
          transition={{ duration: 0.55 }}
          className="text-center text-3xl font-bold tracking-tight text-[var(--ar-fg)] md:text-4xl"
        >
          How it Works
        </motion.h2>

        <motion.ol
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, margin: "-60px" }}
          className="relative mt-14 space-y-8"
        >
          <motion.div
            className="absolute left-8 top-8 bottom-8 w-px bg-gradient-to-b from-cyan-400/50 via-violet-400/30 to-transparent md:left-10"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: false }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ originY: 0 }}
            aria-hidden
          />

          {STEPS.map((step) => (
            <motion.li
              key={step.n}
              variants={fadeUpItem}
              whileHover={{ x: 6, borderColor: "rgba(34,211,238,0.3)" }}
              className="relative flex gap-6 rounded-2xl border border-[var(--ar-border)] bg-[var(--ar-input-bg)] p-6 transition-shadow hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
            >
              <motion.span
                className="relative z-10 text-2xl font-bold text-cyan-400/90"
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                {step.n}
              </motion.span>
              <div className="text-left">
                <h3 className="text-lg font-semibold text-[var(--ar-fg)]">{step.title}</h3>
                <p className="mt-1 text-sm text-[var(--ar-fg-muted)]">{step.body}</p>
              </div>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
