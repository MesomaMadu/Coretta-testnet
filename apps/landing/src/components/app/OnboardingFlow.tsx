"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAccessToken, useLoginWithEmail, useLoginWithOAuth, usePrivy } from "@privy-io/react-auth";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { arcTestnet } from "@/lib/chains";
import { ApiError, apiFetch, getApiToken, setApiToken } from "@/lib/api";
import { buildOwnershipMessage } from "@/lib/wallet-session";
import { useWalletSession } from "@/hooks/useWalletSession";
import { useEip6963 } from "@/hooks/useEip6963";
import Logo from "@/components/shared/Logo";
import WalletLogo from "./WalletLogo";
import styles from "./OnboardingFlow.module.css";

type View =
  | "home"
  | "walletConnect"
  | "walletCheck"
  | "walletNone"
  | "walletSignature"
  | "emailEntry"
  | "emailSignInCode"
  | "emailCheck"
  | "emailNone"
  | "creating"
  | "success"
  | "linkEmail"
  | "linkWallet";
type Path = "wallet" | "email" | null;
type AccountKind = "new" | "returning" | null;
type EmailPurpose = "signin" | "link";
type PrivyMethod = "email" | "google";

interface Props {
  open: boolean;
  onComplete: () => void;
  onEmailLinked?: (email: string) => void;
}

interface PrivyStatusResponse {
  email: string;
  existing: boolean;
  smartWalletAddress: string | null;
}

interface PrivyExchangeResponse {
  token: string;
  email: string;
  smartWalletAddress: string | null;
  user: { id: string; walletAddress?: string | null };
}

const RESEND_COOLDOWN = 30;

const VIEW_META: Record<View, { title: string; copy: string; note: string }> = {
  home: {
    title: "Choose an onboarding path",
    copy: "Choose wallet, email, or Google sign-in. Coretta securely detects whether this is a new or returning account.",
    note: "Account status comes from Coretta after authentication. No demo switch or simulated account result is used.",
  },
  walletConnect: {
    title: "Connect a wallet",
    copy: "Choose a browser or mobile wallet. Coretta receives its public address before requesting proof of ownership.",
    note: "Connecting does not send a transaction or give Coretta access to the wallet's private key.",
  },
  walletCheck: {
    title: "Looking for a Coretta wallet",
    copy: "Coretta checks the connected address, then verifies ownership before restoring an existing session.",
    note: "The ownership signature is free and is valid only for the Coretta sign-in message on Arc Testnet.",
  },
  walletNone: {
    title: "Offer managed smart wallet creation",
    copy: "A new user reviews the custody model before Coretta provisions a Circle developer-controlled wallet.",
    note: "Coretta manages this wallet on the user's behalf. The connected wallet remains self-custodied.",
  },
  walletSignature: {
    title: "Require a signature",
    copy: "A signed message proves ownership of the connected wallet before the Coretta account is created.",
    note: "This is not an onchain transaction and it does not move funds or spend USDC.",
  },
  emailEntry: {
    title: "Start with Privy email",
    copy: "The user enters an email address and receives a real one-time passcode from Privy.",
    note: "Privy OTP must be enabled and localhost must be listed as an allowed domain in the Privy dashboard.",
  },
  emailSignInCode: {
    title: "Verify the Privy OTP",
    copy: "The one-time code verifies the email before Coretta checks for an existing smart wallet.",
    note: "Privy permits up to five attempts for one OTP. Requesting a new code invalidates the previous one.",
  },
  emailCheck: {
    title: "Checking your account",
    copy: "Coretta verifies the Privy session and looks for a wallet already attached to the email.",
    note: "This check is read-only. New users approve provisioning on the next screen.",
  },
  emailNone: {
    title: "Create a Coretta account",
    copy: "The verified email is new, so the user can approve creation of a managed Circle smart wallet.",
    note: "The verified Privy session authorizes this setup. Coretta does not request a second simulated code.",
  },
  creating: {
    title: "Creating the smart wallet",
    copy: "Coretta provisions the Circle wallet and attaches it to the authenticated identity.",
    note: "Keep this page open until the API confirms the wallet address.",
  },
  success: {
    title: "Smart wallet ready",
    copy: "The account is authenticated and its Arc Testnet wallet is ready for deposits and Damian.",
    note: "Only Arc Testnet USDC should be sent to the displayed address.",
  },
  linkEmail: {
    title: "Link a verified email",
    copy: "Wallet-first users can add Privy email OTP as another way to access the same Coretta account.",
    note: "The verified email is linked to the current Coretta wallet session, not a separate account.",
  },
  linkWallet: {
    title: "Link an external wallet",
    copy: "Email-first users can prove ownership and add an external wallet as another sign-in method.",
    note: "The external wallet stays self-custodied. Only its address is linked to the Coretta account.",
  },
};

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitForPrivyAccessToken() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = await getAccessToken();
    if (token) return token;
    await wait(250 * (attempt + 1));
  }
  return null;
}

function errorMessage(error: unknown, privyMethod: PrivyMethod = "email") {
  const withoutVersion = (message: string) =>
    message.replace(/\s*Version:\s*[^\r\n]+(?:[\r\n].*)?$/i, "").trim();

  if (error instanceof ApiError) {
    switch (error.code) {
      case "DATABASE_UNAVAILABLE":
        return "Coretta could not reach its account database. Please retry in a moment.";
      case "PRIVY_NOT_CONFIGURED":
        return "Privy email authentication is not configured on the Coretta API.";
      case "PRIVY_AUTH_FAILED":
        return privyMethod === "google"
          ? "Privy could not verify this Google session. Sign in with Google again."
          : "Privy could not verify this login session. Retry the account check, or request a new code if the session expired.";
      case "PRIVY_UNAVAILABLE":
        return privyMethod === "google"
          ? "Google sign-in succeeded, but Coretta could not reach Privy to finish the account check. Retry shortly."
          : "Your code was accepted, but Coretta could not reach Privy to finish the account check. Retry shortly.";
      case "PRIVY_TOKEN_PENDING":
        return privyMethod === "google"
          ? "Google sign-in finished, but the Privy session is still loading. Retry the account check without signing in again."
          : "Your code was accepted, but the Privy session is still loading. Retry Coretta sign-in without requesting another code.";
      case "EMAIL_ALREADY_LINKED":
        return "This email already belongs to another Coretta account.";
      case "WALLET_ALREADY_LINKED":
        return "This wallet already belongs to another Coretta account.";
      case "WALLET_PROVISIONING_FAILED":
        return "Authentication succeeded, but Coretta could not prepare the smart wallet.";
      default:
        return withoutVersion(error.message) || "Coretta could not complete this step.";
    }
  }
  if (error instanceof Error) {
    if (/user rejected|denied|rejected the request/i.test(error.message)) {
      return "User rejected the request.";
    }
    return withoutVersion(error.message);
  }
  return "Coretta could not complete this step.";
}

function isRejectedPrivyOtp(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /expired|invalid|incorrect|maximum|max attempts|attempt limit/i.test(message);
}

function privyOtpErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (isRejectedPrivyOtp(error)) {
    return "That code is invalid or expired. Request a new code and use the latest Privy email.";
  }
  if (/failed to fetch|network|timeout|connection/i.test(message)) {
    return "Privy could not be reached. Check your connection and try the same code again.";
  }
  return "Privy could not verify the code. Try the same code again before requesting a new one.";
}

function shortAddress(address?: string | null) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function OnboardingFlow({ open, onComplete, onEmailLinked }: Props) {
  const [view, setView] = useState<View>("home");
  const [path, setPath] = useState<Path>(null);
  const [accountKind, setAccountKind] = useState<AccountKind>(null);
  const [history, setHistory] = useState<View[]>([]);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [emailPurpose, setEmailPurpose] = useState<EmailPurpose>("signin");
  const [privyMethod, setPrivyMethod] = useState<PrivyMethod>("email");
  const [emailStep, setEmailStep] = useState<"email" | "otp">("email");
  const [privyToken, setPrivyToken] = useState<string | null>(null);
  const [privyVerified, setPrivyVerified] = useState(false);
  const [smartWalletAddress, setSmartWalletAddress] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<"email" | "wallet" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [depositOpen, setDepositOpen] = useState(false);
  const [walletCheckAttempt, setWalletCheckAttempt] = useState(0);

  const { address, chainId, isConnected } = useAccount();
  const { connectAsync, connectors, isPending: connectPending } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const { authenticated, logout } = usePrivy();
  const { initOAuth, loading: oauthLoading } = useLoginWithOAuth({
    onComplete: ({ loginMethod }) => {
      if (loginMethod === "google") void finishGoogleSignIn();
    },
    onError: () => {
      setBusy(false);
      setError("Google sign-in couldn't finish. Try again in Chrome or Edge, or use email. Google must also be enabled in the Privy dashboard.");
    },
  });
  const { sendCode: sendPrivyCode, loginWithCode } = useLoginWithEmail();
  const { installedWallets } = useEip6963();
  const {
    verifyOwnership,
    verified,
    verifying,
    verifyError,
    smartWalletAddress: sessionSmartWalletAddress,
    syncBindings,
  } = useWalletSession();
  const checkedWalletRef = useRef<string | null>(null);

  const emailEnabled = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  const injected = connectors.find((connector) => connector.id === "injected");
  const walletConnect = connectors.find((connector) => connector.id === "walletConnect");
  const loading = busy || verifying || connectPending || oauthLoading;
  const walletChoices = installedWallets.length ? installedWallets : [{ id: "browser", name: "Browser wallet", rdns: "", icon: undefined }];
  const connectorForWallet = (wallet: (typeof walletChoices)[number]) =>
    connectors.find((connector) => connector.id === wallet.rdns || connector.name.toLowerCase() === wallet.name.toLowerCase()) ??
    (wallet.id === "browser" || installedWallets.length === 1 ? injected : undefined);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(
      () => setResendIn((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [resendIn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!depositOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDepositOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [depositOpen]);

  const pushView = (next: View) => {
    setHistory((items) => [...items, view]);
    setView(next);
    setError(null);
  };

  const replaceView = (next: View) => {
    setView(next);
    setError(null);
  };

  const goBack = () => {
    setHistory((items) => {
      const next = [...items];
      const previous = next.pop();
      if (previous) {
        setView(previous);
        if (previous === "home") {
          checkedWalletRef.current = null;
          setPath(null);
          setAccountKind(null);
        }
      }
      return next;
    });
    setError(null);
  };

  const restart = () => {
    checkedWalletRef.current = null;
    setView("home");
    setPath(null);
    setAccountKind(null);
    setHistory([]);
    setEmail("");
    setOtp("");
    setEmailStep("email");
    setEmailPurpose("signin");
    setPrivyMethod("email");
    setPrivyToken(null);
    setPrivyVerified(false);
    setSmartWalletAddress(null);
    setLinkStatus(null);
    setError(null);
    setDepositOpen(false);
  };

  const exchangePrivySession = async (token: string, linkToWallet: boolean) => {
    const corettaToken = getApiToken();
    const response = await apiFetch<PrivyExchangeResponse>("/v1/auth/privy", {
      method: "POST",
      auth: false,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(linkToWallet && corettaToken ? { "X-Coretta-Session": corettaToken } : {}),
      },
      body: JSON.stringify({ linkToWallet }),
    });
    setApiToken(response.token);
    setEmail(response.email);
    setSmartWalletAddress(response.smartWalletAddress);
    onEmailLinked?.(response.email);
    return response;
  };

  const authenticateReturningWallet = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyOwnership();
      if (!ok) {
        setError(verifyError || "Coretta could not verify this wallet signature.");
        return;
      }
      setSmartWalletAddress(sessionSmartWalletAddress);
      setToast("Wallet ownership verified");
      replaceView("success");
    } catch (walletError) {
      setError(errorMessage(walletError));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open || view !== "walletCheck" || !address) return;
    const key = `${address.toLowerCase()}:${walletCheckAttempt}`;
    if (checkedWalletRef.current === key) return;
    checkedWalletRef.current = key;
    let cancelled = false;

    const check = async () => {
      setBusy(true);
      setError(null);
      try {
        const [status] = await Promise.all([
          apiFetch<{ existing: boolean; smartWalletAddress: string | null }>(
            `/v1/auth/wallet-status?address=${encodeURIComponent(address)}`,
            { auth: false },
          ),
          wait(650),
        ]);
        if (cancelled) return;
        setSmartWalletAddress(status.smartWalletAddress);
        if (!status.existing) {
          setAccountKind("new");
          replaceView("walletNone");
          return;
        }
        setAccountKind("returning");
        setBusy(false);
        const ok = await verifyOwnership();
        if (cancelled) return;
        if (!ok) {
          setError("Sign the free ownership message to restore this Coretta account.");
          return;
        }
        setSmartWalletAddress(status.smartWalletAddress || sessionSmartWalletAddress);
        setToast("Existing Coretta wallet restored");
        replaceView("success");
      } catch (checkError) {
        if (!cancelled) setError(errorMessage(checkError));
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, [address, open, sessionSmartWalletAddress, verifyOwnership, view, walletCheckAttempt]);

  const retryWalletCheck = () => {
    checkedWalletRef.current = null;
    setError(null);
    setWalletCheckAttempt((attempt) => attempt + 1);
  };

  const startWallet = () => {
    setPath("wallet");
    setAccountKind(null);
    checkedWalletRef.current = null;
    if (isConnected && address && chainId === arcTestnet.id) pushView("walletCheck");
    else pushView("walletConnect");
  };

  const connectWallet = async (connector: (typeof connectors)[number]) => {
    setBusy(true);
    setError(null);
    try {
      await connectAsync({ connector, chainId: arcTestnet.id });
      checkedWalletRef.current = null;
      replaceView("walletCheck");
    } catch (connectError) {
      setError(errorMessage(connectError));
    } finally {
      setBusy(false);
    }
  };

  const createWalletFromSignature = async () => {
    setBusy(true);
    setError(null);
    replaceView("creating");
    try {
      const ok = await verifyOwnership();
      if (!ok) {
        replaceView("walletSignature");
        setError(verifyError || "The ownership signature was not completed.");
        return;
      }
      await wait(650);
      setSmartWalletAddress(sessionSmartWalletAddress);
      setToast("Coretta wallet created");
      replaceView("success");
    } catch (walletError) {
      replaceView("walletSignature");
      setError(errorMessage(walletError));
    } finally {
      setBusy(false);
    }
  };

  const resetEmailForm = (purpose: EmailPurpose) => {
    setEmailPurpose(purpose);
    setEmailStep("email");
    setEmail("");
    setOtp("");
    setOtpAttempts(0);
    setPrivyToken(null);
    setPrivyVerified(false);
    setError(null);
  };

  const startEmail = () => {
    setPath("email");
    setPrivyMethod("email");
    setAccountKind(null);
    resetEmailForm("signin");
    pushView("emailEntry");
  };

  const sendEmailCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!emailEnabled) {
      setError("Privy email authentication is not configured for this app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (authenticated) await logout();
      await sendPrivyCode({ email: normalizedEmail });
      setEmail(normalizedEmail);
      setEmailStep("otp");
      setOtp("");
      setOtpAttempts(0);
      setPrivyToken(null);
      setPrivyVerified(false);
      setResendIn(RESEND_COOLDOWN);
      if (view === "emailEntry") replaceView("emailSignInCode");
      setToast(`Privy sent a sign-in code to ${normalizedEmail}`);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "";
      if (/429|cooldown|rate/i.test(message)) setError("Please wait before requesting another Privy code.");
      else if (/origin|domain/i.test(message)) setError("This site is not listed in the Privy app's allowed domains.");
      else setError("Privy could not send a code. Check the email address and try again.");
    } finally {
      setBusy(false);
    }
  };

  const finishVerifiedEmailCheck = async (token: string) => {
    const [status] = await Promise.all([
      apiFetch<PrivyStatusResponse>("/v1/auth/privy/status", {
        method: "POST",
        auth: false,
        headers: { Authorization: `Bearer ${token}` },
        body: "{}",
      }),
      wait(650),
    ]);
    setEmail(status.email);
    setSmartWalletAddress(status.smartWalletAddress);
    if (!status.existing) {
      setAccountKind("new");
      replaceView("emailNone");
      return;
    }
    setAccountKind("returning");
    const response = await exchangePrivySession(token, false);
    setSmartWalletAddress(response.smartWalletAddress);
    setToast("Existing Coretta wallet restored");
    replaceView("success");
  };

  const retryVerifiedEmailCheck = async () => {
    if (!privyToken) {
      setError(
        privyMethod === "google"
          ? "The Google session is no longer available. Sign in with Google again."
          : "The Privy session is no longer available. Request a new code.",
      );
      if (privyMethod === "email") replaceView("emailEntry");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await finishVerifiedEmailCheck(privyToken);
    } catch (checkError) {
      setError(errorMessage(checkError, privyMethod));
    } finally {
      setBusy(false);
    }
  };

  const finishGoogleSignIn = async () => {
    setBusy(true);
    setPath("email");
    setPrivyMethod("google");
    setEmailPurpose("signin");
    replaceView("emailCheck");
    try {
      const token = await waitForPrivyAccessToken();
      if (!token) throw new ApiError(503, "PRIVY_TOKEN_PENDING", "Privy access token was not ready.");
      setPrivyToken(token);
      setPrivyVerified(true);
      await finishVerifiedEmailCheck(token);
    } catch (googleError) {
      setError(errorMessage(googleError, "google"));
    } finally {
      setBusy(false);
    }
  };

  const startGoogle = async () => {
    setBusy(true);
    setError(null);
    setPath("email");
    setPrivyMethod("google");
    setAccountKind(null);
    resetEmailForm("signin");
    try {
      if (authenticated) await logout();
      await initOAuth({ provider: "google" });
    } catch {
      setBusy(false);
      setError("Google sign-in couldn't start. Use Chrome or Edge, or continue with email. Check Google is enabled in Privy and localhost is allowed.");
    }
  };

  const verifyEmailCode = async () => {
    if (otp.length !== 6) {
      setError("Enter the six-digit Privy code.");
      return;
    }
    if (otpAttempts >= 5) {
      setError("This code has reached Privy's five-attempt limit. Request a new code.");
      return;
    }
    setBusy(true);
    setError(null);
    const mustSubmitOtp = !privyVerified;
    let token = privyToken;
    if (mustSubmitOtp) {
      try {
        await loginWithCode({ code: otp });
        setPrivyVerified(true);
      } catch (otpError) {
        if (isRejectedPrivyOtp(otpError)) setOtpAttempts((count) => count + 1);
        setError(privyOtpErrorMessage(otpError));
        setBusy(false);
        return;
      }
    }

    try {
      if (!token) token = await waitForPrivyAccessToken();
      if (!token) {
        throw new ApiError(503, "PRIVY_TOKEN_PENDING", "Privy access token was not ready.");
      }
      setPrivyToken(token);

      if (emailPurpose === "link") {
        await exchangePrivySession(token, true);
        setLinkStatus("email");
        setToast("Email verified and linked to this Coretta wallet");
        replaceView("success");
        return;
      }

      replaceView("emailCheck");
      await finishVerifiedEmailCheck(token);
    } catch (verifyEmailError) {
      setError(errorMessage(verifyEmailError));
    } finally {
      setBusy(false);
    }
  };

  const createWalletFromEmail = async () => {
    if (!privyToken) {
      setError(
        privyMethod === "google"
          ? "Your verified Google session is no longer available. Sign in with Google again."
          : "Your verified Privy session is no longer available. Request a new code.",
      );
      if (privyMethod === "email") replaceView("emailEntry");
      return;
    }
    setBusy(true);
    setError(null);
    replaceView("creating");
    try {
      const response = await exchangePrivySession(privyToken, false);
      setSmartWalletAddress(response.smartWalletAddress);
      setToast("Coretta wallet created");
      replaceView("success");
    } catch (createError) {
      replaceView("emailNone");
      setError(errorMessage(createError));
    } finally {
      setBusy(false);
    }
  };

  const openEmailLink = () => {
    setPrivyMethod("email");
    resetEmailForm("link");
    pushView("linkEmail");
  };

  const linkExternalWallet = async () => {
    setBusy(true);
    setError(null);
    try {
      let linkedAddress = address;
      if (!linkedAddress) {
        const connector = injected || walletConnect;
        if (!connector) throw new Error("No supported wallet connector is available.");
        const result = await connectAsync({ connector, chainId: arcTestnet.id });
        linkedAddress = result.accounts[0];
      }
      if (!linkedAddress) throw new Error("No wallet address was returned.");
      const message = buildOwnershipMessage(linkedAddress, arcTestnet.id);
      const signature = await signMessageAsync({ account: linkedAddress, message });
      await apiFetch("/v1/wallet/link-external", {
        method: "POST",
        body: JSON.stringify({ address: linkedAddress, message, signature }),
      });
      await syncBindings();
      setLinkStatus("wallet");
      setToast("External wallet verified and linked");
      replaceView("success");
    } catch (linkError) {
      setError(errorMessage(linkError));
    } finally {
      setBusy(false);
    }
  };

  const walletAddress = smartWalletAddress || sessionSmartWalletAddress || "Wallet address unavailable";
  const scenarioLabel = accountKind === "returning" ? "Returning user" : accountKind === "new" ? "New user" : "Automatic check";
  const journey = useMemo(() => {
    if (!path) return ["Choose path", "Authenticate", "Check account", "Continue"];
    if (path === "wallet" && accountKind === "returning") return ["Connect", "Verify ownership", "Ready"];
    if (path === "wallet") return ["Connect", "Check account", "Approve", "Create wallet", "Fund"];
    if (privyMethod === "google" && accountKind === "returning") return ["Google sign-in", "Check account", "Restore wallet", "Ready"];
    if (privyMethod === "google") return ["Google sign-in", "Check account", "Approve", "Create wallet", "Fund"];
    if (accountKind === "returning") return ["Email sign-in", "Verify code", "Restore wallet", "Ready"];
    return ["Email sign-in", "Verify code", "Approve", "Create wallet", "Fund"];
  }, [accountKind, path, privyMethod]);
  const journeyIndex = useMemo(() => {
    if (view === "home") return 0;
    if (view === "walletConnect" || view === "emailEntry" || view === "linkEmail") return 0;
    if (view === "walletCheck" || view === "emailSignInCode") return 1;
    if (view === "emailCheck" || view === "walletNone" || view === "walletSignature" || view === "emailNone") return Math.min(2, journey.length - 1);
    if (view === "creating") return Math.min(3, journey.length - 1);
    if (view === "success" || view === "linkWallet") return journey.length - 1;
    return 0;
  }, [journey.length, view]);

  if (!open) return null;

  const renderError = () => error ? <p className={styles.errorBox} role="alert">{error}</p> : null;

  const renderEmailForm = (isLink = false) => {
    const showOtp = isLink ? emailStep === "otp" : view === "emailSignInCode";
    if (!showOtp) {
      return (
        <form className={styles.formCard} onSubmit={(event) => { event.preventDefault(); void sendEmailCode(); }}>
          <label className={styles.fieldLabel} htmlFor={isLink ? "linkEmail" : "email"}>Email address</label>
          <input className={styles.field} id={isLink ? "linkEmail" : "email"} type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading} autoFocus required />
          {renderError()}
          <div className={styles.buttonRow}>
            <button className={`${styles.primaryButton} ${styles.emailCodeButton}`} type="submit" disabled={loading}>{loading ? "Sending..." : "Send sign-in code"}</button>
            {isLink && <button className={styles.textButton} type="button" onClick={() => replaceView("success")}>Skip for now</button>}
          </div>
          <p className={styles.trustNote}>Privy sends the six-digit code. Coretta never stores the OTP.</p>
        </form>
      );
    }
    return (
      <form className={styles.formCard} onSubmit={(event) => { event.preventDefault(); void verifyEmailCode(); }}>
        <label className={styles.fieldLabel} htmlFor={isLink ? "linkOtp" : "otp"}>Authentication code</label>
        <input className={`${styles.field} ${styles.codeField}`} id={isLink ? "linkOtp" : "otp"} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={loading} autoFocus required />
        {renderError()}
        <div className={styles.buttonRow}>
          <button className={styles.primaryButton} type="submit" disabled={loading || otp.length !== 6}>{loading ? "Verifying..." : privyVerified ? isLink ? "Retry linking email" : "Retry Coretta sign-in" : isLink ? "Verify and link email" : "Verify code"}</button>
          <button className={styles.secondaryButton} type="button" disabled={loading || resendIn > 0} onClick={() => void sendEmailCode()}>{resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}</button>
        </div>
        <p className={styles.trustNote}>Code sent to {email}. Privy accepts up to five attempts for the latest code.</p>
      </form>
    );
  };

  const content = (() => {
    switch (view) {
      case "walletConnect":
        return <div className={styles.stageContent}>
          <p className={styles.eyebrow}>Step 1 · Wallet sign-in</p><h2>Connect your wallet</h2>
          <p className={styles.lede}>Choose the wallet you want to use with Coretta. No transaction is sent.</p>{renderError()}
          <div className={styles.connectList}>
            {walletChoices.map((wallet) => {
              const connector = connectorForWallet(wallet);
              return <button className={styles.walletOption} type="button" key={wallet.id} disabled={!connector || loading} onClick={() => connector && void connectWallet(connector)}>
                <span className={styles.walletLogo}><WalletLogo id={wallet.id} icon={wallet.icon ?? connector?.icon} /></span>
                <span><strong>{wallet.name}</strong><small>{installedWallets.length ? "Installed browser wallet" : "Browser extension"}</small></span>
                <span className={styles.walletArrow}>→</span>
              </button>;
            })}
            {walletConnect && <button className={styles.walletOption} type="button" disabled={loading} onClick={() => void connectWallet(walletConnect)}>
              <span className={styles.walletLogo}><WalletLogo id="walletconnect" /></span>
              <span><strong>WalletConnect</strong><small>Scan with a mobile wallet</small></span><span className={styles.walletArrow}>→</span>
            </button>}
          </div><p className={styles.trustNote}>Coretta requests Arc Testnet and never reads your wallet's private key.</p>
        </div>;
      case "walletCheck":
        return <div className={styles.stageContent}><div className={styles.statusWrap}><div className={styles.statusOrbit} aria-label="Checking" /><p className={styles.eyebrow}>Connected · {shortAddress(address)}</p><h2>Checking for your smart wallet</h2><p className={styles.lede}>Coretta is checking this address and will request a free signature when ownership proof is required.</p><div className={styles.checkList}><div className={styles.checkRow}><span className={styles.checkMark}>✓</span>Wallet connection confirmed</div><div className={styles.checkRow}><span className={styles.checkMark}>···</span>{verified ? "Ownership verified" : "Checking account and ownership"}</div></div>{renderError()}{error && <div className={styles.buttonRow}>{accountKind === "returning" ? <button className={styles.primaryButton} type="button" disabled={loading} onClick={() => void authenticateReturningWallet()}>Sign in again</button> : <button className={styles.primaryButton} type="button" disabled={loading} onClick={retryWalletCheck}>Retry account check</button>}</div>}</div></div>;
      case "walletNone":
        return <div className={styles.stageContent}><p className={styles.eyebrow}>No Coretta wallet found</p><h2>Create your managed smart wallet</h2><p className={styles.lede}>This connected wallet is new to Coretta. Approve setup before Coretta provisions a Circle developer-controlled wallet on Arc Testnet.</p>{renderError()}<div className={styles.promptCard}><h3>A secure account managed by Coretta</h3><p>Your connected wallet stays self-custodied. Coretta manages the new Circle smart wallet on your behalf for supported app transactions.</p><ul className={styles.benefitList}><li>No second seed phrase to store</li><li>Your signature proves ownership of the connected wallet</li><li>Privy email can be linked as another sign-in method</li></ul><div className={styles.buttonRow}><button className={styles.primaryButton} type="button" onClick={() => pushView("walletSignature")}>Agree and continue</button><button className={styles.textButton} type="button" onClick={restart}>Not now</button></div></div></div>;
      case "walletSignature":
        return <div className={styles.stageContent}><p className={styles.eyebrow}>Step 3 · Approve setup</p><h2>Sign to create your wallet</h2><p className={styles.lede}>This free signature confirms that you own {shortAddress(address)}. It will not move funds.</p>{renderError()}<div className={styles.signatureBox}><div className={styles.signatureHead}><span className={styles.walletLogo}>W</span><span><strong>Signature request</strong><small>Coretta · Arc Testnet · No gas fee</small></span></div><div className={styles.messagePreview}>Sign in to Coretta<br />Purpose: Verify wallet ownership and create my managed Coretta smart wallet<br />Wallet: {address}<br />Chain ID: {arcTestnet.id}</div><div className={styles.buttonRow}><button className={styles.primaryButton} type="button" disabled={loading} onClick={() => void createWalletFromSignature()}>{loading ? "Waiting for signature..." : "Sign message"}</button><button className={styles.secondaryButton} type="button" onClick={goBack}>Cancel</button></div></div></div>;
      case "emailEntry":
        return <div className={styles.stageContent}><p className={styles.eyebrow}>Step 1 · Privy email sign-in</p><h2>Sign in with email</h2><p className={styles.lede}>Enter your email and Privy will send a one-time code to confirm it is you.</p>{renderEmailForm()}</div>;
      case "emailSignInCode":
        return <div className={styles.stageContent}><p className={styles.eyebrow}>Step 2 · Verify email</p><h2>Enter your sign-in code</h2><p className={styles.lede}>Enter the six-digit OTP Privy sent to {email} to finish signing in.</p>{renderEmailForm()}</div>;
      case "emailCheck":
        return <div className={styles.stageContent}><div className={styles.statusWrap}><div className={styles.statusOrbit} aria-label="Checking" /><p className={styles.eyebrow}>Signed in · {email}</p><h2>Checking your account</h2><p className={styles.lede}>Coretta is looking for an Arc Testnet smart wallet attached to this verified {privyMethod === "google" ? "Google account" : "Privy email"}.</p><div className={styles.checkList}><div className={styles.checkRow}><span className={styles.checkMark}>✓</span>{privyMethod === "google" ? "Google identity verified" : "Email code verified"}</div><div className={styles.checkRow}><span className={styles.checkMark}>···</span>Checking linked smart wallets</div></div>{renderError()}{error && <div className={styles.buttonRow}><button className={styles.primaryButton} type="button" disabled={loading} onClick={() => void retryVerifiedEmailCheck()}>Retry account check</button></div>}</div></div>;
      case "emailNone":
        return <div className={styles.stageContent}><p className={styles.eyebrow}>No smart wallet attached</p><h2>Finish creating your Coretta account</h2><p className={styles.lede}>Your {privyMethod === "google" ? "Google account" : "Privy email"} is verified, but it does not have a Coretta smart wallet yet. Approve creation now.</p>{renderError()}<div className={styles.promptCard}><h3>Your Coretta account includes</h3><p>A Circle developer-controlled wallet managed by Coretta on your behalf, ready for Arc Testnet deposits and supported actions.</p><ul className={styles.benefitList}><li>{privyMethod === "google" ? "Sign in with Google without an email code" : "Sign in with Privy email OTP"}</li><li>No separate wallet seed phrase</li><li>Link a self-custodied external wallet whenever you want</li></ul><div className={styles.buttonRow}><button className={styles.primaryButton} type="button" disabled={loading} onClick={() => void createWalletFromEmail()}>Secure account and continue</button><button className={styles.textButton} type="button" onClick={restart}>Not now</button></div></div></div>;
      case "creating":
        return <div className={styles.stageContent}><div className={styles.statusWrap}><div className={styles.statusOrbit} aria-label="Creating" /><p className={styles.eyebrow}>Identity secured · {path === "email" ? email : shortAddress(address)}</p><h2>Creating your smart wallet</h2><p className={styles.lede}>Coretta is preparing your Circle-managed account on Arc Testnet. Keep this page open.</p><div className={styles.checkList}><div className={styles.checkRow}><span className={styles.checkMark}>✓</span>Authentication confirmed</div><div className={styles.checkRow}><span className={styles.checkMark}>✓</span>Developer-controlled wallet policy prepared</div><div className={styles.checkRow}><span className={styles.checkMark}>···</span>Registering wallet address</div></div>{renderError()}</div></div>;
      case "linkEmail":
        return <div className={styles.stageContent}><p className={styles.eyebrow}>Optional · Account access</p><h2>Link an email</h2><p className={styles.lede}>Add Privy email OTP as another way to sign in to this Coretta wallet account.</p>{renderEmailForm(true)}</div>;
      case "linkWallet":
        return <div className={styles.stageContent}><p className={styles.eyebrow}>Optional · Account access</p><h2>Link an external wallet</h2><p className={styles.lede}>Connect a self-custodied wallet and sign a message to add it as another sign-in method.</p>{renderError()}<div className={styles.signatureBox}><div className={styles.signatureHead}><span className={styles.walletLogo}>W</span><span><strong>{address ? shortAddress(address) : "External wallet"}</strong><small>Arc Testnet · No transaction · No gas fee</small></span></div><div className={styles.messagePreview}>Link wallet to Coretta account<br />Account: {email}<br />Permissions: Sign in and authorize supported Coretta actions</div><div className={styles.buttonRow}><button className={styles.primaryButton} type="button" disabled={loading} onClick={() => void linkExternalWallet()}>{loading ? "Waiting for wallet..." : "Connect and sign"}</button><button className={styles.textButton} type="button" onClick={() => replaceView("success")}>Skip for now</button></div></div></div>;
      case "success": {
        const returning = accountKind === "returning";
        const linkType = path === "wallet" ? "email" : "wallet";
        const linked = linkStatus === linkType;
        return <div className={styles.stageContent}><div className={styles.successLayout}><div className={styles.successMark}>✓</div><p className={styles.eyebrow}>{returning ? "Welcome back" : "Setup complete"}</p><h2>{returning ? "Your smart wallet is ready" : "Smart wallet created"}</h2><p className={styles.lede}>{returning ? "Coretta restored the Arc Testnet smart wallet already registered to this account." : "Your Coretta account is ready. Deposit Arc Testnet USDC or continue to Damian."}</p><div className={styles.walletSummary}><div><div className={styles.summaryLabel}>Coretta managed smart wallet · Arc Testnet</div><div className={styles.address}>{walletAddress}</div><div className={styles.balance}>Available balance · Check live balance in Damian</div></div><button className={styles.primaryButton} type="button" onClick={() => setDepositOpen(true)}>Deposit</button></div><div className={styles.linkCard}><div><h3>{linked ? `${linkType === "email" ? "Email" : "External wallet"} linked` : `Add ${linkType === "email" ? "an email" : "an external wallet"}`}</h3><p>{linked ? "This account now has another verified sign-in method." : linkType === "email" ? "Add Privy email OTP as another way to access this wallet." : "Use a self-custodied wallet as another way to access this account."}</p></div>{linked ? <span className={styles.checkMark}>✓</span> : <button className={styles.miniButton} type="button" onClick={linkType === "email" ? openEmailLink : () => pushView("linkWallet")}>Link {linkType}</button>}</div><button className={styles.continueButton} type="button" onClick={onComplete}>Continue to Dashboard</button></div></div>;
      }
      case "home":
      default:
        return <div className={styles.stageContent}>
          <p className={styles.eyebrow}>One account · Flexible access</p><h1>Move money onchain, without the friction.</h1>
          <p className={styles.lede}>Sign in your way. Coretta checks for your secure smart wallet and guides you through setup only when you need it.</p>{renderError()}
          <div className={styles.entryGrid}>
            <button className={styles.entryCard} type="button" onClick={startWallet} disabled={loading}><span className={styles.entryIcon}><WalletLogo id="browser" /></span><span className={styles.entryTitle}>Continue with wallet</span><span className={styles.entryCopy}>Connect a browser wallet and prove ownership with a signature.</span></button>
            <button className={styles.entryCard} type="button" onClick={startEmail} disabled={!emailEnabled || loading}><span className={styles.entryIcon}>@</span><span className={styles.entryTitle}>Continue with email</span><span className={styles.entryCopy}>Use Privy email authentication and a one-time sign-in code.</span></button>
            <button className={styles.entryCard} type="button" onClick={() => void startGoogle()} disabled={!emailEnabled || loading}><span className={styles.entryIcon}><img src="/wallets/google.svg" alt="" width={24} height={24} /></span><span className={styles.entryTitle}>Continue with Google</span><span className={styles.entryCopy}>Sign in securely with your Google account through Privy.</span></button>
          </div>
          <div className={styles.scenarioRow}><div><div className={styles.scenarioTitle}>New or returning?</div><p className={styles.scenarioCopy}>Coretta detects the correct account path after secure sign-in.</p></div><div className={styles.automaticPill}><span className={styles.demoDot} /> Automatic account check</div></div>
        </div>;
    }
  })();

  const meta = VIEW_META[view];
  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <Logo className={styles.brand} href="/app" />
        </header>
        <main className={styles.frame}><section className={styles.productStage} aria-live="polite">{content}</section><aside className={styles.contextRail}><p className={styles.railLabel}>What this demonstrates</p><h3 className={styles.railTitle}>{meta.title}</h3><p className={styles.railCopy}>{meta.copy}</p><div className={styles.railDivider} /><p className={styles.railLabel}>Journey · {scenarioLabel}</p><div className={styles.journey}>{journey.map((step, index) => <div className={`${styles.journeyStep} ${index < journeyIndex ? styles.done : ""} ${index === journeyIndex ? styles.active : ""}`} key={step}>{step}</div>)}</div><div className={styles.railDivider} /><div className={styles.demoNote}><strong>Security note</strong><br />{meta.note}</div></aside></main>
        <footer className={styles.footerNote}><span>Coretta secure onboarding · Privy OTP · Circle developer-controlled wallet · Arc Testnet</span><span>All transaction fees remain sponsored</span></footer>
      </div>
      {toast && <div className={styles.toast} role="status"><span>●</span>{toast}</div>}
      {depositOpen && <div className={styles.modalBackdrop} onMouseDown={(event) => event.currentTarget === event.target && setDepositOpen(false)}><div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="depositTitle"><div className={styles.modalHead}><div><h3 id="depositTitle">Deposit to Coretta</h3><p>Send Arc Testnet USDC to your managed smart wallet.</p></div><button className={styles.closeButton} type="button" onClick={() => setDepositOpen(false)} aria-label="Close">×</button></div><div className={styles.depositNetwork}><span className={styles.networkName}><span className={styles.networkDot} />Arc Testnet</span><span>USDC</span></div><div className={styles.addressBox}><span className={styles.address}>{walletAddress}</span><button className={styles.copyButton} type="button" disabled={!walletAddress.startsWith("0x")} onClick={async () => { await navigator.clipboard.writeText(walletAddress); setToast("Wallet address copied"); }}>Copy wallet address</button></div><p className={styles.modalWarning}>Send only testnet USDC on Arc Testnet. Assets sent on another network may not appear in Coretta.</p></div></div>}
    </div>
  );
}
