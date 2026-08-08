"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function ExperienceEntry() {
  return (
    <section className="hero-section relative z-10 min-h-[70vh] flex flex-col items-center justify-center px-4 pt-28 pb-16 text-center md:pt-36">
      <Link
        href="/"
        className="absolute left-4 top-24 flex items-center gap-2 text-sm text-white/50 hover:text-white md:left-8"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <motion.div
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        {[...Array(24)].map((_, i) => (
          <motion.span
            key={i}
            className="absolute h-1 w-1 rounded-full bg-cyan-400/60"
            style={{
              left: `${(i * 17) % 100}%`,
              top: `${(i * 23) % 100}%`,
            }}
            animate={{
              x: [0, (i % 2 ? 1 : -1) * 40],
              y: [0, (i % 3 ? 1 : -1) * 30],
              opacity: [0.2, 0.8, 0.2],
            }}
            transition={{ duration: 4 + (i % 5), repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-xs uppercase tracking-[0.3em] text-violet-400/90"
      >
        Coretta Experience
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="mt-4 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-white md:text-5xl"
      >
        Behind every transfer is a fully invisible financial engine.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-6 max-w-xl text-white/50"
      >
        Explore how smart wallets, gas sponsorship, execution, and Arc work together —
        without touching blockchain complexity.
      </motion.p>

      <motion.div
        initial={{ width: 0 }}
        animate={{ width: "100%" }}
        transition={{ delay: 0.8, duration: 1 }}
        className="mx-auto mt-12 h-px max-w-md bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent"
      />
    </section>
  );
}
