"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TOKEN_KEY = "Coretta_api_token";

export function getApiToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setApiToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearApiToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { auth?: boolean },
): Promise<T> {
  const auth = init?.auth ?? true;
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (auth) {
    const token = getApiToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`.trim());
  }
  return (await res.json()) as T;
}

