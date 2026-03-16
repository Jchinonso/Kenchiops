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
import {
  TOAST_MESSAGES,
  SHOW_DURATION_MS,
  HIDE_DURATION_MS,
  INITIAL_DELAY_MS,
  REDUCED_MOTION_QUERY,
} from "./constants";

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
        "bg-white dark:bg-zinc-900 rounded-xl shadow-lg dark:shadow-2xl",
        "border border-zinc-200 dark:border-zinc-800",
        "px-4 py-3 flex items-start gap-3",
        "transition-all duration-500",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{message.company}</span>{" "}
          {message.action}
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
        className="flex-shrink-0 p-0.5 text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors rounded"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};
