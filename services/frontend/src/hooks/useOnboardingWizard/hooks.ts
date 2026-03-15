/**
 * Step state machine for the onboarding wizard.
 * Manages current step, navigation direction (for animation), and step controls.
 */

import { useState, useCallback, useMemo } from "react";
import { TOTAL_STEPS } from "./constants";
import type { WizardControls } from "./types";

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

  return useMemo(
    () => ({
      currentStep,
      direction,
      totalSteps: TOTAL_STEPS,
      isFirstStep: currentStep === 0,
      isLastStep: currentStep === TOTAL_STEPS - 1,
      goNext,
      goBack,
    }),
    [currentStep, direction, goNext, goBack]
  );
};
