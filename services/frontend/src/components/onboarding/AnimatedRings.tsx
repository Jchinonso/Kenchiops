/**
 * Animated concentric rings visual — SVG circles that expand outward
 * with staggered timing using the brand gradient colors.
 */

import { motion } from "motion/react";

const RINGS = [
  { radius: 30, delay: 0, opacity: 0.3, color: "#6366f1" },
  { radius: 50, delay: 0.15, opacity: 0.2, color: "#8b5cf6" },
  { radius: 70, delay: 0.3, opacity: 0.12, color: "#06b6d4" },
  { radius: 90, delay: 0.45, opacity: 0.06, color: "#6366f1" },
] as const;

export const AnimatedRings = () => (
  <div className="w-40 h-40 sm:w-48 sm:h-48 mx-auto relative">
    <svg viewBox="0 0 200 200" className="w-full h-full" aria-hidden="true">
      {RINGS.map((ring) => (
        <motion.circle
          key={ring.radius}
          cx="100"
          cy="100"
          r={ring.radius}
          fill="none"
          stroke={ring.color}
          strokeWidth="1.5"
          opacity={ring.opacity}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: ring.opacity }}
          transition={{
            delay: ring.delay,
            duration: 0.8,
            type: "spring",
            stiffness: 100,
            damping: 15,
          }}
          style={{ transformOrigin: "100px 100px" }}
        />
      ))}

      {/* Center icon glow */}
      <motion.circle
        cx="100"
        cy="100"
        r="16"
        fill="url(#ring-gradient)"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
        style={{ transformOrigin: "100px 100px" }}
      />

      <defs>
        <radialGradient id="ring-gradient">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </radialGradient>
      </defs>
    </svg>

    {/* Rocket emoji centered */}
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 12 }}
    >
      <span className="text-2xl sm:text-3xl" role="img" aria-label="Rocket">
        🚀
      </span>
    </motion.div>
  </div>
);
