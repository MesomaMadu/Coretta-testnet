"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { fadeUpItem, staggerContainer } from "@/lib/motion";

const LINKS = [
  { label: "Open App", href: "/app", external: false },
  { label: "Arc Testnet Explorer", href: "https://testnet.arcscan.app", external: true },
] as const;

export default function More() {
  return (
    <section id="more" className="relative z-10 px-4 py-20 md:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          className="text-2xl font-bold tracking-tight text-[var(--ar-fg)]"
        >
          More
        </motion.h2>

        <motion.ul
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, margin: "-40px" }}
          className="mt-8 flex flex-col gap-3"
        >
          {LINKS.map((link) => (
            <motion.li key={link.href} variants={fadeUpItem}>
              <motion.div whileHover={{ scale: 1.02, x: 4 }} whileTap={{ scale: 0.98 }}>
                {link.external ? (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl border border-[var(--ar-border)] bg-[var(--ar-surface)] px-5 py-3 text-sm font-medium text-[var(--ar-fg)] transition-colors hover:border-cyan-400/40"
                  >
                    {link.label}
                    <ArrowUpRight className="h-4 w-4 text-cyan-400" aria-hidden />
                  </a>
                ) : (
                  <Link
                    href={link.href}
                    className="flex items-center justify-center gap-2 rounded-xl border border-[var(--ar-border)] bg-[var(--ar-surface)] px-5 py-3 text-sm font-medium text-[var(--ar-fg)] transition-colors hover:border-cyan-400/40"
                  >
                    {link.label}
                  </Link>
                )}
              </motion.div>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
