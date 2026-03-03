/**
 * Connected-dots progress indicator for the onboarding wizard.
 * Shows completed, current, and future steps with animated line fills.
 */

import { Fragment } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const STEP_LABELS = ["Welcome", "Connect", "Features", "Ready"] as const;

interface OnboardingProgressProps {
  readonly currentStep: number;
}

export const OnboardingProgress = ({ currentStep }: OnboardingProgressProps) => (
  <div
    className="flex items-center justify-center gap-0 mb-10"
    role="progressbar"
    aria-label="Onboarding progress"
    aria-valuenow={currentStep + 1}
    aria-valuemin={1}
    aria-valuemax={STEP_LABELS.length}
  >
    {STEP_LABELS.map((label, index) => (
      <Fragment key={label}>
        {/* Dot */}
        <div className="flex flex-col items-center gap-1.5">
          <div
            className={cn(
              "rounded-full transition-colors",
              index < currentStep && "w-3 h-3 bg-indigo-500",
              index === currentStep &&
                "w-4 h-4 bg-indigo-500 ring-4 ring-indigo-500/20 animate-pulse",
              index > currentStep && "w-3 h-3 border-2 border-zinc-300 dark:border-zinc-600"
            )}
          />
          <span
            className={cn(
              "text-[10px] font-medium hidden sm:block",
              index <= currentStep
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-zinc-400 dark:text-zinc-600"
            )}
          >
            {label}
          </span>
        </div>

        {/* Connecting line (not after last dot) */}
        {index < STEP_LABELS.length - 1 && (
          <div className="w-12 sm:w-16 h-0.5 bg-zinc-200 dark:bg-zinc-700 mx-1 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-indigo-500 rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: index < currentStep ? "100%" : "0%" }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            />
          </div>
        )}
      </Fragment>
    ))}
  </div>
);
