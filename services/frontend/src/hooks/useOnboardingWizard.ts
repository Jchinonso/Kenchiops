/**
 * Step state machine for the onboarding wizard.
 * Manages current step, navigation direction (for animation), and step controls.
 */

import { useState, useCallback } from "react";

const TOTAL_STEPS = 4;

interface WizardControls {
  readonly currentStep: number;
  readonly direction: 1 | -1;
  readonly totalSteps: number;
  readonly isFirstStep: boolean;
  readonly isLastStep: boolean;
  readonly goNext: () => void;
  readonly goBack: () => void;
}

export const useOnboardingWizard = (): WizardControls => {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  const goNext = useCallback(() => {
    setDirection(1);
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
  }, []);

  const goBack = useCallback(() => {
    setDirection(-1);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  return {
    currentStep,
    direction,
    totalSteps: TOTAL_STEPS,
    isFirstStep: currentStep === 0,
    isLastStep: currentStep === TOTAL_STEPS - 1,
    goNext,
    goBack,
  };
};
