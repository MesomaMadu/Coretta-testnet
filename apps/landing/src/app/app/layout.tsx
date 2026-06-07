import { WagmiProviders } from "@/lib/wagmi/providers";
import { I18nProvider } from "@/lib/i18n/context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProviders>
      <I18nProvider>{children}</I18nProvider>
    </WagmiProviders>
  );
}
