import { useCallback, useEffect, useState } from "react";
import * as api from "./api";

const TOKEN_KEY = "arcremit_token";

type Screen = "login" | "home" | "send" | "history";

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY),
  );
  const [email, setEmail] = useState("");
  const [balance, setBalance] = useState("0");
  const [wallet, setWallet] = useState<string | undefined>();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [transfers, setTransfers] = useState<
    Awaited<ReturnType<typeof api.getTransfers>>
  >([]);

  const refreshMe = useCallback(async (t: string) => {
    const me = await api.getMe(t);
    setBalance(me.balanceUsdc);
    setWallet(me.walletAddress);
  }, []);

  useEffect(() => {
    if (!token) return;
    refreshMe(token)
      .then(() => setScreen("home"))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setScreen("login");
      });
  }, [token, refreshMe]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const { token: t, user } = await api.login("email", email);
      localStorage.setItem(TOKEN_KEY, t);
      setToken(t);
      setWallet(user.walletAddress);
      setScreen("home");
      await refreshMe(t);
    } catch {
      setStatus("Could not sign in. Check API is running.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setStatus("Sending…");
    try {
      const result = await api.remit(token, {
        recipient: { type: "email", value: recipient },
        amount,
        idempotencyKey: crypto.randomUUID(),
      });
      setStatus(`Sent! ${result.amountUsdc} USDC`);
      setAmount("");
      setRecipient("");
      await refreshMe(token);
      setScreen("home");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Send failed");
    } finally {
      setLoading(false);
    }
  }

  async function openHistory() {
    if (!token) return;
    setLoading(true);
    try {
      setTransfers(await api.getTransfers(token));
      setScreen("history");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setScreen("login");
  }

  if (screen === "login") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/20 text-2xl font-bold text-cyan-300">
            A
          </div>
          <h1 className="text-3xl font-bold tracking-tight">ArcRemit</h1>
          <p className="mt-2 text-slate-400">
            Instant USDC remittance on Arc Testnet — no gas tokens needed.
          </p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <label className="block text-sm text-slate-400">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-slate-600 bg-slate-800/80 px-4 py-3 text-lg outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-cyan-400 py-3.5 font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:opacity-50"
          >
            {loading ? "Setting up wallet…" : "Continue"}
          </button>
        </form>
        {status && <p className="mt-4 text-center text-sm text-amber-300">{status}</p>}
        <p className="mt-8 text-center text-xs text-slate-500">
          Testnet only. Fund USDC at faucet.circle.com
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md px-5 pb-8 pt-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">Balance</p>
          <p className="text-4xl font-bold tabular-nums">${balance}</p>
          <p className="text-xs text-slate-500">USDC on Arc</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-sm text-slate-400 hover:text-white"
        >
          Sign out
        </button>
      </header>

      {wallet && (
        <p className="mb-6 truncate rounded-lg bg-slate-800/60 px-3 py-2 font-mono text-xs text-slate-400">
          {wallet}
        </p>
      )}

      {screen === "home" && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setStatus(null);
              setScreen("send");
            }}
            className="col-span-2 rounded-2xl bg-cyan-400 py-5 text-lg font-semibold text-slate-900 shadow-lg shadow-cyan-400/20 hover:bg-cyan-300"
          >
            Send
          </button>
          <button
            type="button"
            onClick={openHistory}
            className="rounded-2xl border border-slate-600 bg-slate-800/50 py-4 font-medium hover:bg-slate-700/50"
          >
            Activity
          </button>
          <button
            type="button"
            onClick={() => token && refreshMe(token)}
            className="rounded-2xl border border-slate-600 bg-slate-800/50 py-4 font-medium hover:bg-slate-700/50"
          >
            Refresh
          </button>
        </div>
      )}

      {screen === "send" && (
        <form onSubmit={handleSend} className="space-y-5">
          <button
            type="button"
            onClick={() => setScreen("home")}
            className="text-sm text-cyan-300"
          >
            ← Back
          </button>
          <div>
            <label className="text-sm text-slate-400">Recipient email</label>
            <input
              type="email"
              required
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="friend@example.com"
              className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-800/80 px-4 py-3 text-lg outline-none focus:border-cyan-400"
            />
            <p className="mt-1 text-xs text-slate-500">
              New recipients get a smart wallet automatically — funds arrive directly.
            </p>
          </div>
          <div>
            <label className="text-sm text-slate-400">Amount (USDC)</label>
            <input
              type="text"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-800/80 px-4 py-3 text-3xl font-semibold outline-none focus:border-cyan-400"
            />
            <p className="mt-1 text-xs text-slate-500">Max $100 per transfer</p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-cyan-400 py-4 font-semibold text-slate-900 disabled:opacity-50"
          >
            {loading ? "Processing…" : "Send now"}
          </button>
          {status && (
            <p className="text-center text-sm text-cyan-200">{status}</p>
          )}
        </form>
      )}

      {screen === "history" && (
        <div>
          <button
            type="button"
            onClick={() => setScreen("home")}
            className="mb-4 text-sm text-cyan-300"
          >
            ← Back
          </button>
          <h2 className="mb-4 text-lg font-semibold">Activity</h2>
          <ul className="space-y-2">
            {transfers.length === 0 && (
              <li className="text-slate-500">No transfers yet</li>
            )}
            {transfers.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-xl bg-slate-800/60 px-4 py-3"
              >
                <div>
                  <span className="font-medium">
                    {t.direction === "out" ? "Sent" : "Received"}
                  </span>
                  <p className="text-xs text-slate-500">{t.state}</p>
                </div>
                <span
                  className={
                    t.direction === "out" ? "text-red-300" : "text-emerald-300"
                  }
                >
                  {t.direction === "out" ? "-" : "+"}${t.amountUsdc}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
