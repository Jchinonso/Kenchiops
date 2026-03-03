import type { OnboardingChecklistProps } from "./types";
import { CompactProgress } from "./CompactProgress";
import { FullChecklist } from "./FullChecklist";
import { ZeroDataWelcome } from "./ZeroDataWelcome";

export const OnboardingChecklist = ({
  showOnboarding,
  dismissOnboarding,
  steps,
  completedCount,
  allStepsComplete,
  isNewUser,
}: OnboardingChecklistProps) => (
  <>
    {showOnboarding && completedCount >= 2 && !allStepsComplete ? (
      <CompactProgress
        steps={steps}
        completedCount={completedCount}
        onDismiss={dismissOnboarding}
      />
    ) : showOnboarding && !allStepsComplete ? (
      <FullChecklist
        steps={steps}
        allStepsComplete={allStepsComplete}
        onDismiss={dismissOnboarding}
      />
    ) : null}

    {isNewUser && !showOnboarding && <ZeroDataWelcome />}
  </>
);
