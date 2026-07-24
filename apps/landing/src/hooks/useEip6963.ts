"use client";

import { useEffect, useState } from "react";

export interface SupportedWalletInfo {
  id: string;
  name: string;
  rdns: string;
  installed: boolean;
  installUrl: string;
}

const SUPPORTED_LIST = [
  {
    id: "metamask",
    name: "MetaMask",
    rdns: "io.metamask",
    installUrl: "https://metamask.io/download/",
  },
  {
    id: "rabby",
    name: "Rabby",
    rdns: "io.rabby",
    installUrl: "https://rabby.io/",
  },
  {
    id: "zerion",
    name: "Zerion",
    rdns: "io.zerion.wallet",
    installUrl: "https://zerion.io/",
  },
  {
    id: "okx",
    name: "OKX Wallet",
    rdns: "com.okex.wallet",
    installUrl: "https://www.okx.com/web3",
  },
] as const;

export function useEip6963() {
  const [discoveredRdns, setDiscoveredRdns] = useState<Set<string>>(new Set());

  useEffect(() => {
    const found = new Set<string>();

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        info: { rdns: string };
      };
      if (detail?.info?.rdns) {
        found.add(detail.info.rdns);
        setDiscoveredRdns(new Set(found));
      }
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
    };
  }, []);

  const supportedWallets: SupportedWalletInfo[] = SUPPORTED_LIST.map((w) => {
    let installed = discoveredRdns.has(w.rdns);

    if (!installed && typeof window !== "undefined") {
      const win = window as unknown as {
        ethereum?: {
          isMetaMask?: boolean;
          isRabby?: boolean;
          isZerion?: boolean;
          isOkxWallet?: boolean;
          isOKXWallet?: boolean;
        };
        rabby?: unknown;
        zerion?: unknown;
        okxwallet?: unknown;
      };

      if (w.id === "metamask" && win.ethereum?.isMetaMask && !win.ethereum?.isRabby) installed = true;
      if (w.id === "rabby" && (win.ethereum?.isRabby || Boolean(win.rabby))) installed = true;
      if (w.id === "zerion" && (win.ethereum?.isZerion || Boolean(win.zerion))) installed = true;
      if (w.id === "okx" && (win.ethereum?.isOkxWallet || win.ethereum?.isOKXWallet || Boolean(win.okxwallet))) installed = true;
    }

    return {
      ...w,
      installed,
    };
  });

  const installedWallets = supportedWallets.filter((w) => w.installed);

  return { supportedWallets, installedWallets };
}
