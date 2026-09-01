"use client";

import { getAccessToken } from "@privy-io/react-auth";
import { apiFetch, setApiToken } from "@/lib/api";

let restoreInFlight: Promise<boolean> | null = null;

/** Restore Coretta's API session from an already authenticated Privy account. */
export async function restoreCorettaSessionFromPrivy(expectedEmail?: string | null) {
  if (restoreInFlight) return restoreInFlight;

  restoreInFlight = (async () => {
    const privyToken = await getAccessToken();
    if (!privyToken) {
      throw new Error("Your email session expired. Sign in with email again before continuing.");
    }
    const response = await apiFetch<{ token: string; email: string }>("/v1/auth/privy", {
      method: "POST",
      auth: false,
      headers: { Authorization: `Bearer ${privyToken}` },
      body: "{}",
    });
    if (
      expectedEmail &&
      response.email.toLowerCase() !== expectedEmail.trim().toLowerCase()
    ) {
      throw new Error("The active Privy email does not match this Coretta account.");
    }
    setApiToken(response.token);
    return true;
  })();

  try {
    return await restoreInFlight;
  } finally {
    restoreInFlight = null;
  }
}
