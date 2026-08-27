import type { Metadata } from "next";
import DamianChatDemo from "./DamianChatDemo";

export const metadata: Metadata = {
  title: "Damian Chat Demo | Coretta",
  description: "A short Coretta product demo showing Damian preparing a USDC transfer for signature.",
};

export default function DamianChatDemoPage() {
  return <DamianChatDemo />;
}
