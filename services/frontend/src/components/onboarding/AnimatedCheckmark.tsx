/**
 * Animated checkmark — SVG circle + check path drawn with pathLength animation.
 * Spring-based scale-in with satisfying overshoot.
 */

import { motion } from "motion/react";

export const AnimatedCheckmark = () => (
  <div className="w-24 h-24 sm:w-28 sm:h-28 mx-auto">
    <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
      {/* Background circle */}
      <motion.circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="#6366f1"
        strokeWidth="3"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{ rotate: -90, transformOrigin: "50px 50px" }}
      />

      {/* Filled circle */}
      <motion.circle
        cx="50"
        cy="50"
        r="42"
        fill="#6366f1"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.1 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 15 }}
        style={{ transformOrigin: "50px 50px" }}
      />

      {/* Checkmark path */}
      <motion.path
        d="M30 52 L44 66 L70 38"
        fill="none"
        stroke="#6366f1"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4, ease: "easeOut" }}
      />
    </svg>
  </div>
);
