"use client";

import { useEffect, useState } from "react";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, setApiToken } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: (email: string) => void;
}

const RESEND_COOLDOWN = 30;

export default function EmailAuthModal({ open, onClose, onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [resendIn]);

  if (!open) return null;

  const sendCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; devCode?: string }>("/v1/auth/otp/send", {
        method: "POST",
        body: JSON.stringify({ email }),
        auth: false,
      });
      setStep("otp");
      if (res.devCode) {
        setOtp(res.devCode);
      }
      setResendIn(RESEND_COOLDOWN);
      setAttempts(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not send code";
      if (msg.includes("429") || msg.includes("RESEND_COOLDOWN")) {
        setError("Please wait before requesting another code.");
      } else if (msg.includes("503") || msg.includes("EMAIL_PROVIDER")) {
        setError("Email delivery is not configured yet. Contact support or try wallet sign-in.");
      } else {
        setError("Could not send verification code. Check your email and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!valid) {
      setError("Enter a valid email address.");
      return;
    }
    await sendCode();
  };

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) return;
    if (attempts >= 5) {
      setError("Too many attempts. Request a new code.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        token: string;
        expiresAt: string;
        user: { id: string; walletAddress?: string | null };
      }>("/v1/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ email, code: otp }),
        auth: false,
      });
      setApiToken(res.token);
      onSuccess?.(email);
      onClose();
      setStep("email");
      setOtp("");
      setEmail("");
    } catch {
      setAttempts((a) => a + 1);
      setError("Invalid or expired code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-black">Sign in with email</h2>
          <button type="button" onClick={onClose} className="text-black/40 hover:text-black">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        {step === "email" ? (
          <form onSubmit={handleEmail} className="space-y-4">
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-sm text-black/70">
                <Mail className="h-4 w-4" /> Enter your email address
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-[#F5F5F5] px-4 py-2.5 text-black outline-none focus:border-[#0A0A0A]/50"
                placeholder="you@example.com"
                required
              />
            </label>
            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Continue"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleOtp} className="space-y-4">
            <p className="text-sm text-black/60">
              Enter the verification code sent to{" "}
              <span className="text-black font-medium">{email}</span>
            </p>
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-xl border border-black/10 bg-[#F5F5F5] px-4 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-black"
              placeholder="••••••"
              maxLength={6}
              autoComplete="one-time-code"
            />
            <p className="text-center text-[10px] text-black/40">Code expires in 5 minutes</p>
            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading ? "Verifying…" : "Verify"}
            </Button>
            <button
              type="button"
              disabled={resendIn > 0 || loading}
              onClick={() => void sendCode()}
              className="w-full text-xs text-black/45 hover:text-black disabled:opacity-40"
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
