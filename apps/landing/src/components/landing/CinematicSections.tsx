"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Bot, Lock, Network, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fadeUpItem, staggerContainer } from "@/lib/motion";
import { AGENT_NAME, BRAND_NAME } from "@/lib/brand";

const PILLARS = [
  {
    icon: Wallet,
    title: "Wallet-first",
    body: "Connect MetaMask, Rabby, OKX, or WalletConnect. Ownership is proven with one free signature.",
  },
  {
    icon: Bot,
    title: `${AGENT_NAME} copilot`,
    body: "Describe a transfer in plain language. Preview locks before you confirm and sign.",
  },
  {
    icon: Network,
    title: "Arc settlement",
    body: "USDC remittance on Arc Testnet with sub-second finality and sponsored gas.",
  },
  {
    icon: Lock,
    title: "Smart wallet bound",
    body: "Your operational SCA binds to the connected EOA — no seed phrases for end users.",
  },
] as const;

const STEPS = [
  { n: "01", t: "Connect", d: "Browser wallet or WalletConnect on Arc Testnet." },
  { n: "02", t: "Verify", d: "Sign a free ownership message — no gas." },
  { n: "03", t: "Send", d: `Tell ${AGENT_NAME} who and how much. Confirm & sign.` },
  { n: "04", t: "Settle", d: "Sponsored UserOp lands; track success or failure in Activity." },
] as const;

export function FeaturePillars() {
  return (
    <section id="features" className="relative z-10 px-4 py-24 md:px-8">
      <div className="mx-auto max-w-5xl">
        <motion.header
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.p
            variants={fadeUpItem}
            className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--ar-accent-soft)]"
          >
            Product
          </motion.p>
          <motion.h2
            variants={fadeUpItem}
            className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--ar-fg)] md:text-4xl"
          >
            Built for remittance, not chrome
          </motion.h2>
          <motion.p variants={fadeUpItem} className="subheading-text mt-3 text-[var(--ar-fg-muted)]">
            One dominant idea per beat — connect, instruct, settle.
          </motion.p>
        </motion.header>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {PILLARS.map((p, i) => (
            <motion.article
              key={p.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.45 }}
              className="rounded-[var(--cine-radius-card)] border border-[var(--ar-border)] bg-[var(--ar-surface)]/80 p-6 backdrop-blur-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ar-accent)]/30 bg-[var(--ar-accent)]/10 text-[var(--ar-accent-soft)]">
                <p.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-[var(--ar-fg)]">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ar-fg-muted)]">{p.body}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorksStrip() {
  return (
    <section id="how" className="relative z-10 border-y border-[var(--ar-border)] bg-[var(--cine-void-warm)]/60 px-4 py-24 md:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mx-auto max-w-xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--ar-accent-soft)]">
            Flow
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--ar-fg)] md:text-4xl">
            Four steps. One signature per send.
          </h2>
        </header>
        <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <motion.li
              key={s.n}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="relative rounded-[var(--cine-radius-card)] border border-[var(--ar-border)] bg-[var(--ar-bg)]/80 p-5"
            >
              <span className="text-xs font-bold tracking-widest text-[var(--ar-accent-soft)]">
                {s.n}
              </span>
              <h3 className="mt-2 text-base font-bold text-[var(--ar-fg)]">{s.t}</h3>
              <p className="mt-2 text-sm text-[var(--ar-fg-muted)]">{s.d}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function TrustStrip() {
  return (
    <section id="security" className="relative z-10 px-4 py-24 md:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--ar-accent-soft)]">
          Trust
        </p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--ar-fg)] md:text-4xl">
          You always sign. We never send alone.
        </h2>
        <p className="subheading-text mx-auto mt-4 max-w-lg text-[var(--ar-fg-muted)]">
          {AGENT_NAME} prepares locked previews. Transfers and swaps only execute after your wallet
          approval. No seed phrases. No claim links.
        </p>
        <ul className="mx-auto mt-10 grid max-w-lg gap-3 text-left text-sm text-[var(--ar-fg-muted)]">
          {[
            "Ownership signature before session privileges",
            "Smart wallet bound to your connected EOA",
            "Circle Paymaster sponsorship on Arc Testnet",
            "Activity shows only success or failure outcomes",
          ].map((line) => (
            <li
              key={line}
              className="flex items-start gap-3 rounded-xl border border-[var(--ar-border)] bg-[var(--ar-surface)]/60 px-4 py-3"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ar-accent-soft)]" />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Bookend outro — same void + glow language as the hero */
export function CinematicOutro() {
  return (
    <section
      id="cta"
      className="hero-section relative z-10 flex min-h-[70dvh] flex-col items-center justify-center overflow-hidden px-4 py-24 text-center md:px-8"
    >
      <div className="pointer-events-none absolute inset-0 bg-[var(--cine-void)]" aria-hidden />
      <div className="cine-glow-orb opacity-90" aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative z-10 max-w-xl"
      >
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-[var(--ar-accent-soft)]">
          {BRAND_NAME}
        </p>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[var(--ar-fg)] sm:text-4xl md:text-5xl">
          Ready when you are.
        </h2>
        <p className="subheading-text mt-4 text-[var(--ar-fg-muted)]">
          Connect a wallet. Let {AGENT_NAME} handle the rest.
        </p>
        <Button asChild variant="primary" size="lg" className="mt-8 gap-2">
          <Link href="/app">
            Launch app <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </motion.div>
    </section>
  );
}
