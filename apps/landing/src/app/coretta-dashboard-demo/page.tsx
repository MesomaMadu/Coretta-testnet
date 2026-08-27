import type { Metadata } from "next";
import CorettaDashboardDemo from "./CorettaDashboardDemo";

export const metadata: Metadata = {
  title: "Coretta Dashboard Demo",
  description: "An isolated Coretta dashboard concept using sample USDC and Arc Testnet data.",
};

export default function CorettaDashboardDemoPage() {
  return <CorettaDashboardDemo />;
}
