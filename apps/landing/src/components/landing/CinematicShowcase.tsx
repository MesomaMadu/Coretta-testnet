"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Shield, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AGENT_NAME, BRAND_NAME } from "@/lib/brand";

type ScreenId = "balance" | "send" | "swap" | "status";

const SCREENS: Array<{
  id: ScreenId;
  label: string;
  title: string;
}> = [
  { id: "balance", label: "Balance", title: "Smart wallet" },
  { id: "send", label: "Send", title: "USDC remittance" },
  { id: "swap", label: "Swap", title: "USDC → EURC" },
  { id: "status", label: "Status", title: "Settled on Arc" },
];

function ScreenBalance() {
  return (
    <div className="flex h-full flex-col p-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--cine-ui-text-muted)]">
        Available
      </p>
      <p className="mt-2 text-4xl font-bold tracking-tight text-[var(--cine-ui-text)]">
        $2,480.00
      </p>
      <p className="mt-1 text-xs text-[var(--cine-ui-text-muted)]">USDC · Arc Testnet</p>
      <div className="cine-ui-card mt-6 space-y-3 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--cine-ui-text-muted)]">Smart wallet</span>
          <span className="font-medium text-[var(--cine-ui-text)]">Active</span>
        </div>
        <div className="h-px bg-[var(--cine-ui-divider)]" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--cine-ui-text-muted)]">Gas</span>
          <span className="font-medium text-[var(--cine-ui-accent)]">Sponsored</span>
        </div>
      </div>
      <div className="mt-auto rounded-2xl bg-[var(--cine-ui-accent)] px-4 py-3 text-center text-sm font-semibold text-white">
        Open {AGENT_NAME}
      </div>
    </div>
  );
}

function ScreenSend() {
  return (
    <div className="flex h-full flex-col p-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--cine-ui-text-muted)]">
        Send
      </p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--cine-ui-text)]">50.00 USDC</p>
      <div className="cine-ui-card mt-5 space-y-0 overflow-hidden">
        {[
          { k: "To", v: "0xA1b2…9f3C" },
          { k: "Network", v: "Arc Testnet" },
          { k: "Fee", v: "Sponsored" },
        ].map((row, i) => (
          <div key={row.k}>
            {i > 0 && <div className="h-px bg-[var(--cine-ui-divider)]" />}
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-[var(--cine-ui-text-muted)]">{row.k}</span>
              <span className="font-medium text-[var(--cine-ui-text)]">{row.v}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto rounded-2xl bg-[var(--cine-ui-accent)] px-4 py-3 text-center text-sm font-semibold text-white">
        Confirm & Sign
      </div>
    </div>
  );
}

function ScreenSwap() {
  return (
    <div className="flex h-full flex-col p-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--cine-ui-text-muted)]">
        Swap
      </p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--cine-ui-text)]">
        100 USDC
      </p>
      <p className="mt-1 text-sm text-[var(--cine-ui-text-muted)]">→ EURC on Arc</p>
      <div className="cine-ui-card mt-6 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[var(--cine-ui-text-muted)]">You send</p>
            <p className="text-lg font-bold text-[var(--cine-ui-text)]">100 USDC</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-[var(--cine-ui-text-muted)]">You receive</p>
            <p className="text-lg font-bold text-[var(--cine-ui-accent)]">~91.4 EURC</p>
          </div>
        </div>
      </div>
      <div className="mt-auto rounded-2xl bg-[var(--cine-ui-accent)] px-4 py-3 text-center text-sm font-semibold text-white">
        Review swap
      </div>
    </div>
  );
}

function ScreenStatus() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--cine-ui-accent)]/15 text-[var(--cine-ui-accent)]">
        <Shield className="h-7 w-7" />
      </div>
      <p className="mt-5 text-2xl font-bold tracking-tight text-[var(--cine-ui-text)]">
        Transaction successful
      </p>
      <p className="mt-2 max-w-[220px] text-sm text-[var(--cine-ui-text-muted)]">
        Settled on Arc Testnet with sponsored gas via Circle Paymaster.
      </p>
      <div className="cine-ui-card mt-6 w-full px-4 py-3 text-left text-xs text-[var(--cine-ui-text-muted)]">
        Hash · 0x7f3a…c2e1
      </div>
    </div>
  );
}

function DeviceScreen({ id }: { id: ScreenId }) {
  switch (id) {
    case "balance":
      return <ScreenBalance />;
    case "send":
      return <ScreenSend />;
    case "swap":
      return <ScreenSwap />;
    case "status":
      return <ScreenStatus />;
  }
}

export default function CinematicShowcase() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SCREENS.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  const screen = SCREENS[index];

  return (
    <section
      id="showcase"
      className="hero-section relative z-10 flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 pb-20 pt-28 md:px-8"
    >
      {/* Near-void stage */}
      <div className="pointer-events-none absolute inset-0 bg-[var(--cine-void)]" aria-hidden />
      <div className="cine-glow-orb" aria-hidden />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Copy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="order-2 text-center lg:order-1 lg:text-left"
        >
          <p className="inline-flex items-center gap-2 rounded-full border border-[var(--ar-accent)]/30 bg-[var(--ar-accent)]/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--ar-accent-soft)]">
            <Sparkles className="h-3 w-3" />
            Arc Testnet · AI remittance
          </p>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-[var(--ar-fg)] sm:text-5xl lg:text-6xl">
            Send USDC.
            <br />
            <span className="hero-headline-gradient">Zero friction.</span>
          </h1>
          <p className="subheading-text mx-auto mt-5 max-w-md text-base text-[var(--ar-fg-muted)] lg:mx-0">
            {BRAND_NAME} hides the chain. Connect a wallet, talk to {AGENT_NAME}, and settle
            sponsored transfers on Arc Testnet — almost instantly.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Button asChild variant="primary" size="lg" className="gap-2">
              <Link href="/app">
                Go to app <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="glass" size="lg">
              <a href="#how">How it works</a>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-[var(--ar-fg-subtle)] lg:justify-start">
            <span className="inline-flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-[var(--ar-accent-soft)]" /> Gas sponsored
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-[var(--ar-accent-soft)]" /> Ownership signed
            </span>
          </div>
        </motion.div>

        {/* Device mockup */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="order-1 mx-auto w-full max-w-[300px] lg:order-2 lg:max-w-[340px]"
        >
          <div className="cine-device-shell p-2.5 sm:p-3">
            <div className="cine-device-screen relative aspect-[9/16] w-full">
              <AnimatePresence mode="wait">
                <motion.div
                  key={screen.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute inset-0"
                >
                  <DeviceScreen id={screen.id} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <div className="mt-4 flex justify-center gap-2">
            {SCREENS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Show ${s.label}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index
                    ? "w-6 bg-[var(--ar-accent-soft)]"
                    : "w-1.5 bg-white/20 hover:bg-white/35"
                }`}
              />
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-[var(--ar-fg-subtle)]">
            {screen.title}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
