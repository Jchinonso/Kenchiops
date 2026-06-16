/**
 * Onboarding Step 0 — Welcome.
 *
 * Greeting + a three-bullet preview of what onboarding covers, so users
 * know what they're committing to before clicking Get Started.
 */

import { motion } from "motion/react";
import { ArrowRight, GitBranch, Sparkles, BarChart3 } from "lucide-react";
import { containerVariants, itemVariants, microSpring } from "@/lib/animations";

interface WelcomeStepProps {
  readonly firstName: string;
  readonly onNext: () => void;
}

interface PreviewItem {
  readonly icon: typeof GitBranch;
  readonly text: string;
}

const PREVIEW_ITEMS: readonly PreviewItem[] = [
  { icon: GitBranch, text: "Connect GitHub or GitLab so Kenchi sees your CI runs" },
  { icon: Sparkles, text: "Get automatic root-cause analysis on every failure" },
  { icon: BarChart3, text: "Track trends, flaky tests, and recovery time" },
];

export const WelcomeStep = ({ firstName, onNext }: WelcomeStepProps) => (
  <motion.div
    variants={containerVariants}
    initial="hidden"
    animate="visible"
    className="text-center"
  >
    <motion.div variants={itemVariants} className="inline-flex items-center justify-center mb-8">
      <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-xl shadow-indigo-500/20">
        <span className="text-xl font-bold text-white" aria-hidden="true">
          K
        </span>
        <span className="sr-only">Kenchi</span>
      </div>
    </motion.div>

    <motion.h1
      variants={itemVariants}
      className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-3"
    >
      Welcome, {firstName}.
    </motion.h1>

    <motion.p
      variants={itemVariants}
      className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 mb-10 max-w-md mx-auto leading-relaxed"
    >
      Let&apos;s get Kenchi watching your CI/CD. Takes about two minutes.
    </motion.p>

    <motion.ul
      variants={itemVariants}
      className="text-left space-y-3 mb-10 max-w-sm mx-auto"
      aria-label="What you'll do"
    >
      {PREVIEW_ITEMS.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-start gap-3">
          <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mt-0.5">
            <Icon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          </span>
          <span className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{text}</span>
        </li>
      ))}
    </motion.ul>

    <motion.div variants={itemVariants}>
      <motion.button
        type="button"
        onClick={onNext}
        className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 dark:focus-visible:ring-offset-zinc-950 transition-colors shadow-lg shadow-indigo-500/25"
        whileHover={{ scale: 1.02, y: -1 }}
        whileTap={{ scale: 0.98 }}
        transition={microSpring}
      >
        Get started
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </motion.button>
    </motion.div>
  </motion.div>
);
