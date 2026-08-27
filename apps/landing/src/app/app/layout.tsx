import { WagmiProviders } from "@/lib/wagmi/providers";
import { I18nProvider } from "@/lib/i18n/context";
import { PrivyAuthProvider } from "@/lib/privy/providers";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivyAuthProvider>
      <WagmiProviders>
        <I18nProvider>{children}</I18nProvider>
      </WagmiProviders>
    </PrivyAuthProvider>
  );
}
