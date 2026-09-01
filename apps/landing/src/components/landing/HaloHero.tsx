"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AGENT_NAME, BRAND_NAME } from "@/lib/brand";

/** Coin / product motion from the design prompt (CloudFront). */
const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_161253_c72b1869-400f-45ed-ac0c-52f68c2ed5bd.mp4";

export default function HaloHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    // Browsers require muted + playsInline; force play after mount.
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");

    const tryPlay = () => {
      const p = el.play();
      if (p !== undefined) {
        p.catch(() => {
          // Retry once after metadata (common autoplay race)
          const onReady = () => {
            void el.play().catch(() => setVideoFailed(true));
            el.removeEventListener("canplay", onReady);
          };
          el.addEventListener("canplay", onReady);
        });
      }
    };

    if (el.readyState >= 2) tryPlay();
    else el.addEventListener("loadeddata", tryPlay, { once: true });

    return () => {
      el.pause();
    };
  }, []);

  return (
    <section className="hero-section flex flex-1 items-end px-6 pb-6 pt-20">
      <div
        className="relative w-full overflow-hidden rounded-2xl"
        style={{ height: "calc(100vh - 96px)" }}
      >
        {/* Coin animation video, full-bleed background of the hero card */}
        {!videoFailed ? (
          <video
            ref={videoRef}
            className="absolute inset-0 z-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onError={() => setVideoFailed(true)}
          >
            <source src={HERO_VIDEO} type="video/mp4" />
          </video>
        ) : (
          <div
            className="absolute inset-0 z-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 70% 40%, rgba(143,92,255,0.35) 0%, transparent 55%), linear-gradient(135deg, #e8e4f5 0%, #f5f5f5 50%, #ddd6f3 100%)",
            }}
            aria-hidden
          />
        )}

        {/* Light gradient only on the left so copy stays readable; coin motion stays visible on the right */}
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "linear-gradient(90deg, rgba(245,245,245,0.92) 0%, rgba(245,245,245,0.72) 38%, rgba(245,245,245,0.18) 62%, rgba(245,245,245,0.05) 100%)",
          }}
          aria-hidden
        />

        <div className="relative z-10 flex h-full flex-col items-start justify-start p-8 pt-32 sm:p-12 sm:pt-36">
          <h1
            className="mb-4 max-w-xl text-5xl font-medium leading-tight text-black md:text-6xl"
            style={{ letterSpacing: "-0.04em" }}
          >
            Payments planned
            <br />
            with AI
          </h1>
          <p
            className="mb-8 max-w-md text-base leading-relaxed text-black/70 md:text-lg"
            style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
          >
            {BRAND_NAME} coordinates USDC and EURC payments on Arc Testnet.{" "}
            {AGENT_NAME} turns plain language into locked previews for you to approve.
          </p>

          <Link
            href="/app"
            className="inline-flex items-center gap-3 rounded-full bg-black py-2 pl-8 pr-2 text-base font-medium text-white transition-colors duration-200 hover:bg-gray-800 md:text-lg"
          >
            Sign up
            <span className="rounded-full bg-white p-2 transition-colors duration-200">
              <ArrowRight className="h-5 w-5 text-black" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
