"use client";

import { motion } from "framer-motion";
import { Fingerprint, Key, Wallet } from "lucide-react";
import SectionShell from "@/components/shared/SectionShell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CARDS: Array<{
  icon: typeof Fingerprint;
  title: string;
  desc: string;
  recommended?: boolean;
}> = [
  {
    icon: Fingerprint,
    title: "Identity system",
    desc: "Email, phone, and social auth map directly to smart wallets. One identity — one wallet.",
  },
  {
    icon: Wallet,
    title: "Wallet creation",
    desc: "Create on first interaction. No pre-provisioning waste — wallets exist when money moves.",
    recommended: true,
  },
  {
    icon: Key,
    title: "Custody model",
    desc: "Custodial-lite onboarding with easier recovery. Blockchain complexity stays completely hidden.",
  },
];

export default function DesignDecisions() {
  return (
    <SectionShell
      eyebrow="Design decisions"
      title="How we hide complexity"
      subtitle="Architectural choices that prioritize real users over crypto natives."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {CARDS.map((c, i) => {
          const Icon = c.icon;
          return (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className={c.recommended ? "border-cyan-400/30" : ""}>
                <CardHeader>
                  {c.recommended && (
                    <span className="mb-2 inline-block rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-300">
                      Recommended
                    </span>
                  )}
                  <Icon className="mb-2 h-6 w-6 text-violet-400" />
                  <CardTitle className="text-base">{c.title}</CardTitle>
                  <CardDescription>{c.desc}</CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </SectionShell>
  );
}
