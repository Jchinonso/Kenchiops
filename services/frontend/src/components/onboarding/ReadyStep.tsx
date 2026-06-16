/**
 * Onboarding Step 3 — Ready.
 *
 * Celebration with animated checkmark, single primary CTA, and a
 * secondary docs link. No Back button — going backwards from "done"
 * is confusing and adds no value.
 */

import { motion } from "motion/react";
import { ArrowRight, BookOpen } from "lucide-react";
import { containerVariants, itemVariants, microSpring } from "@/lib/animations";
import { AnimatedCheckmark } from "./AnimatedCheckmark";

interface ReadyStepProps {
  readonly firstName: string;
  readonly onComplete: () => void;
}

export const ReadyStep = ({ firstName, onComplete }: ReadyStepProps) => (
  <motion.div
    variants={containerVariants}
    initial="hidden"
    animate="visible"
    className="text-center"
  >
    <motion.div variants={itemVariants} className="mb-6">
      <AnimatedCheckmark />
    </motion.div>

    <motion.h2
      variants={itemVariants}
      className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-3"
    >
      You&apos;re all set, {firstName}.
    </motion.h2>

    <motion.p
      variants={itemVariants}
      className="text-base text-zinc-600 dark:text-zinc-400 mb-10 max-w-sm mx-auto leading-relaxed"
    >
      Kenchi will analyse failures the moment your next pipeline runs. Results land on your
      dashboard automatically.
    </motion.p>

    <motion.div variants={itemVariants} className="mb-5">
      <motion.button
        type="button"
        onClick={onComplete}
        className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 dark:focus-visible:ring-offset-zinc-950 transition-colors shadow-lg shadow-indigo-500/25"
        whileHover={{ scale: 1.02, y: -1 }}
        whileTap={{ scale: 0.98 }}
        transition={microSpring}
      >
        Go to dashboard
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </motion.button>
    </motion.div>

    <motion.div variants={itemVariants}>
      <a
        href="https://docs.kenchi.dev"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Read the docs (opens in new tab)"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded-md px-2 py-1 transition-colors"
      >
        <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
        Read the docs
      </a>
    </motion.div>
  </motion.div>
);
