"use client";

import { motion } from "framer-motion";
import { Bot, Shield, Zap } from "lucide-react";
import { fadeUpItem, staggerContainer } from "@/lib/motion";

const ITEMS = [
  {
    icon: Zap,
    title: "Gasless transfers",
    desc: "Send USDC on Arc with Circle Paymaster sponsorship — no native ETH for users.",
  },
  {
    icon: Bot,
    title: "AI remittance copilot",
    desc: "Natural language intents become locked previews. You confirm and sign every transfer.",
  },
  {
    icon: Shield,
    title: "Security-first",
    desc: "No autonomous execution. Prompt-injection guards and mandatory wallet approval.",
  },
] as const;

export default function Features() {
  return (
    <section id="features" className="relative z-10 px-4 py-24 md:px-8">
      <div className="mx-auto max-w-5xl">
        <motion.h2
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, margin: "-80px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="text-center text-3xl font-bold tracking-tight text-[var(--ar-fg)] md:text-4xl"
        >
          Features
        </motion.h2>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, margin: "-60px" }}
          className="mt-14 grid gap-6 md:grid-cols-3"
        >
          {ITEMS.map((item) => (
            <motion.article
              key={item.title}
              variants={fadeUpItem}
              whileHover={{
                y: -8,
                scale: 1.02,
                borderColor: "rgba(34,211,238,0.35)",
                boxShadow: "0 20px 40px rgba(0,229,255,0.08)",
              }}
              transition={{ type: "spring", stiffness: 200, damping: 26 }}
              className="rounded-2xl border border-[var(--ar-border)] bg-[var(--ar-surface)] p-6 backdrop-blur-sm"
            >
              <motion.div
                whileHover={{ rotate: [0, -8, 8, 0], scale: 1.1 }}
                transition={{ duration: 0.5 }}
              >
                <item.icon className="mb-4 h-8 w-8 text-cyan-400" aria-hidden />
              </motion.div>
              <h3 className="text-lg font-semibold text-[var(--ar-fg)]">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ar-fg-muted)]">
                {item.desc}
              </p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
