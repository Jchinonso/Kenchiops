import { WelcomeStep } from "@/components/onboarding/WelcomeStep";
import { ConnectProviderStep } from "@/components/onboarding/ConnectProviderStep";
import { FeaturesStep } from "@/components/onboarding/FeaturesStep";
import { ReadyStep } from "@/components/onboarding/ReadyStep";
import { GITHUB_APP_SLUG } from "./constants";
import type { StepRendererProps } from "./types";

export const StepRenderer = ({
  currentStep,
  firstName,
  isGitHub,
  isProviderConnected,
  onNext,
  onBack,
  onComplete,
}: StepRendererProps) => {
  switch (currentStep) {
    case 0:
      return <WelcomeStep firstName={firstName} onNext={onNext} />;
    case 1:
      return (
        <ConnectProviderStep
          isGitHub={isGitHub}
          githubAppSlug={GITHUB_APP_SLUG}
          isProviderConnected={isProviderConnected}
          onNext={onNext}
          onBack={onBack}
        />
      );
    case 2:
      return <FeaturesStep onNext={onNext} onBack={onBack} />;
    case 3:
      return <ReadyStep firstName={firstName} onComplete={onComplete} onBack={onBack} />;
    default:
      return null;
  }
};
