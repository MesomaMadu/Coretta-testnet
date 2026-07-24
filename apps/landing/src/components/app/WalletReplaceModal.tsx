"use client";

import { useEffect, useState } from "react";
import { X, Mail, Wallet, Shield } from "lucide-react";
import { useAccount, useSignMessage } from "wagmi";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useProfile } from "@/hooks/useProfile";
import { arcTestnet } from "@/lib/chains";
import {
  buildOwnershipMessage,
  buildRebindMessage,
  clearWalletSession,
  setBoundWallet,
  setSmartWalletActive,
  setWalletVerified,
} from "@/lib/wallet-session";

interface Props {
  open: boolean;
  onClose: () => void;
  onConnectWallet: () => void;
  onComplete: () => void;
  currentAddress?: string;
}

type Step = "intro" | "otp" | "connect" | "sign" | "done";

export default function WalletReplaceModal({
  open,
  onClose,
  onConnectWallet,
  onComplete,
  currentAddress,
}: Props) {
  const { profile } = useProfile();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [step, setStep] = useState<Step>("intro");
  const [otp, setOtp] = useState("");
  const [rebindToken, setRebindToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (!open) {
      setStep("intro");
      setOtp("");
      setRebindToken(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [resendIn]);

  if (!open) return null;

  const sendOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/v1/wallet/rebind/send-otp", { method: "POST", body: "{}" });
      setStep("otp");
      setResendIn(30);
    } catch {
      setError("Could not send verification code. Ensure email is linked and configured.");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length < 6) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ rebindToken: string }>("/v1/wallet/rebind/verify-otp", {
        method: "POST",
        body: JSON.stringify({ code: otp }),
      });
      setRebindToken(res.rebindToken);
      setStep("connect");
    } catch {
      setError("Invalid or expired code.");
    } finally {
      setLoading(false);
    }
  };

  const completeRebind = async () => {
    if (!address || !rebindToken) return;
    setLoading(true);
    setError(null);
    try {
      const email = profile.linkedEmail ?? "";
      await signMessageAsync({
        message: buildRebindMessage({
          address,
          email,
          chainId: arcTestnet.id,
        }),
      });
      await signMessageAsync({
        message: buildOwnershipMessage(address, arcTestnet.id),
      });

      const res = await apiFetch<{
        boundPrimaryWallet?: string;
        revokedWalletAddress?: string;
      }>("/v1/wallet/rebind/complete", {
        method: "POST",
        body: JSON.stringify({
          rebindToken,
          newWalletAddress: address,
          previousWalletAddress: currentAddress,
        }),
      });

      clearWalletSession();
      setWalletVerified(address);
      setSmartWalletActive(true);
      if (res.boundPrimaryWallet) setBoundWallet(res.boundPrimaryWallet);
      setStep("done");
      onComplete();
    } catch {
      setError("Wallet replacement failed. Approve both signature requests and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f172a]/95 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Replace wallet</h2>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        )}

        {step === "intro" && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">
              Verify your email, connect a new wallet, and sign to bind it. Your previous wallet
              will immediately lose privileged access.
            </p>
            {!profile.linkedEmail ? (
              <p className="text-xs text-amber-200">Link and verify an email in Settings first.</p>
            ) : (
              <Button variant="primary" className="w-full" onClick={() => void sendOtp()} disabled={loading}>
                <Mail className="mr-2 h-4 w-4" />
                Verify email to continue
              </Button>
            )}
          </div>
        )}

        {step === "otp" && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">
              Enter the code sent to <span className="text-white">{profile.linkedEmail}</span>
            </p>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-white"
              placeholder="••••••"
              maxLength={6}
            />
            <Button variant="primary" className="w-full" onClick={() => void verifyOtp()} disabled={loading}>
              Verify code
            </Button>
            <button
              type="button"
              disabled={resendIn > 0 || loading}
              onClick={() => void sendOtp()}
              className="w-full text-xs text-white/45 hover:text-white disabled:opacity-40"
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </button>
          </div>
        )}

        {step === "connect" && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">Connect your new wallet, then continue.</p>
            {!isConnected ? (
              <Button variant="primary" className="w-full" onClick={onConnectWallet}>
                <Wallet className="mr-2 h-4 w-4" />
                Connect new wallet
              </Button>
            ) : (
              <>
                <p className="font-mono text-xs text-[#8F5CFF]">
                  {address?.slice(0, 8)}…{address?.slice(-6)}
                </p>
                <Button variant="primary" className="w-full" onClick={() => setStep("sign")}>
                  Continue to signing
                </Button>
              </>
            )}
          </div>
        )}

        {step === "sign" && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">
              Approve two signature requests in your wallet to complete rebinding.
            </p>
            <Button variant="primary" className="w-full" onClick={() => void completeRebind()} disabled={loading}>
              <Shield className="mr-2 h-4 w-4" />
              {loading ? "Replacing…" : "Sign & replace wallet"}
            </Button>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-[#8F5CFF]">Wallet replaced successfully.</p>
            <Button variant="glass" className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
