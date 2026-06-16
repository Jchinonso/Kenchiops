/**
 * Onboarding Wizard
 *
 * Four steps: Welcome -> Connect -> Features -> Ready.
 *
 * UX contract:
 *   - Skip is globally available (top-right button + Esc) on every step except the last.
 *   - When a provider connection is detected on step 1, the wizard auto-advances.
 */

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useOnboardingWizard } from "@/hooks/useOnboardingWizard";
import { pageVariants, pageTransition } from "@/lib/animations";
import { queryKeys } from "@/lib/queryKeys";
import { OnboardingBackground } from "@/components/onboarding/OnboardingBackground";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { StepRenderer } from "./StepRenderer";
import type { OnboardingProps } from "./types";

const CONNECTION_AUTO_ADVANCE_MS = 1500;

export const Onboarding = ({
  displayName,
  provider,
  isProviderConnected,
  onSkip,
}: OnboardingProps) => {
  const { currentStep, direction, totalSteps, isLastStep, goNext, goBack } = useOnboardingWizard();
  const shouldReduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const stepRef = useRef<HTMLDivElement>(null);
  const firstName = displayName.split(" ")[0] ?? "there";
  const isGitHub = provider === "github";

  useEffect(() => {
    stepRef.current?.focus();
  }, [currentStep]);

  useEffect(() => {
    if (isLastStep) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onSkip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLastStep, onSkip]);

  // Auto-advance from Connect once a provider is connected — gives the user
  // a beat to see the success state before transitioning.
  useEffect(() => {
    if (currentStep !== 1 || !isProviderConnected) {
      return;
    }
    const timer = setTimeout(goNext, CONNECTION_AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [currentStep, isProviderConnected, goNext]);

  const refetchTenant = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.tenant() });
  };

  return (
    <OnboardingBackground>
      {!isLastStep && (
        <button
          type="button"
          onClick={onSkip}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-white dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-50 hover:border-zinc-300 dark:hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 dark:focus-visible:ring-offset-zinc-950 transition-colors z-20"
          aria-label="Skip onboarding (Esc)"
        >
          <span>Skip</span>
          <X className="w-3 h-3" aria-hidden="true" />
          <kbd className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 ml-1">
            Esc
          </kbd>
        </button>
      )}

      <OnboardingProgress currentStep={currentStep} />

      <AnimatePresence mode="wait" custom={direction}>
        <motion.section
          ref={stepRef}
          tabIndex={-1}
          key={currentStep}
          custom={direction}
          variants={pageVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={shouldReduceMotion ? { duration: 0 } : pageTransition}
          className="outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 focus-visible:rounded-2xl"
          aria-label={`Step ${String(currentStep + 1)} of ${String(totalSteps)}`}
        >
          <StepRenderer
            currentStep={currentStep}
            firstName={firstName}
            isGitHub={isGitHub}
            isProviderConnected={isProviderConnected}
            onNext={goNext}
            onBack={goBack}
            onComplete={onSkip}
            onRefreshConnection={refetchTenant}
          />
        </motion.section>
      </AnimatePresence>
    </OnboardingBackground>
  );
};
