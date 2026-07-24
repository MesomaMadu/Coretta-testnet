"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

interface Props {
  viewKey: string;
  children: ReactNode;
}

export default function PageTransition({ viewKey, children }: Props) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={viewKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        style={{ willChange: "opacity, transform" }}
        className="flex h-full min-h-0 flex-1 flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
