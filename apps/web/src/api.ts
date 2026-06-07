const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

function headers(token?: string | null): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function login(type: "email" | "phone", value: string) {
  const res = await fetch(`${API_BASE}/v1/auth/login`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ type, value }),
  });
  if (!res.ok) throw new Error("Login failed");
  return res.json() as Promise<{
    token: string;
    user: { id: string; walletAddress?: string };
  }>;
}

export async function getMe(token: string) {
  const res = await fetch(`${API_BASE}/v1/me`, { headers: headers(token) });
  if (!res.ok) throw new Error("Session expired");
  return res.json() as Promise<{
    walletAddress?: string;
    balanceUsdc: string;
  }>;
}

export async function remit(
  token: string,
  body: {
    recipient: { type: "email" | "phone"; value: string };
    amount: string;
    idempotencyKey: string;
  },
) {
  const res = await fetch(`${API_BASE}/v1/remit`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ ...body, execute: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.reason ?? "Send failed");
  return data;
}

export async function getTransfers(token: string) {
  const res = await fetch(`${API_BASE}/v1/transfers`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error("Failed to load transfers");
  return res.json() as Promise<
    Array<{
      id: string;
      direction: "in" | "out";
      amountUsdc: string;
      state: string;
      createdAt: string;
      explorerUrl?: string;
    }>
  >;
}
