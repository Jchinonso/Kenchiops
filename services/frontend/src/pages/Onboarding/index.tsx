/**
 * Onboarding Wizard
 *
 * Multi-step onboarding experience for new users. Four steps:
 * 0. Welcome — animated greeting
 * 1. Connect Providers — GitHub, GitLab, Slack
 * 2. What You'll Get — animated feature showcase
 * 3. Ready — celebration + go to dashboard
 *
 * Props unchanged from original: displayName, provider, onSkip.
 */

import { useRef, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useOnboardingWizard } from "@/hooks/useOnboardingWizard";
import { pageVariants, pageTransition } from "@/lib/animations";
import { OnboardingBackground } from "@/components/onboarding/OnboardingBackground";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { StepRenderer } from "./StepRenderer";
import type { OnboardingProps } from "./types";

export const Onboarding = ({ displayName, provider, onSkip }: OnboardingProps) => {
  const wizard = useOnboardingWizard();
  const shouldReduceMotion = useReducedMotion();
  const stepRef = useRef<HTMLDivElement>(null);
  const firstName = displayName.split(" ")[0] ?? "there";
  const isGitHub = provider === "github";

  // Focus the step container on step change for keyboard accessibility
  useEffect(() => {
    stepRef.current?.focus();
  }, [wizard.currentStep]);

  return (
    <OnboardingBackground>
      {/* Progress indicator */}
      <OnboardingProgress currentStep={wizard.currentStep} />

      {/* Animated step transitions */}
      <AnimatePresence mode="wait" custom={wizard.direction}>
        <motion.div
          ref={stepRef}
          tabIndex={-1}
          key={wizard.currentStep}
          custom={wizard.direction}
          variants={pageVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={shouldReduceMotion ? { duration: 0 } : pageTransition}
          className="outline-none"
        >
          <StepRenderer
            currentStep={wizard.currentStep}
            firstName={firstName}
            isGitHub={isGitHub}
            onNext={wizard.goNext}
            onBack={wizard.goBack}
            onComplete={onSkip}
          />
        </motion.div>
      </AnimatePresence>

      {/* Skip link — always visible except on last step */}
      {!wizard.isLastStep && (
        <div className="text-center mt-8">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            Skip for now &rarr;
          </button>
        </div>
      )}
    </OnboardingBackground>
  );
};
