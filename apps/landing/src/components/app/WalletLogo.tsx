"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";

const LOCAL_LOGOS: Record<string, string> = {
  metamask: "/wallets/metamask.png",
  rabby: "/wallets/rabby.png",
  zerion: "/wallets/zerion.png",
  okx: "/wallets/okx.png",
  walletconnect: "/wallets/walletconnect.png",
};

export default function WalletLogo({ id, icon }: { id: string; icon?: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  // Provider icons are rendered only as images, never as executable inline SVG.
  const providerIcon = icon && /^data:image\/(?:png|jpeg|webp|svg\+xml)[;,]/i.test(icon) ? icon : undefined;
  const source = [providerIcon, LOCAL_LOGOS[id]].find((value) => value && !failed.includes(value));
  if (!source) return <Wallet size={24} aria-hidden="true" />;
  return <img src={source} alt="" width={32} height={32} style={{ objectFit: "contain" }} onError={() => setFailed((values) => [...values, source])} />;
}
