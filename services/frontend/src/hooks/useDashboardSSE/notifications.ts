import type { DashboardNotification } from "./types";

/** Configuration for notification storage */
export const NOTIFICATION_CONFIG = {
  maxItems: 50,
  sessionStorageKeyPrefix: "kenchi_notifications",
} as const;

/** Build a tenant-scoped sessionStorage key */
export const buildNotificationStorageKey = (tenantId?: string | null): string =>
  tenantId
    ? `${NOTIFICATION_CONFIG.sessionStorageKeyPrefix}_${tenantId}`
    : NOTIFICATION_CONFIG.sessionStorageKeyPrefix;

export const loadNotifications = (storageKey: string): readonly DashboardNotification[] => {
  try {
    const stored = sessionStorage.getItem(storageKey);
    return stored ? (JSON.parse(stored) as readonly DashboardNotification[]) : [];
  } catch {
    return [];
  }
};

export const saveNotifications = (
  storageKey: string,
  notifications: readonly DashboardNotification[]
): void => {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(notifications));
  } catch {
    // sessionStorage quota exceeded or unavailable -- non-fatal
  }
};
