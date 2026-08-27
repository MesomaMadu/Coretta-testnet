"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import {
  getAccessToken,
  useLinkEmail,
  useLoginWithEmail,
  usePrivy,
} from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch, getApiToken, setApiToken } from "@/lib/api";

interface PanelProps {
  onCancel?: () => void;
  onSuccess?: (email: string) => void;
}

const RESEND_COOLDOWN = 30;

async function waitForPrivyAccessToken() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const token = await getAccessToken();
    if (token) return token;
    await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
  }
  return null;
}

function exchangeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "EMAIL_ALREADY_LINKED":
        return "This email already belongs to another Coretta account.";
      case "CORETTA_WALLET_SESSION_REQUIRED":
        return "Your wallet session expired. Verify the connected wallet, then link the email again.";
      case "PRIVY_EMAIL_REQUIRED":
        return "Privy did not return a verified email for this account.";
      case "DATABASE_UNAVAILABLE":
        return "Coretta could not reach its account database. Please retry in a moment.";
      case "WALLET_PROVISIONING_FAILED":
        return "Email was verified, but the smart wallet could not be prepared. Please retry.";
      case "PRIVY_NOT_CONFIGURED":
        return "Privy is not configured on the Coretta API yet.";
      case "PRIVY_AUTH_FAILED":
        return "Privy could not verify this login session. Request a new code and try again.";
      default:
        return error.message || "Coretta could not finish email authentication.";
    }
  }
  if (error instanceof Error && /Failed to fetch|NetworkError|ECONNREFUSED/i.test(error.message)) {
    return "Coretta API is unreachable. Please try again shortly.";
  }
  return "Coretta could not finish email authentication. Please try again.";
}

function privyOtpErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/maximum|max attempts|too many|attempt limit/i.test(message)) {
    return "This code has reached Privy's five-attempt limit. Request a new code.";
  }
  if (/failed to fetch|network|timeout|connection/i.test(message)) {
    return "Privy could not be reached. Check your connection and try the code again.";
  }
  if (/expired|invalid|incorrect|otp|one-time/i.test(message)) {
    return "That code is invalid or expired. Request a new code and use the latest email.";
  }
  if (/already.*linked|account.*linked/i.test(message)) {
    return "This email is already linked to a Privy account.";
  }
  return "Privy could not verify this code. Request a new code and try again.";
}

export function EmailAuthPanel({ onCancel, onSuccess }: PanelProps) {
  const { isConnected } = useAccount();
  const {
    ready: privyReady,
    authenticated: privyAuthenticated,
    user: privyUser,
  } = usePrivy();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [privyVerified, setPrivyVerified] = useState(false);
  const { sendCode: sendLoginCode, loginWithCode } = useLoginWithEmail();
  const { sendCode: sendLinkCode, linkWithCode } = useLinkEmail();
  const linkToPrivyUser =
    privyReady && privyAuthenticated && !privyUser?.email?.address;
  const linkingEmail = isConnected || linkToPrivyUser;

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(
      () => setResendIn((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [resendIn]);

  const reset = () => {
    setStep("email");
    setOtp("");
    setEmail("");
    setError(null);
    setAttempts(0);
    setPrivyVerified(false);
  };

  const sendCode = async () => {
    if (!privyReady) {
      setError("Privy is still loading. Please try again in a moment.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (linkToPrivyUser) {
        await sendLinkCode({ email: normalizedEmail });
      } else {
        await sendLoginCode({ email: normalizedEmail });
      }
      setEmail(normalizedEmail);
      setOtp("");
      setStep("otp");
      setResendIn(RESEND_COOLDOWN);
      setAttempts(0);
      setPrivyVerified(false);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "";
      if (/429|RESEND_COOLDOWN/i.test(message)) {
        setError("Please wait before requesting another code.");
      } else if (/origin|domain/i.test(message)) {
        setError("This site is not in the Privy app's allowed domains.");
      } else {
        setError("Could not send a verification code. Check the email and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    await sendCode();
  };

  const handleOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (otp.length !== 6) {
      setError("Enter the six-digit code from the latest Privy email.");
      return;
    }
    if (!privyVerified && attempts >= 5) {
      setError("Too many incorrect codes. Request a new code.");
      return;
    }

    setLoading(true);
    setError(null);

    if (!privyVerified) {
      try {
        if (linkToPrivyUser) {
          await linkWithCode({ code: otp });
        } else {
          await loginWithCode({ code: otp });
        }
        setPrivyVerified(true);
      } catch (verifyError) {
        const message = verifyError instanceof Error ? verifyError.message : String(verifyError);
        if (/expired|invalid|incorrect|maximum|max attempts|attempt limit/i.test(message)) {
          setAttempts((count) => count + 1);
        }
        setError(privyOtpErrorMessage(verifyError));
        setLoading(false);
        return;
      }
    }

    try {
      const privyToken = await waitForPrivyAccessToken();
      if (!privyToken) {
        throw new ApiError(401, "PRIVY_AUTH_FAILED", "Privy access token was not ready.");
      }

      const corettaToken = getApiToken();
      if (isConnected && !corettaToken) {
        throw new ApiError(
          401,
          "CORETTA_WALLET_SESSION_REQUIRED",
          "A verified wallet session is required to link email.",
        );
      }

      const response = await apiFetch<{
        token: string;
        email: string;
        expiresAt: string;
        user: { id: string; walletAddress?: string | null };
      }>("/v1/auth/privy", {
        method: "POST",
        auth: false,
        headers: {
          Authorization: `Bearer ${privyToken}`,
          ...(corettaToken ? { "X-Coretta-Session": corettaToken } : {}),
        },
        body: JSON.stringify({ linkToWallet: isConnected }),
      });

      setApiToken(response.token);
      onSuccess?.(response.email);
      reset();
    } catch (exchangeError) {
      setError(exchangeErrorMessage(exchangeError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-2 text-base font-semibold text-black">
          <Mail className="h-4 w-4" />
          {linkingEmail ? "Link email to this account" : "Log in or sign up with email"}
        </div>
        <p className="text-xs leading-relaxed text-black/50">
          {linkingEmail
            ? "Privy verifies the email, then Coretta links it to your signed-in account."
            : "Use a secure one-time code to create or restore your Coretta smart wallet."}
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      {step === "email" ? (
        <form onSubmit={handleEmail} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-black/70">Email address</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-black/10 bg-[#F5F5F5] px-4 py-2.5 text-black outline-none focus:border-black/50"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>
          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Continue with email"}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
              Back to wallet options
            </Button>
          )}
        </form>
      ) : (
        <form onSubmit={handleOtp} className="space-y-4">
          <p className="text-sm text-black/60">
            Enter the verification code sent to <span className="font-medium text-black">{email}</span>
          </p>
          <input
            type="text"
            inputMode="numeric"
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full rounded-xl border border-black/10 bg-[#F5F5F5] px-4 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-black"
            placeholder="••••••"
            maxLength={6}
            autoComplete="one-time-code"
          />
          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading
              ? "Verifying…"
              : privyVerified
                ? "Retry Coretta sign-in"
                : linkingEmail
                  ? "Verify and link email"
                  : "Verify and continue"}
          </Button>
          <button
            type="button"
            disabled={resendIn > 0 || loading}
            onClick={() => void sendCode()}
            className="w-full text-xs text-black/45 hover:text-black disabled:opacity-40"
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setStep("email");
              setOtp("");
              setError(null);
              setPrivyVerified(false);
            }}
            className="w-full text-xs text-black/45 hover:text-black disabled:opacity-40"
          >
            Use a different email
          </button>
        </form>
      )}
    </div>
  );
}
