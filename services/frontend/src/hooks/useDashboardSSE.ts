/**
 * Dashboard SSE Hook
 *
 * Connects to the SSE endpoint for real-time dashboard updates.
 * Invalidates specific TanStack Query keys on each event so cached
 * data is automatically refetched by consuming hooks.
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
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { useAuth } from "@/hooks/useAuth";
import { apiClient, API_URL } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queryKeys";

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

/** Debounce window for batching rapid SSE events into a single query invalidation. */
const REFRESH_DEBOUNCE_MS = 2_000;

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

interface InvestigationStatusChangedPayload {
  readonly type: string;
  readonly investigationId?: string;
  readonly status?: string;
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
  readonly notifications: readonly DashboardNotification[];
  readonly markAllRead: () => void;
  readonly markAsRead: (id: string) => void;
  readonly dismissNotification: (id: string) => void;
}

/**
 * Subscribe to real-time dashboard events via SSE.
 *
 * Invalidates relevant TanStack Query keys on each event so consuming
 * hooks automatically refetch stale data.
 *
 * @returns notifications — accumulated notification history from SSE events
 * @returns markAllRead — marks all notifications as read
 */
export const useDashboardSSE = (): UseDashboardSSEResult => {
  const { user, refreshUser, switchOrganization } = useAuth();
  const queryClient = useQueryClient();
  const storageKey = buildNotificationStorageKey(user?.tenantId);

  // Debounce query invalidation so rapid SSE events (e.g. multiple
  // check runs finishing together) trigger only a single invalidation wave.
  // Keys are accumulated across calls within the debounce window so that
  // back-to-back events (e.g. new_failure then analysis_complete) don't
  // drop the first event's keys when the timer resets.
  const invalidationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKeysRef = useRef<Map<string, readonly unknown[]>>(new Map());

  const debouncedInvalidate = useCallback(
    (keys: ReadonlyArray<readonly unknown[]>) => {
      // Accumulate keys in a Map keyed by serialized form for dedup,
      // storing the original key to avoid a JSON.parse roundtrip.
      keys.forEach((key) => {
        pendingKeysRef.current.set(JSON.stringify(key), key);
      });

      if (invalidationTimerRef.current) {
        clearTimeout(invalidationTimerRef.current);
      }

      const timerId = setTimeout(() => {
        const keysToInvalidate = [...pendingKeysRef.current.values()];
        pendingKeysRef.current.clear();
        keysToInvalidate.forEach((queryKey) => {
          void queryClient.invalidateQueries({ queryKey });
        });
        invalidationTimerRef.current = null;
      }, REFRESH_DEBOUNCE_MS);
      invalidationTimerRef.current = timerId;
    },
    [queryClient]
  );

  const [notifications, setNotifications] = useState<readonly DashboardNotification[]>(() =>
    loadNotifications(storageKey)
  );
  const { toastEnabled, browserEnabled } = useNotificationPreferences();
  const toastEnabledRef = useRef(toastEnabled);
  const browserEnabledRef = useRef(browserEnabled);
  const refreshUserRef = useRef(refreshUser);
  const switchOrgRef = useRef(switchOrganization);
  const currentTenantIdRef = useRef(user?.tenantId);

  // Reload notifications when tenant changes (org switch)
  useEffect(() => {
    setNotifications(loadNotifications(storageKey));
  }, [storageKey]);

  useEffect(() => {
    toastEnabledRef.current = toastEnabled;
  }, [toastEnabled]);
  useEffect(() => {
    browserEnabledRef.current = browserEnabled;
  }, [browserEnabled]);
  useEffect(() => {
    refreshUserRef.current = refreshUser;
  }, [refreshUser]);
  useEffect(() => {
    switchOrgRef.current = switchOrganization;
  }, [switchOrganization]);
  useEffect(() => {
    currentTenantIdRef.current = user?.tenantId;
  }, [user?.tenantId]);

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
    const INITIAL_BACKOFF_MS = 1_000;
    const MAX_BACKOFF_MS = 30_000;
    const HEARTBEAT_TIMEOUT_MS = 45_000;
    const JITTER_FACTOR = 0.6; // ±30% of current delay

    // let: mutable reconnection state managed across connect/disconnect cycles
    let backoffMs = INITIAL_BACKOFF_MS; // let: reset on successful connection
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null; // let: cleared on cleanup
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null; // let: reset on each event
    let eventSource: EventSource | null = null; // let: recreated on reconnect
    let disposed = false; // let: set true on cleanup to prevent reconnection after unmount

    // -- Notification helper (stable across reconnects) --

    const addNotification = (notification: DashboardNotification): void => {
      setNotifications((prev) => {
        const next = [notification, ...prev].slice(0, NOTIFICATION_CONFIG.maxItems);
        saveNotifications(storageKey, next);
        return next;
      });
    };

    // -- Event handlers (stable across reconnects) --

    const handleNewFailure = (event: MessageEvent): void => {
      debouncedInvalidate([
        queryKeys.dashboard.failures.all(),
        queryKeys.dashboard.stats(),
        queryKeys.incidents.all,
      ]);

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

    const handleAnalysisComplete = (event: MessageEvent): void => {
      debouncedInvalidate([
        queryKeys.dashboard.analyses.all(),
        queryKeys.dashboard.stats(),
        queryKeys.dashboard.confidence.all(),
      ]);

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

    const handleNewIncident = (event: MessageEvent): void => {
      debouncedInvalidate([queryKeys.incidents.all]);

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

    const handleIncidentTriaged = (event: MessageEvent): void => {
      debouncedInvalidate([queryKeys.incidents.all]);

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

    const handleInvestigationStatusChanged = (event: MessageEvent): void => {
      const data = parseEventData<InvestigationStatusChangedPayload>(event);

      // Invalidate the investigation list and, if available, the specific detail query.
      const keysToInvalidate: ReadonlyArray<readonly unknown[]> = data?.investigationId
        ? [queryKeys.investigations.all, queryKeys.investigations.detail(data.investigationId)]
        : [queryKeys.investigations.all];

      debouncedInvalidate(keysToInvalidate);
    };

    const handleOrganizationUpdated = (event: MessageEvent): void => {
      const data = parseEventData<{
        installedTenantId?: string;
        uninstalledTenantId?: string;
      }>(event);

      // Defer query invalidation until AFTER auth operations complete.
      // Firing it immediately causes simultaneous dashboard re-fetches
      // that, combined with refresh-orgs, burst past the rate limiter and
      // can block even the token-refresh request (429 -> forced logout).
      void (async () => {
        try {
          await apiClient("/auth/refresh-orgs", { method: "POST", backgroundRetry: true });
        } catch (error) {
          // Best-effort — org list refresh will happen on next navigation
          void error; // best-effort — org list refresh will happen on next navigation
        }

        // Auto-switch to the installed org if it differs from the current tenant.
        if (data?.installedTenantId && data.installedTenantId !== currentTenantIdRef.current) {
          try {
            await switchOrgRef.current(data.installedTenantId);
          } catch (error) {
            // Best-effort — user can manually switch via org selector
            void error; // best-effort — user can manually switch via org selector
          }
        } else {
          // Refresh user state to pick up org list changes (install or uninstall).
          // For uninstalls, refreshUser re-reads /auth/me which reflects the
          // updated org list and selected tenant from the server.
          try {
            await refreshUserRef.current();
          } catch (error) {
            // Best-effort — stale user state is acceptable; next navigation refreshes
            void error; // best-effort — stale user state is acceptable; next navigation refreshes
          }
        }

        // Invalidate all dashboard and related queries AFTER auth state is settled.
        // Use immediate invalidation (not debounced) since the auth refresh above
        // already introduces sufficient delay.
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.team.all });
      })();
    };

    // -- Reconnection helpers --

    const resetHeartbeat = (): void => {
      if (heartbeatTimer) {clearTimeout(heartbeatTimer);}
      heartbeatTimer = setTimeout(() => {
        // No events received for 45s -- connection likely dropped silently.
        // Close and trigger reconnection via scheduleReconnect.
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        scheduleReconnect();
      }, HEARTBEAT_TIMEOUT_MS);
    };

    const scheduleReconnect = (): void => {
      if (disposed) {return;}
      // Jitter: +-30% of current delay to desynchronize reconnection across tabs
      const jitter = (Math.random() - 0.5) * JITTER_FACTOR * backoffMs;
      const delay = Math.max(0, backoffMs + jitter);
      reconnectTimer = setTimeout(() => {
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        connect();
      }, delay);
    };

    /** Wraps an event handler to reset the heartbeat timer on each received event. */
    const withHeartbeat =
      (handler: (event: MessageEvent) => void): ((event: MessageEvent) => void) =>
      (event: MessageEvent) => {
        resetHeartbeat();
        handler(event);
      };

    // -- Connection lifecycle --

    const connect = (): void => {
      if (disposed) {return;}

      const source = new EventSource(SSE_ENDPOINT, { withCredentials: true });
      eventSource = source;

      source.addEventListener("open", () => {
        backoffMs = INITIAL_BACKOFF_MS; // Reset backoff on successful connection
        resetHeartbeat();
      });

      source.addEventListener("error", () => {
        if (disposed) {return;}
        // Guard: if eventSource was already nulled (heartbeat timeout handled it),
        // skip to prevent double reconnection.
        if (eventSource !== source) {return;}
        source.close();
        eventSource = null;
        if (heartbeatTimer) {clearTimeout(heartbeatTimer);}
        scheduleReconnect();
      });

      // Attach event handlers wrapped with heartbeat reset
      source.addEventListener("new_failure", withHeartbeat(handleNewFailure));
      source.addEventListener("analysis_complete", withHeartbeat(handleAnalysisComplete));
      source.addEventListener("new_incident", withHeartbeat(handleNewIncident));
      source.addEventListener("incident_triaged", withHeartbeat(handleIncidentTriaged));
      source.addEventListener(
        "investigation_status_changed",
        withHeartbeat(handleInvestigationStatusChanged)
      );
      source.addEventListener("organization_updated", withHeartbeat(handleOrganizationUpdated));
    };

    connect();

    return () => {
      disposed = true;
      // Clear invalidation timer first to prevent firing during cleanup
      if (invalidationTimerRef.current) {
        clearTimeout(invalidationTimerRef.current);
        invalidationTimerRef.current = null;
      }
      // Copy ref to local var — ref.current may change by cleanup time
      const pendingKeys = pendingKeysRef.current;
      pendingKeys.clear();
      if (reconnectTimer) {clearTimeout(reconnectTimer);}
      if (heartbeatTimer) {clearTimeout(heartbeatTimer);}
      if (eventSource) {eventSource.close();}
    };
  }, [storageKey, debouncedInvalidate, queryClient]);

  return { notifications, markAllRead, markAsRead, dismissNotification };
};
