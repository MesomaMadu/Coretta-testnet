"use client";

import { motion } from "framer-motion";

const VOID = "#03030A";

/** Neon Flux — cinematic dark neon stream background (background layer only) */
export default function Background({ subdued = false }: { subdued?: boolean }) {
  const intensity = subdued ? 0.55 : 1;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ background: VOID }}
      aria-hidden
    >
      <style>{`
        @keyframes nf-dash-flow {
          to { stroke-dashoffset: -28; }
        }
        @keyframes nf-orb-drift-a {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(3%, -2%); }
        }
        @keyframes nf-orb-drift-b {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-2.5%, 3%); }
        }
        @keyframes nf-orb-drift-c {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(2%, 2.5%); }
        }
        @keyframes nf-stream-pulse {
          0%, 100% { opacity: 0.82; filter: brightness(1) saturate(1.4); }
          50% { opacity: 1; filter: brightness(1.25) saturate(1.55); }
        }
        .nf-dash { animation: nf-dash-flow 1.2s linear infinite; }
        .nf-orb-a { animation: nf-orb-drift-a 12s ease-in-out infinite alternate; }
        .nf-orb-b { animation: nf-orb-drift-b 10s ease-in-out infinite alternate; }
        .nf-orb-c { animation: nf-orb-drift-c 14s ease-in-out infinite alternate; }
        .nf-streams { animation: nf-stream-pulse 3s ease-in-out infinite; }
      `}</style>

      {/* Layer 0 — background atmosphere */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 25% 80%, #0D0D2B 0%, #080818 50%, #03030A 100%)",
        }}
      />

      {/* Layer 1 — hero bloom */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.35 * intensity,
          background:
            "radial-gradient(circle at 42% 62%, rgba(122,47,255,0.45) 0%, rgba(0,100,255,0.20) 40%, transparent 72%)",
        }}
      />

      {/* Layer 2 — ambient orbs */}
      <div
        className="nf-orb-a absolute rounded-full"
        style={{
          width: 3600,
          height: 3600,
          left: "-35%",
          bottom: "-25%",
          background: "rgba(122, 47, 255, 0.30)",
          filter: "blur(360px)",
          opacity: intensity,
        }}
      />
      <div
        className="nf-orb-b absolute rounded-full"
        style={{
          width: 3000,
          height: 3000,
          right: "-30%",
          top: "0%",
          background: "rgba(26, 143, 255, 0.20)",
          filter: "blur(300px)",
          opacity: intensity,
        }}
      />
      <div
        className="nf-orb-c absolute rounded-full"
        style={{
          width: 2400,
          height: 2400,
          left: "10%",
          bottom: "-40%",
          background: "rgba(232, 23, 154, 0.15)",
          filter: "blur(240px)",
          opacity: intensity,
        }}
      />

      {/* Layer 3 — neon stream SVG */}
      <motion.div
        className="nf-streams absolute inset-0"
        style={{
          opacity: 0.85 * intensity,
          transform: "scale(6)",
          transformOrigin: "20% 85%",
        }}
        animate={{ x: [0, 12, -8, 0], y: [0, -6, 4, 0] }}
        transition={{ duration: 48, repeat: Infinity, ease: "linear" }}
      >
        <svg
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          className="h-full w-full"
          style={{ filter: "blur(0.5px) brightness(1.15) saturate(1.4)" }}
        >
          <defs>
            <linearGradient id="nf-stream-primary" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0055DD" />
              <stop offset="25%" stopColor="#1A8FFF" />
              <stop offset="55%" stopColor="#7B2FFF" />
              <stop offset="80%" stopColor="#E8179A" />
              <stop offset="100%" stopColor="#FF2DB0" />
            </linearGradient>
            <linearGradient id="nf-stream-core" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="20%" stopColor="#D8D0FF" />
              <stop offset="60%" stopColor="#1A8FFF" />
              <stop offset="100%" stopColor="#0033AA" />
            </linearGradient>
            <filter id="nf-glow-blue" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="12" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="nf-glow-magenta" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="16" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Primary wide sweep — bottom-left toward upper-right */}
          <path
            d="M -80 820 C 280 780, 520 420, 920 280 S 1480 120, 1520 40"
            fill="none"
            stroke="url(#nf-stream-primary)"
            strokeWidth="14"
            strokeLinecap="round"
            opacity="0.9"
            filter="url(#nf-glow-blue)"
          />
          <path
            d="M -60 800 C 300 760, 500 440, 900 300 S 1460 140, 1500 60"
            fill="none"
            stroke="url(#nf-stream-core)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.75"
          />

          {/* Mid-field inner arc */}
          <path
            d="M 120 720 C 360 640, 480 480, 720 380 S 1100 220, 1280 180"
            fill="none"
            stroke="#7B2FFF"
            strokeWidth="9"
            strokeLinecap="round"
            opacity="0.7"
            filter="url(#nf-glow-magenta)"
          />
        </svg>
      </motion.div>

      {/* Particle trail accents */}
      {[
        { left: "18%", top: "72%", color: "#E0F0FF", delay: 0 },
        { left: "32%", top: "58%", color: "#D8D0FF", delay: 1.2 },
        { left: "48%", top: "48%", color: "#E0F0FF", delay: 2.4 },
        { left: "62%", top: "38%", color: "#FFFFFF", delay: 0.8 },
        { left: "76%", top: "30%", color: "#D8D0FF", delay: 1.8 },
      ].map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: p.left,
            top: p.top,
            width: 3,
            height: 3,
            background: p.color,
            boxShadow: `0 0 8px ${p.color}, 0 0 20px rgba(224,240,255,0.4)`,
            opacity: intensity,
          }}
          animate={{ opacity: [0.2, 1, 0.2], y: [0, -18, 0], x: [0, 10, 0] }}
          transition={{
            duration: 4 + i * 0.5,
            repeat: Infinity,
            delay: p.delay,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Layer 4 — noise overlay */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.045 * intensity,
          mixBlendMode: "overlay",
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: "180px 180px",
        }}
      />

      {/* Layer 5 — vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 40%, transparent 0%, rgba(3,3,10,0.75) 100%)",
        }}
      />
    </div>
  );
}
