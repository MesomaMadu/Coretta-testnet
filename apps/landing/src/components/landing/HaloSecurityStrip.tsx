"use client";

import { AGENT_NAME, BRAND_NAME } from "@/lib/brand";

export default function HaloSecurityStrip() {
  return (
    <section id="security" className="bg-[#F5F5F5] px-6 py-20">
      <div className="mx-auto max-w-[88rem]">
        <div
          id="network"
          className="rounded-3xl px-8 py-12 md:px-12"
          style={{ backgroundColor: "#2B2644" }}
        >
          <p className="text-sm font-medium text-white/50">Network & security</p>
          <h2
            className="mt-3 max-w-2xl text-3xl font-medium leading-tight text-white md:text-4xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Arc Testnet settlement. You always sign.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/60">
            {BRAND_NAME} binds a smart wallet to your connected EOA. {AGENT_NAME}{" "}
            only prepares locked previews. Remittance and swaps execute after your
            wallet approval, with Circle Paymaster sponsorship.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              "Ownership signature",
              "Smart wallet binding",
              "Sponsored gas",
              "Success or failure only",
            ].map((item) => (
              <li
                key={item}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/80"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
