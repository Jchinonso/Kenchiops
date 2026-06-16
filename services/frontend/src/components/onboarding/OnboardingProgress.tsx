/**
 * Onboarding progress indicator.
 *
 * Numbered pills connected by lines. Current step is filled and bordered;
 * completed steps are filled solid; future steps are outlined. Labels are
 * shown at all breakpoints. No pulsing animation — modern apps favour
 * still indicators that don't compete with content.
 */

import { Fragment } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEP_LABELS = ["Welcome", "Connect", "Features", "Ready"] as const;

interface OnboardingProgressProps {
  readonly currentStep: number;
}

export const OnboardingProgress = ({ currentStep }: OnboardingProgressProps) => (
  <div
    className="flex items-start justify-center gap-0 mb-10 sm:mb-12"
    role="progressbar"
    aria-label="Onboarding progress"
    aria-valuenow={currentStep + 1}
    aria-valuemin={1}
    aria-valuemax={STEP_LABELS.length}
  >
    {STEP_LABELS.map((label, index) => {
      const isCompleted = index < currentStep;
      const isCurrent = index === currentStep;
      const isFuture = index > currentStep;

      return (
        <Fragment key={label}>
          {/* Step pill + label */}
          <div className="flex flex-col items-center gap-2 min-w-[3.5rem] sm:min-w-[4.5rem]">
            <div
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                isCompleted && "bg-indigo-500 text-white",
                isCurrent &&
                  "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 border-2 border-indigo-500",
                isFuture &&
                  "bg-transparent text-zinc-400 dark:text-zinc-600 border-2 border-zinc-200 dark:border-zinc-800"
              )}
            >
              {isCompleted ? (
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
              ) : (
                <span>{index + 1}</span>
              )}
            </div>
            <span
              className={cn(
                "text-[11px] sm:text-xs font-medium",
                isCompleted && "text-zinc-700 dark:text-zinc-300",
                isCurrent && "text-zinc-900 dark:text-zinc-100",
                isFuture && "text-zinc-400 dark:text-zinc-600"
              )}
            >
              {label}
            </span>
          </div>

          {/* Connector line (not after last pill) */}
          {index < STEP_LABELS.length - 1 && (
            <div className="h-0.5 flex-1 max-w-[3.5rem] sm:max-w-[5rem] mt-3.5 sm:mt-4 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-indigo-500"
                initial={false}
                animate={{ width: index < currentStep ? "100%" : "0%" }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
              />
            </div>
          )}
        </Fragment>
      );
    })}
  </div>
);
