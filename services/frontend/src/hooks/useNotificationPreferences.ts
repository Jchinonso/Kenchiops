/**
 * Notification Preferences Hook
 *
 * Manages user notification preferences persisted in localStorage.
 * Controls whether in-app toast notifications and browser (Notification API)
 * notifications are enabled.
 */

import { useState, useCallback } from "react";

// ==================== Constants ====================

const STORAGE_KEY = "kenchi_notification_prefs";

interface NotificationPreferences {
  readonly toastEnabled: boolean;
  readonly browserEnabled: boolean;
}

const DEFAULTS: NotificationPreferences = {
  toastEnabled: true,
  browserEnabled: false,
};

// ==================== Storage Helpers ====================

const loadPreferences = (): NotificationPreferences => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored
      ? { ...DEFAULTS, ...(JSON.parse(stored) as Partial<NotificationPreferences>) }
      : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
};

const savePreferences = (prefs: NotificationPreferences): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage quota exceeded or unavailable — non-fatal
  }
};

// ==================== Hook ====================

interface UseNotificationPreferencesResult {
  readonly toastEnabled: boolean;
  readonly browserEnabled: boolean;
  readonly setToastEnabled: (enabled: boolean) => void;
  readonly setBrowserEnabled: (enabled: boolean) => Promise<void>;
}

export const useNotificationPreferences = (): UseNotificationPreferencesResult => {
  const [prefs, setPrefs] = useState<NotificationPreferences>(loadPreferences);

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

  return {
    toastEnabled: prefs.toastEnabled,
    browserEnabled: prefs.browserEnabled,
    setToastEnabled,
    setBrowserEnabled,
  };
};
