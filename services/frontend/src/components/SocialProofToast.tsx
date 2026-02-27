/**
 * Social Proof Toast
 *
 * Rotating notification widget that shows recent activity to build
 * trust and create urgency. Dismissible per session.
 * Skipped entirely when prefers-reduced-motion is enabled.
 */

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToastMessage {
  readonly company: string;
  readonly action: string;
  readonly time: string;
}

const TOAST_MESSAGES: readonly ToastMessage[] = [
  { company: "FastShip", action: "resolved a CI failure in", time: "23s" },
  { company: "Acme Corp", action: "fixed a test suite timeout in", time: "47s" },
  { company: "ScaleOps", action: "started a 14-day trial", time: "" },
  { company: "BuildFast", action: "diagnosed a Docker build issue in", time: "38s" },
  { company: "DeployHQ", action: "identified a dependency conflict in", time: "1m 12s" },
] as const;

const SHOW_DURATION_MS = 4000;
const HIDE_DURATION_MS = 8000;
const INITIAL_DELAY_MS = 5000;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export const SocialProofToast = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (isDismissed) {
      return;
    }
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      return;
    }

    // let: timer handle reassigned as each phase schedules the next
    let timer: ReturnType<typeof setTimeout>; // let: chained timeout rotation
    // let: active flag set to false on cleanup to stop the chain
    let active = true; // let: cleanup guard for async timer chain

    const showNext = (index: number) => {
      if (!active) {
        return;
      }
      setCurrentIndex(index);
      setIsVisible(true);

      timer = setTimeout(() => {
        if (!active) {
          return;
        }
        setIsVisible(false);

        timer = setTimeout(() => {
          if (!active) {
            return;
          }
          showNext((index + 1) % TOAST_MESSAGES.length);
        }, HIDE_DURATION_MS);
      }, SHOW_DURATION_MS);
    };

    timer = setTimeout(() => showNext(0), INITIAL_DELAY_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isDismissed]);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    setIsVisible(false);
  }, []);

  if (isDismissed) {
    return null;
  }

  const message = TOAST_MESSAGES[currentIndex];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "fixed bottom-6 left-6 z-40 max-w-xs",
        "bg-zinc-900 rounded-xl shadow-2xl",
        "border border-zinc-800",
        "px-4 py-3 flex items-start gap-3",
        "transition-all duration-500",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-400">
          <span className="font-semibold text-zinc-200">{message.company}</span> {message.action}
          {message.time && (
            <>
              {" "}
              <span className="text-amber-500 font-medium">{message.time}</span>
            </>
          )}
        </p>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        className="flex-shrink-0 p-0.5 text-zinc-600 hover:text-zinc-300 transition-colors rounded"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};
