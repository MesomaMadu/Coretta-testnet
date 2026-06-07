"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import SectionShell from "@/components/shared/SectionShell";

export default function FinalCTA() {
  return (
    <SectionShell className="pb-32">
      <motion.div
        className="relative overflow-hidden rounded-3xl border border-white/10 px-6 py-16 text-center md:px-12 md:py-20"
        initial={{ opacity: 0, scale: 0.98 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(123,97,255,0.2), transparent)",
          }}
        />
        <motion.div
          className="pointer-events-none absolute inset-0 opacity-30"
          animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          style={{
            backgroundImage:
              "linear-gradient(90deg, transparent, rgba(0,229,255,0.15), transparent)",
            backgroundSize: "200% 100%",
          }}
        />

        <h2 className="relative text-3xl font-bold tracking-tight text-white md:text-5xl">
          The future of remittance
          <br />
          <span className="text-white/70">is already here.</span>
        </h2>
        <p className="relative mx-auto mt-4 max-w-lg text-white/50">
          Instant. Gasless. Invisible.
        </p>
        <div className="relative mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button variant="glow" size="lg" asChild>
            <Link href="/app">Go To App</Link>
          </Button>
          <Button variant="glass" size="lg" asChild>
            <Link href="/#demo">Watch demo</Link>
          </Button>
        </div>
      </motion.div>
    </SectionShell>
  );
}
