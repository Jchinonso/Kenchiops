/**
 * Notification Preferences Hook
 *
 * Manages user notification preferences persisted in localStorage.
 * Controls whether in-app toast notifications and browser (Notification API)
 * notifications are enabled.
 */

import { useState, useCallback, useMemo } from "react";
import { loadPreferences, savePreferences } from "./helpers";
import type { UseNotificationPreferencesResult } from "./types";

export const useNotificationPreferences = (): UseNotificationPreferencesResult => {
  const [prefs, setPrefs] = useState(loadPreferences);

  const setToastEnabled = useCallback((enabled: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, toastEnabled: enabled };
      savePreferences(next);
      return next;
    });
  }, []);

  const setBrowserEnabled = useCallback(async (enabled: boolean) => {
    if (enabled && typeof Notification !== "undefined") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        return;
      }
    }
    setPrefs((prev) => {
      const next = { ...prev, browserEnabled: enabled };
      savePreferences(next);
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      toastEnabled: prefs.toastEnabled,
      browserEnabled: prefs.browserEnabled,
      setToastEnabled,
      setBrowserEnabled,
    }),
    [prefs.toastEnabled, prefs.browserEnabled, setToastEnabled, setBrowserEnabled]
  );
};
