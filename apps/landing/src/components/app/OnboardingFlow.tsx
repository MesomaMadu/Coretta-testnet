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
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-2xl"
        >
          <p className="text-xs font-medium uppercase tracking-widest text-[#0A0A0A]">
            {AGENT_NAME}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-black">{t("welcome")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-black/60">{t("askName")}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex"
              autoFocus
              maxLength={40}
              className="w-full rounded-xl border border-black/10 bg-[#F5F5F5] px-4 py-3 text-sm text-black outline-none transition focus:border-black/30 focus:shadow-[0_0_0_3px_rgba(10,10,10,0.08)]"
            />
            <Button type="submit" variant="primary" className="w-full" disabled={!name.trim()}>
              Continue
            </Button>
          </form>

          <p className="mt-4 text-center text-[11px] text-black/40">
            Conversational identity only, not legal or KYC name. {BRAND_NAME} keeps this private.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
