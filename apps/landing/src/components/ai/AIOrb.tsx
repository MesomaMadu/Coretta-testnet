"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AIOrbProps {
  active?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  animation?: "liquid" | "pulse";
}

/** Pixel sizes for the water-drop mark only (Damian logo section). */
const sizes = { sm: 48, md: 80, lg: 112 } as const;

const DROP_PATH =
  "M32 4C32 4 8 34 8 50C8 63.255 18.745 74 32 74C45.255 74 56 63.255 56 50C56 34 32 4 32 4Z";

/**
 * Damian logo: black water-drop with a soft liquid pulse.
 * Animation is confined to this mark (not the full chat chrome).
 */
export default function AIOrb({
  active = false,
  size = "md",
  className,
  animation = "liquid",
}: AIOrbProps) {
  const px = sizes[size];
  const pulseOnly = animation === "pulse";

  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: px, height: px }}
      aria-hidden
    >
      {pulseOnly ? (
        <motion.div
          className="absolute inset-[18%] rounded-full bg-[#7C4DFF]/15 blur-xl"
          animate={{
            scale: active ? [0.9, 1.16, 0.9] : [0.94, 1.06, 0.94],
            opacity: active ? [0.25, 0.55, 0.25] : [0.16, 0.3, 0.16],
          }}
          transition={{ duration: active ? 1.6 : 2.8, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <motion.div
          className="absolute bottom-0 left-1/2 h-2 w-[55%] -translate-x-1/2 rounded-full bg-black/15 blur-sm"
          animate={{
            scaleX: active ? [1, 1.18, 1] : [1, 1.06, 1],
            opacity: active ? [0.3, 0.55, 0.3] : [0.22, 0.38, 0.22],
          }}
          transition={{ duration: active ? 1.4 : 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Water drop body */}
      <motion.div
        className="relative"
        style={{ width: px * 0.72, height: px * 0.9 }}
        animate={
          pulseOnly
            ? {
                scale: active ? [1, 1.045, 1] : [1, 1.018, 1],
                opacity: active ? [0.92, 1, 0.92] : [0.96, 1, 0.96],
              }
            : {
                y: active ? [0, -7, 0, 2, 0] : [0, -3, 0],
                scaleY: active ? [1, 1.05, 0.96, 1.02, 1] : [1, 1.025, 1],
                scaleX: active ? [1, 0.96, 1.04, 0.99, 1] : [1, 0.99, 1],
              }
        }
        transition={{
          duration: active ? 1.5 : 2.8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <svg
          viewBox="0 0 64 80"
          width="100%"
          height="100%"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient
              id="damian-drop-fill"
              x1="20"
              y1="4"
              x2="48"
              y2="76"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#2A2A2A" />
              <stop offset="0.45" stopColor="#0A0A0A" />
              <stop offset="1" stopColor="#000000" />
            </linearGradient>
            <radialGradient
              id="damian-drop-shine"
              cx="0"
              cy="0"
              r="1"
              gradientUnits="userSpaceOnUse"
              gradientTransform="translate(24 28) rotate(90) scale(22 16)"
            >
              <stop stopColor="#FFFFFF" stopOpacity="0.35" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </radialGradient>
            <clipPath id="damian-drop-clip">
              <path d={DROP_PATH} />
            </clipPath>
          </defs>

          {/* Drop silhouette */}
          <path d={DROP_PATH} fill="url(#damian-drop-fill)" />

          {/* Liquid motion is reserved for the landing treatment. */}
          <g clipPath="url(#damian-drop-clip)">
            {pulseOnly ? (
              <g>
                <rect x="0" y="28" width="64" height="60" fill="#111111" />
                <path d="M0 28 Q16 20 32 28 T64 28 V40 H0 Z" fill="#1F1F1F" />
              </g>
            ) : (
              <motion.g
                animate={{ y: active ? [14, 4, 16, 8, 14] : [16, 10, 16] }}
                transition={{
                  duration: active ? 1.8 : 3.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <rect x="0" y="28" width="64" height="60" fill="#111111" />
                <path d="M0 28 Q16 20 32 28 T64 28 V40 H0 Z" fill="#1F1F1F" />
              </motion.g>
            )}
          </g>

          {/* Specular highlight */}
          <ellipse cx="24" cy="30" rx="7" ry="11" fill="url(#damian-drop-shine)" />
          <path
            d={DROP_PATH}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            fill="none"
          />
        </svg>

        {/* Occasional drip bead under the tip when active */}
        {active && !pulseOnly && (
          <motion.span
            className="absolute left-1/2 top-full mt-0.5 block h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-black"
            animate={{
              y: [0, 10, 14],
              opacity: [0, 0.9, 0],
              scale: [0.6, 1, 0.4],
            }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeIn", repeatDelay: 0.4 }}
          />
        )}
      </motion.div>
    </div>
  );
}
