"use client";

import { motion, useInView } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fadeUp } from "@/lib/motion";

interface SectionShellProps {
  id?: string;
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}

export default function SectionShell({
  id,
  children,
  className,
  eyebrow,
  title,
  subtitle,
}: SectionShellProps) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: false, margin: "-100px" });

  return (
    <section
      id={id}
      ref={ref}
      className={cn("relative z-10 px-4 py-24 md:px-8 md:py-32", className)}
    >
      <div className="mx-auto max-w-6xl">
        {(eyebrow || title || subtitle) && (
          <motion.header
            className="mb-12 text-center md:mb-16"
            initial="hidden"
            animate={inView ? "visible" : "hidden"}
            variants={fadeUp}
          >
            {eyebrow && (
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-cyan-400/80">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="text-3xl font-bold tracking-tight text-[var(--ar-fg)] md:text-4xl lg:text-5xl">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mx-auto mt-4 max-w-2xl text-base text-[var(--ar-fg-muted)] md:text-lg">
                {subtitle}
              </p>
            )}
          </motion.header>
        )}
        {children}
      </div>
    </section>
  );
}
