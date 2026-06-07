"use client";

import { useState } from "react";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, setApiToken } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: (email: string) => void;
}

export default function EmailAuthModal({ open, onClose, onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setStep("otp");
    setError(null);
  };

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 4) return;
    setLoading(true);
    setError(null);
    try {
      // NOTE: This is a dev-friendly login. Production should use real OTP via Privy/Clerk/Dynamic.
      const res = await apiFetch<{
        token: string;
        expiresAt: string;
        user: { id: string; walletAddress?: string | null };
      }>("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ type: "email", value: email }),
        auth: false,
      });
      setApiToken(res.token);
      onSuccess?.(email);
      onClose();
      setStep("email");
      setOtp("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f172a]/95 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Sign in with email</h2>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-xs text-white/45">
          Email sign-in enables persistent memory & feedback. Production should use real OTP.
        </p>

        {error && (
          <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        )}

        {step === "email" ? (
          <form onSubmit={handleEmail} className="space-y-4">
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-sm text-white/70">
                <Mail className="h-4 w-4" /> Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-cyan-400/50"
                placeholder="you@example.com"
                required
              />
            </label>
            <Button type="submit" variant="primary" className="w-full">
              Send code
            </Button>
          </form>
        ) : (
          <form onSubmit={handleOtp} className="space-y-4">
            <p className="text-sm text-white/60">Code sent to {email}</p>
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-center font-mono text-lg tracking-widest text-white"
              placeholder="000000"
              maxLength={6}
            />
            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Verify & Sign in"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
