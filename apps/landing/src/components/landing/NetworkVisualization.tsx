"use client";

import { motion, useInView } from "framer-motion";
import { useRef, type CSSProperties } from "react";
import SectionShell from "@/components/shared/SectionShell";
import { loopSlow, smoothEase, tweenSlow } from "@/lib/motion";

/** Tight viewBox around graph content (labels included) */
const VB = { x: 0, y: 20, w: 100, h: 62 };

type NodeKind =
  | "wallet"
  | "bundler"
  | "identity"
  | "paymaster"
  | "arc"
  | "settlement";

type NetworkNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: NodeKind;
  r: number;
  glow: string;
  fill?: string;
};

const NODES: NetworkNode[] = [
  { id: "w1", label: "Smart Wallet", x: 12, y: 34, kind: "wallet", r: 2.6, glow: "#00c8ff" },
  { id: "w2", label: "Smart Wallet", x: 12, y: 66, kind: "wallet", r: 2.6, glow: "#00c8ff" },
  {
    id: "identity",
    label: "Identity",
    x: 28,
    y: 50,
    kind: "identity",
    r: 2.4,
    glow: "#ffffff",
    fill: "rgba(255,255,255,0.94)",
  },
  { id: "bundler", label: "Bundler", x: 46, y: 36, kind: "bundler", r: 2.8, glow: "#4db8ff" },
  { id: "paymaster", label: "Paymaster", x: 46, y: 64, kind: "paymaster", r: 2.8, glow: "#ff60a8" },
  { id: "arc", label: "Arc Network", x: 72, y: 50, kind: "arc", r: 3.4, glow: "#00eeff" },
  { id: "settle", label: "Settlement", x: 88, y: 50, kind: "settlement", r: 2.5, glow: "#00ffcc" },
];

const EDGES: [string, string][] = [
  ["w1", "identity"],
  ["w2", "identity"],
  ["identity", "bundler"],
  ["identity", "paymaster"],
  ["bundler", "arc"],
  ["paymaster", "arc"],
  ["arc", "settle"],
];

const PULSES: { path: { x: number; y: number }[]; color: string; duration: number }[] = [
  {
    path: [
      { x: 12, y: 34 },
      { x: 28, y: 50 },
      { x: 46, y: 36 },
      { x: 72, y: 50 },
      { x: 88, y: 50 },
    ],
    color: "#00c8ff",
    duration: 5,
  },
  {
    path: [
      { x: 12, y: 66 },
      { x: 28, y: 50 },
      { x: 46, y: 64 },
      { x: 72, y: 50 },
    ],
    color: "#ff60a8",
    duration: 6,
  },
  {
    path: [
      { x: 46, y: 36 },
      { x: 72, y: 50 },
      { x: 88, y: 50 },
    ],
    color: "#4db8ff",
    duration: 4,
  },
];

function nodeById(id: string) {
  return NODES.find((n) => n.id === id)!;
}

/** Icons drawn in ~±1.1 unit space, centered at origin */
function NodeIcon({ kind }: { kind: NodeKind }) {
  switch (kind) {
    case "wallet":
      return (
        <g stroke="#00c8ff" strokeWidth="0.18" fill="none">
          <rect x={-0.95} y={-0.55} width={1.9} height={1.1} rx={0.2} />
          <line x1={-0.7} y1={-0.05} x2={0.7} y2={-0.05} />
          <circle cx={0.55} cy={0.35} r={0.18} fill="#00c8ff" stroke="none" />
        </g>
      );
    case "bundler":
      return (
        <g fill="#4db8ff">
          <rect x={-0.72} y={-0.5} width={1.44} height={0.22} rx={0.08} opacity={0.5} />
          <rect x={-0.9} y={-0.12} width={1.8} height={0.22} rx={0.08} opacity={0.8} />
          <rect x={-0.72} y={0.26} width={1.44} height={0.22} rx={0.08} />
        </g>
      );
    case "identity":
      return (
        <g fill="#0a1640">
          <circle cx={0} cy={-0.35} r={0.32} />
          <path d="M -0.65 0.2 Q 0 0.75 0.65 0.2 L 0.65 0.5 Q 0 0.15 -0.65 0.5 Z" />
        </g>
      );
    case "paymaster": {
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        pts.push(`${Math.cos(a) * 0.75},${Math.sin(a) * 0.75}`);
      }
      return (
        <g stroke="#ff60a8" strokeWidth="0.18" fill="none">
          <polygon points={pts.join(" ")} />
          <text x={0} y={0.28} textAnchor="middle" fontSize="0.85" fontWeight="700" fill="#ff60a8">
            $
          </text>
        </g>
      );
    }
    case "arc":
      return (
        <g fill="none" stroke="#00eeff" strokeWidth="0.16" strokeLinecap="round">
          <circle cx={0} cy={0.55} r={0.12} fill="#00eeff" stroke="none" />
          <path d="M -0.95 0.5 A 0.95 0.95 0 0 1 0.95 0.5" />
          <path d="M -0.72 0.28 A 0.72 0.72 0 0 1 0.72 0.28" />
          <g>
            <path d="M -0.48 0.05 A 0.48 0.48 0 0 1 0.48 0.05" />
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 0 0"
              to="360 0 0"
              dur="9s"
              repeatCount="indefinite"
            />
          </g>
        </g>
      );
    case "settlement":
      return (
        <g fill="#00ffcc">
          <rect x={-0.9} y={-0.12} width={1.8} height={0.14} rx={0.04} />
          <rect x={-0.9} y={0.48} width={1.8} height={0.12} rx={0.04} />
          <rect x={-0.62} y={-0.02} width={0.28} height={0.58} rx={0.05} />
          <rect x={-0.14} y={-0.02} width={0.28} height={0.58} rx={0.05} />
          <rect x={0.34} y={-0.02} width={0.28} height={0.58} rx={0.05} />
        </g>
      );
    default:
      return null;
  }
}

function NetworkNodeGraphic({
  node,
  index,
  inView,
}: {
  node: NetworkNode;
  index: number;
  inView: boolean;
}) {
  const isIdentity = node.kind === "identity";
  const labelOffset = node.id.startsWith("w") ? 5.5 : node.kind === "arc" ? 5.8 : 4.8;

  return (
    <g opacity={inView ? 1 : 0} style={{ transition: "opacity 0.5s ease" }}>
      <g
        transform={`translate(${node.x} ${node.y})`}
        className="network-node"
        style={{ "--node-glow": node.glow } as CSSProperties}
      >
        <circle
          r={node.r + 1.1}
          fill={node.glow}
          className="network-glow-ring"
          style={{ animationDelay: `${index * 300}ms` }}
        />
        <circle
          r={node.r}
          fill={isIdentity ? node.fill : `${node.glow}18`}
          stroke={node.glow}
          strokeWidth={isIdentity ? 0.12 : 0.16}
        />
        <NodeIcon kind={node.kind} />
      </g>
      <text
        x={node.x}
        y={node.y + labelOffset}
        textAnchor="middle"
        fill="currentColor"
        className="pointer-events-none select-none text-[var(--ar-fg-muted)]"
        fontSize="2.4"
      >
        {node.label}
      </text>
    </g>
  );
}

export default function NetworkVisualization() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: false, margin: "-80px" });

  return (
    <SectionShell
      id="network"
      eyebrow="Arc architecture"
      title="USDC-native settlement on Arc"
      subtitle="ERC-4337 smart wallets, Circle Paymaster USDC fees, Pimlico bundler execution, and sub-second finality on Arc Testnet (chain 5042002)."
    >
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        transition={tweenSlow}
        className="relative overflow-hidden rounded-3xl border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4 sm:p-6 md:p-8"
      >
        <motion.div
          className="pointer-events-none absolute inset-0"
          animate={{ opacity: [0.35, 0.55, 0.35] }}
          transition={loopSlow}
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(124,77,255,0.08), transparent)",
          }}
          aria-hidden
        />

        <div className="relative z-10 mx-auto w-full max-w-4xl overflow-hidden">
          <svg
            viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
            preserveAspectRatio="xMidYMid meet"
            className="network-graph mx-auto block h-auto w-full max-h-[min(52vh,380px)] min-h-[220px] sm:min-h-[260px] md:min-h-[300px]"
            role="img"
            aria-label="Coretta network diagram showing smart wallets, paymaster, bundler, and Arc settlement"
          >
            <defs>
              <linearGradient id="netLine" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00c8ff" stopOpacity="0.9" />
                <stop offset="50%" stopColor="#7c4dff" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#00eeff" stopOpacity="0.9" />
              </linearGradient>
              <clipPath id="networkClip">
                <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} />
              </clipPath>
            </defs>

            <g clipPath="url(#networkClip)">
              {EDGES.map(([a, b], i) => {
                const na = nodeById(a);
                const nb = nodeById(b);
                return (
                  <g key={`${a}-${b}`}>
                    <line
                      x1={na.x}
                      y1={na.y}
                      x2={nb.x}
                      y2={nb.y}
                      stroke="url(#netLine)"
                      strokeWidth="0.3"
                      strokeLinecap="round"
                      opacity={inView ? 0.22 : 0}
                    />
                    <line
                      x1={na.x}
                      y1={na.y}
                      x2={nb.x}
                      y2={nb.y}
                      stroke="url(#netLine)"
                      strokeWidth="0.42"
                      strokeLinecap="round"
                      opacity={inView ? 0.75 : 0}
                      className="network-dash-flow"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  </g>
                );
              })}

              {PULSES.map((pulse, pi) => {
                const xs = pulse.path.map((p) => p.x);
                const ys = pulse.path.map((p) => p.y);
                return (
                  <motion.circle
                    key={pi}
                    r={0.9}
                    fill={pulse.color}
                    initial={{ opacity: 0 }}
                    animate={
                      inView
                        ? { cx: xs, cy: ys, opacity: [0, 1, 1, 0] }
                        : { opacity: 0 }
                    }
                    transition={{
                      duration: pulse.duration,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: pi * 0.8,
                    }}
                  />
                );
              })}

              {NODES.map((node, i) => (
                <NetworkNodeGraphic key={node.id} node={node} index={i} inView={inView} />
              ))}
            </g>
          </svg>
        </div>

        <div className="relative z-10 mt-6 flex flex-wrap justify-center gap-3 sm:mt-8">
          {[
            "USDC gas (Arc)",
            "ERC-4337 wallets",
            "Circle Paymaster",
            "Pimlico bundler",
            "Sub-second finality",
          ].map((label, i) => (
            <motion.span
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ delay: 0.4 + i * 0.08, ease: smoothEase, duration: 0.6 }}
              className="rounded-full border border-[var(--ar-border)] bg-[var(--ar-input-bg)] px-3 py-1 text-[11px] font-medium text-[var(--ar-fg-muted)]"
            >
              <motion.span
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#16C784]"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ ...loopSlow, delay: i * 0.4 }}
              />
              {label}
            </motion.span>
          ))}
        </div>
      </motion.div>
    </SectionShell>
  );
}
