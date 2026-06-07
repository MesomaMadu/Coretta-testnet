"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { fadeUpItem, staggerContainer } from "@/lib/motion";

export default function Hero() {
  const ctaRef = useRef<HTMLDivElement>(null);
  const [proximity, setProximity] = useState(0);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const el = ctaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
    const strength = Math.max(0, 1 - dist / 200);
    setProximity(strength);
  }, []);

  const onPointerLeave = useCallback(() => setProximity(0), []);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 400], [0, 80]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0.4]);

  return (
    <section
      className="relative z-10 flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 pb-24 pt-32 text-center md:px-8 md:pt-36"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[min(90vw,520px)] w-[min(90vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(123,97,255,0.2) 0%, rgba(0,229,255,0.08) 40%, transparent 70%)",
          filter: "blur(40px)",
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />

      <motion.div style={{ y, opacity }} className="relative flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: -12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#7C4DFF]/30 bg-[#7C4DFF]/10 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-[#8F5CFF]"
        >
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-[#8F5CFF]"
            animate={{ scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          Arc Testnet · AI Remittance
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center"
        >
          <motion.h1
            variants={fadeUpItem}
            className="max-w-4xl text-4xl font-bold leading-[1.08] tracking-tight text-[var(--ar-fg)] sm:text-5xl md:text-6xl lg:text-7xl"
          >
            Send USDC Anywhere.
            <br />
            <motion.span
              className="hero-headline-gradient inline-block"
              animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              style={{ backgroundSize: "300% 100%" }}
            >
              cost-optimised. No Friction.
            </motion.span>
          </motion.h1>

          <motion.p
            variants={fadeUpItem}
            className="subheading-text mt-6 max-w-2xl text-base leading-relaxed text-[var(--ar-fg-muted)] md:text-lg"
          >
            Coretta combines AI, smart accounts, and account abstraction to make global payments
            feel simple. Send, receive, or exchange digital dollars through a conversational
            interface without exposing users to blockchain complexity.
          </motion.p>

          <motion.div
            variants={fadeUpItem}
            className="mt-10 flex w-full max-w-md flex-col items-center justify-center gap-4 sm:max-w-none sm:flex-row"
          >
            <motion.div
              ref={ctaRef}
              className="w-full rounded-full sm:w-auto"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              style={{
                boxShadow:
                  proximity > 0
                    ? `0 0 ${12 + proximity * 28}px rgba(123,97,255,${0.15 + proximity * 0.35}), 0 0 ${24 + proximity * 48}px rgba(26,143,255,${0.1 + proximity * 0.25})`
                    : "0 0 0 transparent",
                transition: "box-shadow 180ms ease",
              }}
            >
              <Button variant="glow" size="lg" className="w-full" asChild>
                <Link href="/app">Go-to-app</Link>
              </Button>
            </motion.div>

            <motion.div
              className="w-full sm:w-auto"
              whileHover={{ scale: 1.03, borderColor: "rgba(255,255,255,0.5)" }}
              whileTap={{ scale: 0.98 }}
            >
              <Button variant="glass" size="lg" className="w-full" asChild>
                <Link href="/#how-it-works">How it Works</Link>
              </Button>
            </motion.div>
          </motion.div>

          <motion.p
            variants={fadeUpItem}
            className="mt-12 text-sm text-[var(--ar-fg-subtle)]"
          >
            Powered by{" "}
            <motion.a
              href="https://www.arc.network"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-cyan-400 underline-offset-4"
              whileHover={{ scale: 1.05, color: "#67e8f9" }}
            >
              Arc
            </motion.a>
          </motion.p>
        </motion.div>
      </motion.div>
    </section>
  );
}
