"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AIOrbProps {
  active?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = { sm: "h-12 w-12", md: "h-20 w-20", lg: "h-28 w-28" };

export default function AIOrb({ active = false, size = "md", className }: AIOrbProps) {
  return (
    <div className={cn("relative flex items-center justify-center", sizes[size], className)}>
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-400/40 via-violet-500/30 to-fuchsia-500/40 blur-xl"
        animate={{
          scale: active ? [1, 1.15, 1] : [1, 1.05, 1],
          opacity: active ? [0.6, 0.9, 0.6] : [0.4, 0.55, 0.4],
        }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="relative z-10 rounded-full border border-white/20 bg-gradient-to-br from-cyan-500/20 via-violet-600/30 to-fuchsia-600/20 shadow-[0_0_40px_rgba(34,211,238,0.35)]"
        style={{ width: "100%", height: "100%" }}
        animate={{ rotate: active ? 360 : 0 }}
        transition={{ duration: active ? 8 : 0, repeat: active ? Infinity : 0, ease: "linear" }}
      >
        <div className="absolute inset-[18%] rounded-full bg-gradient-to-tr from-white/30 to-transparent" />
        <div className="absolute inset-[35%] rounded-full bg-cyan-300/50 blur-sm" />
      </motion.div>
    </div>
  );
}
