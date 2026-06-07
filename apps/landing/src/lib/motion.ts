/** Premium smooth easing — no harsh snaps */
export const smoothEase = [0.33, 1, 0.68, 1] as const;
export const smoothEaseOut = [0.22, 1, 0.36, 1] as const;

export const springSmooth = {
  type: "spring" as const,
  stiffness: 90,
  damping: 24,
  mass: 0.9,
};

export const springSnappy = {
  type: "spring" as const,
  stiffness: 200,
  damping: 26,
};

export const tweenSmooth = {
  duration: 0.75,
  ease: smoothEase,
};

export const tweenSlow = {
  duration: 1.1,
  ease: smoothEase,
};

export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: tweenSmooth,
  },
};

export const fadeUpItem = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: smoothEase },
  },
};

export const staggerItem = fadeUpItem;

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.09, delayChildren: 0.08 },
  },
};

export const floatY = {
  animate: {
    y: [0, -8, 0],
    transition: { duration: 6, repeat: Infinity, ease: "easeInOut" as const },
  },
};

export const pulseGlow = {
  animate: {
    opacity: [0.5, 0.8, 0.5],
    scale: [1, 1.05, 1],
    transition: { duration: 5, repeat: Infinity, ease: "easeInOut" as const },
  },
};

export const shimmer = {
  animate: {
    backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
    transition: { duration: 9, repeat: Infinity, ease: "linear" as const },
  },
};

export const loopSlow = {
  duration: 8,
  repeat: Infinity,
  ease: "easeInOut" as const,
};
