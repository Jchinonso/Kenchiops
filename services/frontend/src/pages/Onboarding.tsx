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
import { WelcomeStep } from "@/components/onboarding/WelcomeStep";
import { ConnectProviderStep } from "@/components/onboarding/ConnectProviderStep";
import { FeaturesStep } from "@/components/onboarding/FeaturesStep";
import { ReadyStep } from "@/components/onboarding/ReadyStep";

const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG ?? "kenchi-devops";

interface OnboardingProps {
  readonly displayName: string;
  readonly provider: string;
  readonly onSkip: () => void;
}

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

  const renderStep = () => {
    switch (wizard.currentStep) {
      case 0:
        return <WelcomeStep firstName={firstName} onNext={wizard.goNext} />;
      case 1:
        return (
          <ConnectProviderStep
            isGitHub={isGitHub}
            githubAppSlug={GITHUB_APP_SLUG}
            onNext={wizard.goNext}
            onBack={wizard.goBack}
          />
        );
      case 2:
        return <FeaturesStep onNext={wizard.goNext} onBack={wizard.goBack} />;
      case 3:
        return <ReadyStep firstName={firstName} onComplete={onSkip} onBack={wizard.goBack} />;
      default:
        return null;
    }
  };

  return (
    <OnboardingBackground>
      {/* Progress indicator */}
      <OnboardingProgress currentStep={wizard.currentStep} totalSteps={wizard.totalSteps} />

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
          {renderStep()}
        </motion.div>
      </AnimatePresence>

      {/* Skip link — always visible except on last step */}
      {!wizard.isLastStep && (
        <div className="text-center mt-8">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Skip for now &rarr;
          </button>
        </div>
      )}
    </OnboardingBackground>
  );
};
