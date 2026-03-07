export interface NotificationPreferences {
  readonly toastEnabled: boolean;
  readonly browserEnabled: boolean;
}

export interface UseNotificationPreferencesResult {
  readonly toastEnabled: boolean;
  readonly browserEnabled: boolean;
  readonly setToastEnabled: (enabled: boolean) => void;
  readonly setBrowserEnabled: (enabled: boolean) => Promise<void>;
}
