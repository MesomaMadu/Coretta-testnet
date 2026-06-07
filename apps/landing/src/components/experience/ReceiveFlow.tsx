"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import SectionShell from "@/components/shared/SectionShell";
import { cn } from "@/lib/utils";
import { UserCheck, UserPlus } from "lucide-react";

export default function ReceiveFlow() {
  const [tab, setTab] = useState<"existing" | "new">("existing");

  return (
    <SectionShell
      id="receive"
      eyebrow="Receiving funds"
      title="No claim links. Ever."
      subtitle="Funds land in the recipient's smart wallet — whether they're new or not."
    >
      <div className="mb-8 flex justify-center gap-2">
        {(["existing", "new"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-medium transition-all",
              tab === t ? "bg-white/15 text-white" : "text-white/45 hover:text-white/70",
            )}
          >
            {t === "existing" ? "Existing user" : "New user"}
          </button>
        ))}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-8 md:grid-cols-2 md:items-center"
      >
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          {tab === "existing" ? (
            <>
              <UserCheck className="mb-4 h-8 w-8 text-emerald-400" />
              <h3 className="text-lg font-semibold text-white">Direct delivery</h3>
              <p className="mt-2 text-sm text-white/50">
                USDC goes straight to their wallet. Balance updates instantly — no action required.
              </p>
            </>
          ) : (
            <>
              <UserPlus className="mb-4 h-8 w-8 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">Wallet created on the fly</h3>
              <p className="mt-2 text-sm text-white/50">
                We provision a smart wallet and assign funds immediately. They log in later — money is already there.
              </p>
              <p className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                No claim transaction required.
              </p>
            </>
          )}
        </div>

        <div className="relative flex h-56 items-center justify-center rounded-2xl border border-white/10 bg-black/40">
          {tab === "existing" ? (
            <motion.div
              className="text-center"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <p className="text-sm text-white/40">Balance</p>
              <p className="text-3xl font-bold text-emerald-400">$124.00</p>
              <motion.p
                className="mt-2 text-sm text-cyan-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                +$25.00 just now
              </motion.p>
            </motion.div>
          ) : (
            <>
              <motion.div
                className="absolute flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-cyan-400/50"
                initial={{ opacity: 0.3, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1, borderStyle: "solid" }}
                transition={{ duration: 1.2 }}
              >
                <span className="text-xs text-cyan-300">New wallet</span>
              </motion.div>
              <motion.div
                className="absolute text-2xl font-bold text-emerald-400"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
              >
                $25.00
              </motion.div>
            </>
          )}
        </div>
      </motion.div>
    </SectionShell>
  );
}
