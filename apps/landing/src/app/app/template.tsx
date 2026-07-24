"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export default function AppRouteTemplate({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      style={{ willChange: "opacity" }}
      className="min-h-dvh"
    >
      {children}
    </motion.div>
  );
}
