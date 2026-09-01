"use client";

import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";

/** Scope the large Privy SDK to the authenticated app instead of marketing pages. */
export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return children;

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google"],
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
