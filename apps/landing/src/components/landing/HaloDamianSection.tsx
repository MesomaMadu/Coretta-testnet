"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AGENT_NAME, BRAND_NAME } from "@/lib/brand";

/**
 * Short Damian introduction for the landing page.
 */
export default function HaloDamianSection() {
  return (
    <section id="damian" className="bg-[#F5F5F5] px-6 py-20">
      <div className="mx-auto max-w-[88rem]">
        <div className="grid grid-cols-1 items-center gap-10 rounded-3xl border border-black/10 bg-white p-8 md:grid-cols-2 md:p-12">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-black/45">
              Meet {AGENT_NAME}
            </p>
            <h2
              className="mt-3 text-4xl font-medium leading-tight text-black md:text-5xl"
              style={{ letterSpacing: "-0.03em" }}
            >
              Your remittance copilot
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-black/65">
              Ask {AGENT_NAME} to send, swap, bridge, split a batch, check balances,
              find transactions, explain routes, or retry a recorded failure.
            </p>
            <p className="mt-4 max-w-md text-base leading-relaxed text-black/65">
              Nothing moves until you approve the locked preview. {BRAND_NAME} asks for
              wallet authorization when your account requires it.
            </p>
            <Link
              href="/app"
              className="mt-8 inline-flex items-center gap-3 rounded-full bg-black py-2 pl-8 pr-2 text-base font-medium text-white transition-colors duration-200 hover:bg-gray-800"
            >
              Chat with {AGENT_NAME}
              <span className="rounded-full bg-white p-2">
                <ArrowRight className="h-5 w-5 text-black" />
              </span>
            </Link>
          </div>
          <div className="rounded-2xl border border-black/10 bg-[#F5F5F5] p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-black/45">
              How {AGENT_NAME} works
            </p>
            <ul className="mt-4 space-y-4 text-sm text-black/70">
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-[11px] font-semibold text-white">
                  1
                </span>
                <span>Say who to pay, how much, and which asset you want to use.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-[11px] font-semibold text-white">
                  2
                </span>
                <span>{AGENT_NAME} builds a locked preview with amount, recipient, and route.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-[11px] font-semibold text-white">
                  3
                </span>
                <span>You approve the plan. Wallet authorization appears when your account requires it.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
