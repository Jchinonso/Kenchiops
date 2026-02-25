/**
 * Dashboard SSE Hook
 *
 * Connects to the SSE endpoint for real-time dashboard updates.
 * Returns a refreshKey that increments on each event, triggering
 * data refetches in consuming hooks.
 *
 * Fires toast notifications via sonner for user awareness:
 * - Error toast for new CI failures
 * - Success toast for completed analyses
 *
 * Stores notification history for the bell dropdown, persisted
 * via sessionStorage for page refresh survival.
 *
 * Uses the browser's native EventSource API with automatic reconnection.
 * Cookies are sent automatically for same-origin requests (cookie-based auth).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { useAuth } from "@/hooks/useAuth";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const SSE_ENDPOINT = `${API_URL}/api/v1/dashboard/events/stream`;

// ==================== Notification Types ====================

export interface DashboardNotification {
  readonly id: string;
  readonly type: "failure" | "analysis_complete" | "new_incident" | "incident_triaged";
  readonly title: string;
  readonly description: string;
  readonly timestamp: string;
  readonly read: boolean;
  readonly analysisId?: string;
  readonly repository?: string;
  readonly severity?: string;
  readonly source?: string;
}

/** Configuration for notification storage */
const NOTIFICATION_CONFIG = {
  maxItems: 50,
  sessionStorageKeyPrefix: "kenchi_notifications",
} as const;

/** Build a tenant-scoped sessionStorage key */
const buildNotificationStorageKey = (tenantId?: string | null): string =>
  tenantId
    ? `${NOTIFICATION_CONFIG.sessionStorageKeyPrefix}_${tenantId}`
    : NOTIFICATION_CONFIG.sessionStorageKeyPrefix;

// ==================== SSE Payload Types ====================

interface NewFailurePayload {
  readonly type: string;
  readonly repository?: string;
  readonly checkName?: string;
  readonly commitSha?: string;
}

interface AnalysisCompletePayload {
  readonly type: string;
  readonly repository?: string;
  readonly analysisId?: string;
  readonly confidence?: number;
}

interface NewIncidentPayload {
  readonly type: string;
  readonly source?: string;
  readonly title?: string;
  readonly severity?: string;
  readonly serviceName?: string;
}

interface IncidentTriagedPayload {
  readonly type: string;
  readonly alertId?: string;
  readonly severity?: string;
  readonly title?: string;
  readonly aiSummary?: string;
}

// ==================== Session Storage Helpers ====================

const loadNotifications = (storageKey: string): readonly DashboardNotification[] => {
  try {
    const stored = sessionStorage.getItem(storageKey);
    return stored ? (JSON.parse(stored) as readonly DashboardNotification[]) : [];
  } catch {
    return [];
  }
};

const saveNotifications = (
  storageKey: string,
  notifications: readonly DashboardNotification[]
): void => {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(notifications));
  } catch {
    // sessionStorage quota exceeded or unavailable — non-fatal
  }
};

// ==================== Helpers ====================

const parseEventData = <T>(event: MessageEvent): T | null => {
  try {
    return JSON.parse(event.data as string) as T;
  } catch {
    return null;
  }
};

const formatConfidence = (confidence: number): string => `${Math.round(confidence * 100)}%`;

/** Show a browser notification if the Notification API is available and permission is granted */
const showBrowserNotification = (title: string, body: string): void => {
  if (typeof Notification === "undefined") {
    return;
  }
  if (Notification.permission !== "granted") {
    return;
  }
  // eslint-disable-next-line no-new -- Notification constructor fires side effect by design
  new Notification(title, { body });
};

// ==================== Hook ====================

interface UseDashboardSSEResult {
  readonly refreshKey: number;
  readonly notifications: readonly DashboardNotification[];
  readonly markAllRead: () => void;
  readonly markAsRead: (id: string) => void;
  readonly dismissNotification: (id: string) => void;
}

/**
 * Subscribe to real-time dashboard events via SSE.
 *
 * @returns refreshKey — increments on each SSE event, use as a dependency
 *   in data hooks to trigger refetches
 * @returns notifications — accumulated notification history from SSE events
 * @returns markAllRead — marks all notifications as read
 */
export const useDashboardSSE = (): UseDashboardSSEResult => {
  const { user } = useAuth();
  const storageKey = buildNotificationStorageKey(user?.tenantId);

  const [refreshKey, setRefreshKey] = useState(0);
  const [notifications, setNotifications] = useState<readonly DashboardNotification[]>(() =>
    loadNotifications(storageKey)
  );
  const { toastEnabled, browserEnabled } = useNotificationPreferences();
  const toastEnabledRef = useRef(toastEnabled);
  const browserEnabledRef = useRef(browserEnabled);

  // Reload notifications when tenant changes (org switch)
  useEffect(() => {
    setNotifications(loadNotifications(storageKey));
  }, [storageKey]);

  useEffect(() => {
    Object.assign(toastEnabledRef, { current: toastEnabled });
  }, [toastEnabled]);
  useEffect(() => {
    Object.assign(browserEnabledRef, { current: browserEnabled });
  }, [browserEnabled]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((item) => (item.read ? item : { ...item, read: true }));
      saveNotifications(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const markAsRead = useCallback(
    (targetId: string) => {
      setNotifications((prev) => {
        const next = prev.map((item) => {
          const { id } = item;
          return id === targetId ? { ...item, read: true } : item;
        });
        saveNotifications(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const dismissNotification = useCallback(
    (targetId: string) => {
      setNotifications((prev) => {
        const next = prev.filter((item) => {
          const { id } = item;
          return id !== targetId;
        });
        saveNotifications(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  useEffect(() => {
    const eventSource = new EventSource(SSE_ENDPOINT, {
      withCredentials: true,
    });

    // EventSource auto-reconnects on error; listener for debugging only
    eventSource.addEventListener("error", () => {
      // Browser will auto-reconnect; no action needed
    });

    const addNotification = (notification: DashboardNotification): void => {
      setNotifications((prev) => {
        const next = [notification, ...prev].slice(0, NOTIFICATION_CONFIG.maxItems);
        saveNotifications(storageKey, next);
        return next;
      });
    };

    const handleNewFailure = (event: MessageEvent) => {
      setRefreshKey((prev) => prev + 1);

      const data = parseEventData<NewFailurePayload>(event);
      if (data) {
        const repo = data.repository ?? "Unknown repository";
        const checkName = data.checkName ? ` (${data.checkName})` : "";
        const failureTitle = `CI failure in ${repo}${checkName}`;
        const failureBody = "Kenchi is analyzing the failure...";
        if (toastEnabledRef.current) {
          toast.error(failureTitle, { description: failureBody });
        }
        if (browserEnabledRef.current) {
          showBrowserNotification(failureTitle, failureBody);
        }

        addNotification({
          id: crypto.randomUUID(),
          type: "failure",
          title: `CI failure in ${repo}`,
          description: data.checkName ? `Check "${data.checkName}" failed` : "A CI/CD check failed",
          timestamp: new Date().toISOString(),
          read: false,
          repository: data.repository,
        });
      }
    };

    const handleAnalysisComplete = (event: MessageEvent) => {
      setRefreshKey((prev) => prev + 1);

      const data = parseEventData<AnalysisCompletePayload>(event);
      if (data) {
        const repo = data.repository ?? "Unknown repository";
        const confidence = data.confidence
          ? ` \u2014 ${formatConfidence(data.confidence)} confidence`
          : "";
        const analysisTitle = `Analysis complete for ${repo}${confidence}`;
        if (toastEnabledRef.current) {
          toast.success(analysisTitle);
        }
        if (browserEnabledRef.current) {
          showBrowserNotification(analysisTitle, "Root cause analysis finished");
        }

        addNotification({
          id: crypto.randomUUID(),
          type: "analysis_complete",
          title: `Analysis complete for ${repo}`,
          description: data.confidence
            ? `Diagnosis confidence: ${formatConfidence(data.confidence)}`
            : "Root cause analysis finished",
          timestamp: new Date().toISOString(),
          read: false,
          analysisId: data.analysisId,
          repository: data.repository,
        });
      }
    };

    const handleNewIncident = (event: MessageEvent) => {
      setRefreshKey((prev) => prev + 1);

      const data = parseEventData<NewIncidentPayload>(event);
      if (data) {
        const source = data.source ?? "unknown";
        const severity = data.severity ?? "unknown";
        const title = data.title ?? "New incident alert";
        const incidentTitle = `${severity.toUpperCase()} alert from ${source}`;
        const incidentBody = title;
        if (toastEnabledRef.current) {
          toast.error(incidentTitle, { description: incidentBody });
        }
        if (browserEnabledRef.current) {
          showBrowserNotification(incidentTitle, incidentBody);
        }

        addNotification({
          id: crypto.randomUUID(),
          type: "new_incident",
          title: incidentTitle,
          description: title,
          timestamp: new Date().toISOString(),
          read: false,
          severity,
          source,
        });
      }
    };

    const handleIncidentTriaged = (event: MessageEvent) => {
      setRefreshKey((prev) => prev + 1);

      const data = parseEventData<IncidentTriagedPayload>(event);
      if (data) {
        const title = data.title ?? "Incident";
        const headline = data.aiSummary ?? "Triage complete";
        const triagedTitle = `Triage complete: ${title}`;
        if (toastEnabledRef.current) {
          toast.info(triagedTitle, { description: headline });
        }
        if (browserEnabledRef.current) {
          showBrowserNotification(triagedTitle, headline);
        }

        addNotification({
          id: crypto.randomUUID(),
          type: "incident_triaged",
          title: triagedTitle,
          description: headline,
          timestamp: new Date().toISOString(),
          read: false,
          severity: data.severity,
        });
      }
    };

    eventSource.addEventListener("new_failure", handleNewFailure);
    eventSource.addEventListener("analysis_complete", handleAnalysisComplete);
    eventSource.addEventListener("new_incident", handleNewIncident);
    eventSource.addEventListener("incident_triaged", handleIncidentTriaged);

    return () => {
      eventSource.removeEventListener("new_failure", handleNewFailure);
      eventSource.removeEventListener("analysis_complete", handleAnalysisComplete);
      eventSource.removeEventListener("new_incident", handleNewIncident);
      eventSource.removeEventListener("incident_triaged", handleIncidentTriaged);
      eventSource.close();
    };
  }, [storageKey]);

  return { refreshKey, notifications, markAllRead, markAsRead, dismissNotification };
};
