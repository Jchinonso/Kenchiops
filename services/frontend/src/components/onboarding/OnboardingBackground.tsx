/**
 * Subtle backdrop for the onboarding wizard: dotted grid + single soft accent.
 * Quiet by design so the step content carries attention.
 */

import type { ReactNode } from "react";

interface OnboardingBackgroundProps {
  readonly children: ReactNode;
}

export const OnboardingBackground = ({ children }: OnboardingBackgroundProps) => (
  <div className="relative min-h-full overflow-hidden bg-stone-50 dark:bg-zinc-950">
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none opacity-[0.35] dark:opacity-20 bg-[radial-gradient(circle,_rgb(228_228_231_/_0.7)_1px,_transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_30%,_rgba(0,0,0,0.6),_transparent_80%)] [-webkit-mask-image:radial-gradient(ellipse_80%_60%_at_50%_30%,_rgba(0,0,0,0.6),_transparent_80%)]"
    />

    <div
      aria-hidden="true"
      className="absolute top-[-12rem] left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] rounded-full blur-3xl pointer-events-none bg-indigo-500/[0.07] dark:bg-indigo-500/[0.05]"
    />

    <div className="relative z-10 max-w-xl mx-auto pt-20 pb-12 sm:pt-24 sm:pb-16 px-4">
      {children}
    </div>
  </div>
);
