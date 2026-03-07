import type { NotificationPreferences } from "./types";

const STORAGE_KEY = "kenchi_notification_prefs";

const DEFAULTS: NotificationPreferences = {
  toastEnabled: true,
  browserEnabled: false,
};

export const loadPreferences = (): NotificationPreferences => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored
      ? { ...DEFAULTS, ...(JSON.parse(stored) as Partial<NotificationPreferences>) }
      : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
};

export const savePreferences = (prefs: NotificationPreferences): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage quota exceeded or unavailable — non-fatal
  }
};
