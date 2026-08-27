"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Check } from "lucide-react";
import SectionShell from "@/components/shared/SectionShell";
import { cn } from "@/lib/utils";

const THREATS = [
  {
    id: "paymaster",
    threat: "Paymaster and fee abuse",
    attack: "Bots spam UserOperations to consume account fee budgets.",
    defense: ["Per-transfer caps ($100)", "Daily velocity limits", "USDC-only calldata allowlists"],
  },
  {
    id: "uop",
    threat: "Failed UserOperations",
    attack: "Bad calldata or bundler congestion blocks settlement.",
    defense: ["Pre-flight simulation", "Bundler failover", "Automatic retry with fee bump"],
  },
  {
    id: "wallet",
    threat: "Wallet fragmentation",
    attack: "Multiple wallets per identity confuse balances.",
    defense: ["Deterministic wallet mapping", "Single wallet per identity", "SCD identity history"],
  },
  {
    id: "links",
    threat: "Link scams & claim interception",
    attack: "Public claim URLs get phished or front-run.",
    defense: ["No claim-based UX", "Identity-bound delivery", "Direct-to-wallet only"],
  },
  {
    id: "treasury",
    threat: "Treasury depletion",
    attack: "Network-fee spend exceeds the configured budget.",
    defense: ["Treasury monitoring", "Auto-pause on anomaly", "Refill playbooks"],
  },
] as const;

export default function SecurityPitfalls() {
  const [active, setActive] = useState(0);
  const item = THREATS[active];

  return (
    <SectionShell
      id="security-deep"
      eyebrow="Security depth"
      title="Threats we design against"
      subtitle="Every risk has a visible mitigation — because trust is earned."
    >
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="flex flex-col gap-1">
          {THREATS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "rounded-lg px-3 py-2 text-left text-sm transition-colors",
                active === i ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70",
              )}
            >
              {t.threat.split(" ")[0]}…
            </button>
          ))}
        </div>

        <motion.div
          key={item.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8"
        >
          <div className="flex items-start gap-3 text-amber-400/90">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <h3 className="font-semibold text-white">{item.threat}</h3>
              <p className="mt-1 text-sm text-white/50">{item.attack}</p>
            </div>
          </div>
          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="mb-4 text-xs uppercase tracking-wider text-emerald-400/80">Protections</p>
            <ul className="space-y-2">
              {item.defense.map((d) => (
                <li key={d} className="flex items-center gap-2 text-sm text-white/70">
                  <Check className="h-4 w-4 text-emerald-400" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </div>
    </SectionShell>
  );
}
