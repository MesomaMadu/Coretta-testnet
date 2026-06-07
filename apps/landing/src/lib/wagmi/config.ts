"use client";

import { injected } from "@wagmi/core";
import { walletConnect } from "@wagmi/connectors/walletConnect";
import { createConfig, http } from "wagmi";
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

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: {
    [arcTestnet.id]: http(),
  },
  ssr: true,
});
