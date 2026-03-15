export interface WizardControls {
  readonly currentStep: number;
  readonly direction: 1 | -1;
  readonly totalSteps: number;
  readonly isFirstStep: boolean;
  readonly isLastStep: boolean;
  readonly goNext: () => void;
  readonly goBack: () => void;
}
