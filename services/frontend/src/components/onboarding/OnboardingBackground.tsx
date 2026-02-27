/**
 * Shared gradient mesh background for the onboarding wizard.
 * Features ambient blurred orbs positioned behind all content.
 */

import type { ReactNode } from "react";

interface OnboardingBackgroundProps {
  readonly children: ReactNode;
}

export const OnboardingBackground = ({ children }: OnboardingBackgroundProps) => (
  <div className="relative min-h-full overflow-hidden">
    {/* Ambient gradient orbs */}
    <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/[0.06] rounded-full blur-3xl pointer-events-none" />
    <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-500/10 dark:bg-violet-500/[0.06] rounded-full blur-3xl pointer-events-none" />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/[0.05] dark:bg-cyan-500/[0.03] rounded-full blur-3xl pointer-events-none" />

    {/* Content */}
    <div className="relative z-10 max-w-lg mx-auto py-8 sm:py-16 px-4">{children}</div>
  </div>
);
