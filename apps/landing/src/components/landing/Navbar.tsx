"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";
import Logo from "./Logo";
import { springSnappy } from "@/lib/motion";

const NAV = [
  { label: "Features", href: "/#features" },
  { label: "Why", href: "/#why" },
  { label: "Network", href: "/#network" },
  { label: "Security", href: "/#security" },
] as const;

function NavLink({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group relative text-sm font-medium text-[var(--ar-fg-muted)] transition-colors hover:text-[var(--ar-fg)]"
    >
      {label}
      <motion.span
        className="absolute -bottom-1 left-0 h-px bg-gradient-to-r from-[#8F5CFF] to-[#7C4DFF]"
        initial={{ width: 0 }}
        whileHover={{ width: "100%" }}
        transition={{ duration: 0.25 }}
        aria-hidden
      />
    </Link>
  );
}

export default function Navbar() {
  const { scrollY } = useScroll();
  const shellOpacity = useTransform(scrollY, [0, 100], [0.88, 1]);
  const shellY = useTransform(scrollY, [0, 120], [0, -4]);
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 md:px-6 md:pt-5">
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={springSnappy}
        style={{ opacity: shellOpacity, y: shellY }}
        className={cn(
          "coretta-glass-nav relative flex w-full max-w-4xl items-center justify-between gap-3 rounded-full px-4 py-2.5 md:px-5 md:py-3",
        )}
        aria-label="Main navigation"
      >
        <motion.div whileHover={{ scale: 1.02 }} transition={{ type: "spring", stiffness: 400 }}>
          <Logo />
        </motion.div>

        <ul className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-5 lg:gap-7 md:flex">
          {NAV.map((item, i) => (
            <motion.li
              key={item.href}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.08, ...springSnappy }}
            >
              <NavLink href={item.href} label={item.label} />
            </motion.li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--ar-border)] text-[var(--ar-fg)] md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 8h16M4 16h16" />}
            </svg>
          </button>
        </div>

        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={springSnappy}
            className="absolute left-3 right-3 top-[calc(100%+0.5rem)] rounded-2xl border border-[var(--ar-border)] bg-[var(--ar-bg-elevated)] p-4 shadow-xl backdrop-blur-xl md:hidden"
          >
            <ul className="flex flex-col gap-4">
              {NAV.map((item) => (
                <li key={item.href}>
                  <NavLink
                    href={item.href}
                    label={item.label}
                    onClick={() => setOpen(false)}
                  />
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </motion.nav>
    </header>
  );
}
