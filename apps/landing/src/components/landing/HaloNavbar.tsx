"use client";

import Link from "next/link";
import CRLogo from "@/components/shared/CRLogo";
import { BRAND_NAME } from "@/lib/brand";

const LINKS = [
  { label: "Product", href: "/#product" },
  { label: "Damian", href: "/#damian" },
  { label: "Network", href: "/#network" },
  { label: "How", href: "/#how" },
  { label: "Security", href: "/#security" },
] as const;

/** Landing nav with black Coretta CR monogram */
export default function HaloNavbar() {
  return (
    <nav
      className="absolute left-0 right-0 top-0 z-20 px-6 py-5"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-[88rem] items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND_NAME} home`}>
          <CRLogo size="lg" showGlow={false} />
          <span className="text-2xl font-bold tracking-tight text-black">
            {BRAND_NAME}
          </span>
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-base font-medium text-gray-700 transition-colors duration-200 hover:text-black"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <Link
          href="/app"
          className="rounded-full bg-black px-7 py-2.5 text-base font-medium text-white transition-colors duration-200 hover:bg-gray-800"
        >
          Open App
        </Link>
      </div>
    </nav>
  );
}
