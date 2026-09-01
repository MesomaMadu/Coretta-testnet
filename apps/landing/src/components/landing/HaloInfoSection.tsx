"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AGENT_NAME, BRAND_NAME } from "@/lib/brand";

const CARD_IMG =
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260423_164207_f243351d-ed59-48ec-83a0-a5e996bdbe3c.png&w=1280&q=85";

export default function HaloInfoSection() {
  return (
    <section id="product" className="bg-[#F5F5F5] px-6 py-24">
      <div className="mx-auto max-w-[88rem]">
        <div className="mb-16 grid grid-cols-1 items-start gap-12 md:grid-cols-2">
          <div>
            <h2
              className="mb-8 text-4xl font-medium leading-tight text-black md:text-5xl"
              style={{ letterSpacing: "-0.03em" }}
            >
              Meet {BRAND_NAME}.
            </h2>
            <Link
              href="/app"
              className="inline-flex items-center gap-3 rounded-full bg-black py-2 pl-8 pr-2 text-base font-medium text-white transition-colors duration-200 hover:bg-gray-800"
            >
              Discover
              <span className="rounded-full bg-white p-2">
                <ArrowRight className="h-5 w-5 text-black" />
              </span>
            </Link>
          </div>
          <p className="text-2xl leading-relaxed text-black/70 md:text-3xl">
            Your balances stay onchain in the wallet tied to your account. {AGENT_NAME}
            prepares sends, swaps, USDC bridges, and batch payments while {BRAND_NAME}
            records approvals, status, and receipts.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article
            className="min-h-80 rounded-2xl p-7 lg:col-span-2"
            style={{
              backgroundImage: `url(${CARD_IMG})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <h3
              className="text-2xl font-medium leading-snug text-black"
              style={{ letterSpacing: "-0.02em" }}
            >
              Send and swap on Arc
            </h3>
            <p className="mt-3 max-w-xs text-base text-black/70">
              Send USDC or EURC and swap between them after reviewing a locked preview.
            </p>
          </article>

          <article
            className="flex min-h-80 flex-col justify-between rounded-2xl p-7"
            style={{ backgroundColor: "#2B2644" }}
          >
            <h3
              className="text-2xl font-medium leading-snug text-white"
              style={{ letterSpacing: "-0.02em" }}
            >
              Bridge USDC
              <br />
              with CCTP
            </h3>
            <p className="text-base text-white/60">
              Move USDC from Arc Testnet to supported EVM testnets with Circle CCTP.
            </p>
          </article>

          <article
            className="flex min-h-80 flex-col justify-between rounded-2xl p-7"
            style={{ backgroundColor: "#2B2644" }}
          >
            <h3
              className="text-2xl font-medium leading-snug text-white"
              style={{ letterSpacing: "-0.02em" }}
            >
              Pay up
              <br />
              to 20 wallets
            </h3>
            <p className="text-base text-white/60">
              Split equal, varied, or fixed amounts across as many as 20 wallets and chains.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
