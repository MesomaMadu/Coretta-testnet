"use client";

import Link from "next/link";
import CRLogo from "@/components/shared/CRLogo";
import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  href?: string;
}

export default function Logo({ className, href = "/" }: LogoProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400/70",
        className,
      )}
      aria-label={`${BRAND_NAME} home`}
    >
      <span className="relative">
        <CRLogo size="md" />
        <span
          className="pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:shadow-[0_0_20px_rgba(123,97,255,0.35)]"
          aria-hidden
        />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-[var(--ar-fg)]">
        {BRAND_NAME}
      </span>
    </Link>
  );
}
