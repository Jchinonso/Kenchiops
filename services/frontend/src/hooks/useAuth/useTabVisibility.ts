import { useEffect } from "react";
import { apiClient } from "@/lib/apiClient";

const DEBOUNCE_MS = 5_000;

/**
 * Re-discovers organizations when the browser tab regains focus.
 * Handles the case where the user installs a GitHub/GitLab app in another
 * tab and returns -- the webhook may have created a new tenant while the
 * tab was hidden. Debounced to avoid hammering the API on rapid tab switches.
 */
export const useTabVisibility = (
  isAuthenticated: boolean,
  refreshUser: () => Promise<void>
): void => {
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // let: timestamp updated on each visibility change to enforce debounce
    let lastRefreshAt = 0;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const now = Date.now();
      if (now - lastRefreshAt < DEBOUNCE_MS) {
        return;
      }
      lastRefreshAt = now;

      void (async () => {
        try {
          await apiClient("/auth/refresh-orgs", { method: "POST", backgroundRetry: true });
        } catch {
          // Best-effort -- refreshUser below still runs
        }
        try {
          await refreshUser();
        } catch {
          // Best-effort -- stale user state is acceptable; next navigation refreshes
        }
      })();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isAuthenticated, refreshUser]);
};
