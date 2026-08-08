import HaloNavbar from "@/components/landing/HaloNavbar";
import HaloHero from "@/components/landing/HaloHero";
import HaloInfoSection from "@/components/landing/HaloInfoSection";
import HaloDamianSection from "@/components/landing/HaloDamianSection";
import HaloUseCases from "@/components/landing/HaloUseCases";
import HaloSecurityStrip from "@/components/landing/HaloSecurityStrip";
import Footer from "@/components/landing/Footer";

/**
 * Landing: Halo fintech layout.
 * Full-height header (nav + video hero), info cards, Damian intro, use cases, security.
 */
export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#F5F5F5]">
      <div className="flex h-screen flex-col overflow-hidden">
        <HaloNavbar />
        <HaloHero />
      </div>
      <HaloInfoSection />
      <HaloDamianSection />
      <HaloUseCases />
      <HaloSecurityStrip />
      <Footer />
    </div>
  );
}
