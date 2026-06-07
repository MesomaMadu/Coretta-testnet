"use client";

import { type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { smoothEase } from "@/lib/motion";

/** Root providers — dark mode only; no wagmi on marketing pages. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="never"
      transition={{ duration: 0.65, ease: smoothEase }}
    >
      {children}
    </MotionConfig>
  );
}
