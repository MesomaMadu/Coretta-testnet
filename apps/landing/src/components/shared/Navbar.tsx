"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useState } from "react";
import Logo from "./Logo";
import ActiveUsersBadge from "./ActiveUsersBadge";
import { Button } from "@/components/ui/button";

const NAV = [
  { label: "Demo", href: "/#demo" },
  { label: "Why", href: "/#why" },
  { label: "Security", href: "/#security" },
] as const;

export default function Navbar() {
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 120], [0.9, 1]);
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-5 md:px-8">
      <motion.nav
        style={{ opacity }}
        className="coretta-glass-nav relative flex w-full max-w-5xl items-center justify-between gap-3 rounded-full px-4 py-2.5 md:px-5 md:py-3"
        aria-label="Main"
      >
        <Logo />

        <ul className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 md:flex">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-sm font-medium text-[var(--ar-fg-muted)] transition-colors hover:text-[var(--ar-fg)]"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <ActiveUsersBadge />
          <Button variant="primary" size="sm" className="hidden sm:inline-flex" asChild>
            <Link href="/app">Launch App</Link>
          </Button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--ar-border)] text-[var(--ar-fg)] md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 8h16M4 16h16" />}
            </svg>
          </button>
        </div>

        {open && (
          <div className="absolute left-3 right-3 top-full mt-2 rounded-2xl border border-[var(--ar-border)] bg-[var(--ar-bg-elevated)] p-4 backdrop-blur-xl md:hidden">
            <ul className="flex flex-col gap-3">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-[var(--ar-fg-muted)]" onClick={() => setOpen(false)}>
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Button variant="primary" className="w-full" asChild>
                  <Link href="/app">Launch App</Link>
                </Button>
              </li>
            </ul>
          </div>
        )}
      </motion.nav>
    </header>
  );
}
