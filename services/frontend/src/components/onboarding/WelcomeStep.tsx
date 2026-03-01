/**
 * Onboarding Step 0 — Welcome
 * Animated greeting with concentric rings, value proposition, and "Get Started" CTA.
 */

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { containerVariants, itemVariants, microSpring } from "@/lib/animations";
import { AnimatedRings } from "./AnimatedRings";

interface WelcomeStepProps {
  readonly firstName: string;
  readonly onNext: () => void;
}

export const WelcomeStep = ({ firstName, onNext }: WelcomeStepProps) => (
  <motion.div
    variants={containerVariants}
    initial="hidden"
    animate="visible"
    className="text-center"
  >
    {/* Animated rings visual */}
    <motion.div variants={itemVariants} className="mb-8">
      <AnimatedRings />
    </motion.div>

    {/* Greeting */}
    <motion.h1
      variants={itemVariants}
      className="text-3xl sm:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-3"
    >
      Hey, {firstName}!
    </motion.h1>

    <motion.p
      variants={itemVariants}
      className="text-base sm:text-lg text-zinc-500 dark:text-zinc-400 mb-10 max-w-md mx-auto leading-relaxed"
    >
      Let&apos;s get your CI/CD failures analyzed automatically.
      <br />
      <span className="text-zinc-400 dark:text-zinc-500">Setup takes under 2 minutes.</span>
    </motion.p>

    <motion.div variants={itemVariants}>
      <motion.button
        type="button"
        onClick={onNext}
        className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/25"
        whileHover={{ scale: 1.02, y: -1 }}
        whileTap={{ scale: 0.98 }}
        transition={microSpring}
      >
        Get Started
        <ArrowRight className="w-4 h-4" />
      </motion.button>
    </motion.div>
  </motion.div>
);
