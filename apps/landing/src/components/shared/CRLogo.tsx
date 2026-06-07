"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CRLogoProps {
  size?: "sm" | "md" | "lg";
  showGlow?: boolean;
  className?: string;
  animate?: boolean;
}

const SIZES = { sm: 28, md: 32, lg: 40 } as const;

/** Geometric C+R monogram — institutional fintech mark */
export default function CRLogo({
  size = "md",
  showGlow = true,
  className,
  animate = true,
}: CRLogoProps) {
  const px = SIZES[size];
  const Mark = (
    <svg
      width={px}
      height={px}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id="cr-logo-grad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8F5CFF" />
          <stop offset="0.5" stopColor="#7C4DFF" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
        <filter id="cr-logo-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* C — open arc */}
      <path
        d="M22 8.5C19.2 5.8 15.4 4.5 11.5 5.2C6.2 6.2 2.5 10.8 2.5 16C2.5 21.2 6.2 25.8 11.5 26.8C15.4 27.5 19.2 26.2 22 23.5"
        stroke="url(#cr-logo-grad)"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
        filter={showGlow ? "url(#cr-logo-glow)" : undefined}
      />
      {/* R — vertical + bowl + leg */}
      <path
        d="M14 8V24M14 15.5C14 15.5 18.5 15.5 20.5 13.5C22.5 11.5 22 8 19 8H14M14 15.5L21.5 24"
        stroke="url(#cr-logo-grad)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        filter={showGlow ? "url(#cr-logo-glow)" : undefined}
      />
    </svg>
  );

  if (!animate) return Mark;

  return (
    <motion.span
      className="inline-flex"
      whileHover={{ scale: 1.06 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
    >
      <motion.span
        animate={{ opacity: [0.92, 1, 0.92] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      >
        {Mark}
      </motion.span>
    </motion.span>
  );
}
