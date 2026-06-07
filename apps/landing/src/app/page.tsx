import Background from "@/components/landing/Background";
import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import WhyCoretta from "@/components/landing/WhyCoretta";
import MeetDamian from "@/components/landing/MeetDamian";
import NetworkVisualization from "@/components/landing/NetworkVisualization";
import TrustSecurity from "@/components/landing/TrustSecurity";
import More from "@/components/landing/More";
import Footer from "@/components/landing/Footer";

export default function HomePage() {
  return (
    <main className="relative min-h-dvh overflow-x-hidden text-[var(--ar-fg)]">
      <Background />
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <WhyCoretta />
      <MeetDamian />
      <NetworkVisualization />
      <TrustSecurity />
      <More />
      <Footer />
    </main>
  );
}
