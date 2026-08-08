"use client";

import { injected } from "@wagmi/core";
import { walletConnect } from "@wagmi/connectors/walletConnect";
import { createConfig, createStorage, http } from "wagmi";
import { arcTestnet } from "@/lib/chains";

const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "";

const connectors = [
  injected({ shimDisconnect: true }),
  ...(wcProjectId
    ? [
        walletConnect({
          projectId: wcProjectId,
          showQrModal: true,
        }),
      ]
    : []),
];

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/**
 * Persist connector state so a successful connect is not lost on remount/HMR.
 * Without storage, wagmi can drop the session immediately after connect under SSR.
 */
export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: {
    [arcTestnet.id]: http(),
  },
  ssr: true,
  storage: createStorage({
    storage: typeof window !== "undefined" ? window.localStorage : noopStorage,
  }),
});
