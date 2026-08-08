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
            {BRAND_NAME} is a gasless USDC remittance product on Arc Testnet. Your
            savings stay dollar-anchored while {AGENT_NAME} routes transfers with
            sponsored gas and smart-wallet security.
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
              Transfers that settle
            </h3>
            <p className="mt-3 max-w-xs text-base text-black/70">
              Send USDC with locked previews, ownership signatures, and Circle
              Paymaster sponsorship on Arc Testnet.
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
              Always fluid,
              <br />
              always pegged.
            </h3>
            <p className="text-base text-white/60">
              Stay dollar-anchored with on-demand access to funds, no claim links
              or seed phrases for end users.
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
              Fully
              <br />
              automated
            </h3>
            <p className="text-base text-white/60">
              Skip chain complexity. {AGENT_NAME} prepares the transfer; you only
              confirm and sign.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
