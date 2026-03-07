import { useEffect } from "react";
import { toast } from "sonner";
import { IDLE_TIMEOUT_MS, ACTIVITY_EVENTS } from "./constants";

/**
 * Auto-logout after 30 minutes of inactivity (SOC 2 compliance).
 * Attaches activity event listeners that reset the countdown.
 * Skips installation when no user is authenticated.
 */
export const useIdleTimeout = (user: unknown | null, logout: () => Promise<void>): void => {
  useEffect(() => {
    if (user === null) {
      return;
    }

    const scheduleTimeout = (): ReturnType<typeof setTimeout> =>
      setTimeout(() => {
        toast.info("Session expired due to inactivity.");
        void logout();
      }, IDLE_TIMEOUT_MS);

    // let: timer ID reassigned on each user activity event to reset the countdown
    let timerId = scheduleTimeout();

    const resetTimer = () => {
      clearTimeout(timerId);
      timerId = scheduleTimeout();
    };

    ACTIVITY_EVENTS.forEach((event) =>
      document.addEventListener(event, resetTimer, { passive: true })
    );

    return () => {
      clearTimeout(timerId);
      ACTIVITY_EVENTS.forEach((event) => document.removeEventListener(event, resetTimer));
    };
  }, [user, logout]);
};
