"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AGENT_NAME, BRAND_NAME } from "@/lib/brand";
import { useI18n } from "@/lib/i18n/context";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onComplete: (name: string) => void;
}

export default function OnboardingFlow({ open, onComplete }: Props) {
  const { t } = useI18n();
  const { setPreferredName } = useProfile();
  const [name, setName] = useState("");

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 1) return;
    setPreferredName(trimmed);
    onComplete(trimmed);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] flex items-center justify-center bg-[var(--ar-overlay)] p-4 backdrop-blur-md"
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md rounded-2xl border border-[var(--ar-border)] bg-[var(--ar-surface)] p-6 shadow-[0_0_48px_rgba(124,77,255,0.12)]"
        >
          <p className="text-xs font-medium uppercase tracking-widest text-violet-400/80">
            {AGENT_NAME}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">{t("welcome")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/65">{t("askName")}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex"
              autoFocus
              maxLength={40}
              className="w-full rounded-xl border border-[var(--ar-border)] bg-[var(--ar-bg-elevated)] px-4 py-3 text-sm text-white outline-none transition focus:border-[#7C4DFF]/60 focus:shadow-[0_0_0_3px_rgba(124,77,255,0.15)]"
            />
            <Button type="submit" variant="primary" className="w-full" disabled={!name.trim()}>
              Continue
            </Button>
          </form>

          <p className="mt-4 text-center text-[11px] text-white/35">
            Conversational identity only — not legal or KYC name. {BRAND_NAME} keeps this private.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
