/**
 * Onboarding Step 3 — Ready!
 * Celebration with animated checkmark, "Go to Dashboard" CTA, and docs link.
 */

import { motion } from "motion/react";
import { ArrowRight, ArrowLeft, BookOpen } from "lucide-react";
import { containerVariants, itemVariants, microSpring } from "@/lib/animations";
import { AnimatedCheckmark } from "./AnimatedCheckmark";

interface ReadyStepProps {
  readonly firstName: string;
  readonly onComplete: () => void;
  readonly onBack: () => void;
}

export const ReadyStep = ({ firstName, onComplete, onBack }: ReadyStepProps) => (
  <motion.div
    variants={containerVariants}
    initial="hidden"
    animate="visible"
    className="text-center"
  >
    {/* Animated checkmark */}
    <motion.div variants={itemVariants} className="mb-6">
      <AnimatedCheckmark />
    </motion.div>

    {/* Celebration heading */}
    <motion.h2
      variants={itemVariants}
      className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2"
    >
      You&apos;re all set, {firstName}!
    </motion.h2>

    <motion.p
      variants={itemVariants}
      className="text-base text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto leading-relaxed"
    >
      Kenchi will start analyzing CI failures as soon as your first pipeline runs. You&apos;ll see
      results on your dashboard.
    </motion.p>

    {/* Primary CTA */}
    <motion.div variants={itemVariants} className="mb-4">
      <motion.button
        type="button"
        onClick={onComplete}
        className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/25"
        whileHover={{ scale: 1.02, y: -1 }}
        whileTap={{ scale: 0.98 }}
        transition={microSpring}
      >
        Go to Dashboard
        <ArrowRight className="w-4 h-4" />
      </motion.button>
    </motion.div>

    {/* Secondary docs link */}
    <motion.div variants={itemVariants}>
      <a
        href="https://docs.kenchi.dev"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Read the docs (opens in new tab)"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        <BookOpen className="w-3.5 h-3.5" />
        Read the docs
      </a>
    </motion.div>

    {/* Back button */}
    <motion.div variants={itemVariants} className="mt-6">
      <motion.button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        whileTap={{ scale: 0.97 }}
        transition={microSpring}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </motion.button>
    </motion.div>
  </motion.div>
);
