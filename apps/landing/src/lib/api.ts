"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TOKEN_KEY = "Coretta_api_token";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getApiToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setApiToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event("coretta-api-session-updated"));
}

export function clearApiToken() {
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event("coretta-api-session-updated"));
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { auth?: boolean },
): Promise<T> {
  const auth = init?.auth ?? true;
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = getApiToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let code: string | null = null;
    let message = text || res.statusText || "Request failed";
    let details: unknown;
    try {
      const body = JSON.parse(text) as { code?: unknown; message?: unknown };
      details = body;
      code = typeof body.code === "string" ? body.code : null;
      if (typeof body.message === "string" && body.message.trim()) {
        message = body.message;
      }
    } catch {
      /* non-JSON error response */
    }
    throw new ApiError(res.status, code, message, details);
  }
  return (await res.json()) as T;
}

