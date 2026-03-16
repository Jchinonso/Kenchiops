/**
 * Shared types for the Onboarding module.
 */

export interface OnboardingProps {
  readonly displayName: string;
  readonly provider: string;
  readonly onSkip: () => void;
}

export interface StepRendererProps {
  readonly currentStep: number;
  readonly firstName: string;
  readonly isGitHub: boolean;
  readonly onNext: () => void;
  readonly onBack: () => void;
  readonly onComplete: () => void;
}
