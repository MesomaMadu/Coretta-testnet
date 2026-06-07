"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { APP_URL } from "@/lib/utils";

export default function ExperienceCTA() {
  return (
    <section className="relative z-10 px-4 py-32 md:px-8">
      <motion.div
        className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-white/10 px-6 py-20 text-center md:py-24"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(123,97,255,0.25), transparent)",
          }}
        />
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 3, repeat: Infinity }}
        />

        <h2 className="relative text-3xl font-bold text-white md:text-5xl">
          Instant. Gasless. Invisible.
        </h2>
        <p className="relative mx-auto mt-4 max-w-lg text-white/50">
          Coretta removes blockchain complexity completely.
        </p>

        <div className="relative mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button variant="primary" size="lg" asChild>
            <Link href={APP_URL}>Create wallet</Link>
          </Button>
          <Button variant="glow" size="lg" asChild>
            <Link href={APP_URL}>Start sending</Link>
          </Button>
          <Button variant="glass" size="lg" asChild>
            <Link href="/#how-it-works">Watch live demo</Link>
          </Button>
        </div>
      </motion.div>
    </section>
  );
}
