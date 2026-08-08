"use client";

/** Minimal void stage — color from existing Coretta palette */
export default function CinematicBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[var(--cine-void)]" />
      {/* Soft vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 40%, transparent 0%, var(--ar-vignette) 100%)",
        }}
      />
    </div>
  );
}
