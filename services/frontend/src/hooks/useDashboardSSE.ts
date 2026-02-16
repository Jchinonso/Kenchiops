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

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const SSE_ENDPOINT = `${API_URL}/api/v1/dashboard/events/stream`;

// ==================== Notification Types ====================

export interface DashboardNotification {
  readonly id: string;
  readonly type: "failure" | "analysis_complete";
  readonly title: string;
  readonly description: string;
  readonly timestamp: string;
  readonly read: boolean;
  readonly analysisId?: string;
  readonly repository?: string;
}

/** Configuration for notification storage */
const NOTIFICATION_CONFIG = {
  maxItems: 50,
  sessionStorageKey: "kenchi_notifications",
} as const;

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

// ==================== Session Storage Helpers ====================

const loadNotifications = (): readonly DashboardNotification[] => {
  try {
    const stored = sessionStorage.getItem(NOTIFICATION_CONFIG.sessionStorageKey);
    return stored ? (JSON.parse(stored) as readonly DashboardNotification[]) : [];
  } catch {
    return [];
  }
};

const saveNotifications = (notifications: readonly DashboardNotification[]): void => {
  try {
    sessionStorage.setItem(NOTIFICATION_CONFIG.sessionStorageKey, JSON.stringify(notifications));
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

// ==================== Hook ====================

interface UseDashboardSSEResult {
  readonly refreshKey: number;
  readonly notifications: readonly DashboardNotification[];
  readonly markAllRead: () => void;
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [notifications, setNotifications] =
    useState<readonly DashboardNotification[]>(loadNotifications);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((notification) =>
        notification.read ? notification : { ...notification, read: true }
      );
      saveNotifications(next);
      return next;
    });
  }, []);

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
        saveNotifications(next);
        return next;
      });
    };

    const handleNewFailure = (event: MessageEvent) => {
      setRefreshKey((prev) => prev + 1);

      const data = parseEventData<NewFailurePayload>(event);
      if (data) {
        const repo = data.repository ?? "Unknown repository";
        const checkName = data.checkName ? ` (${data.checkName})` : "";
        toast.error(`CI failure in ${repo}${checkName}`, {
          description: "Kenchi is analyzing the failure...",
        });

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
        toast.success(`Analysis complete for ${repo}${confidence}`);

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

    eventSource.addEventListener("new_failure", handleNewFailure);
    eventSource.addEventListener("analysis_complete", handleAnalysisComplete);

    return () => {
      eventSource.removeEventListener("new_failure", handleNewFailure);
      eventSource.removeEventListener("analysis_complete", handleAnalysisComplete);
      eventSource.close();
    };
  }, []);

  return { refreshKey, notifications, markAllRead };
};
