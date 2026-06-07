"use client";

import { motion } from "framer-motion";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: false }}
      transition={{ duration: 0.6 }}
      className="relative z-10 border-t border-[var(--ar-border)] px-4 py-10 md:px-8"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 text-center">
        <p className="text-xs text-[var(--ar-fg-subtle)]">
          © {year} Coretta. All rights reserved.
        </p>
      </div>
    </motion.footer>
  );
}
