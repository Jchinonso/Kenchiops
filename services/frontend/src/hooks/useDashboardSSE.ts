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
 * Uses the browser's native EventSource API with automatic reconnection.
 * Cookies are sent automatically for same-origin requests (cookie-based auth).
 */

import { useState, useEffect } from "react";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const SSE_ENDPOINT = `${API_URL}/api/v1/dashboard/events/stream`;

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

/**
 * Subscribe to real-time dashboard events via SSE.
 *
 * @returns refreshKey — increments on each SSE event, use as a dependency
 *   in data hooks to trigger refetches
 */
export const useDashboardSSE = (): { readonly refreshKey: number } => {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const eventSource = new EventSource(SSE_ENDPOINT, {
      withCredentials: true,
    });

    const handleNewFailure = (event: MessageEvent) => {
      setRefreshKey((prev) => prev + 1);

      const data = parseEventData<NewFailurePayload>(event);
      if (data) {
        const repo = data.repository ?? "Unknown repository";
        const checkName = data.checkName ? ` (${data.checkName})` : "";
        toast.error(`CI failure in ${repo}${checkName}`, {
          description: "Kenchi is analyzing the failure...",
        });
      }
    };

    const handleAnalysisComplete = (event: MessageEvent) => {
      setRefreshKey((prev) => prev + 1);

      const data = parseEventData<AnalysisCompletePayload>(event);
      if (data) {
        const repo = data.repository ?? "Unknown repository";
        const confidence = data.confidence
          ? ` — ${formatConfidence(data.confidence)} confidence`
          : "";
        toast.success(`Analysis complete for ${repo}${confidence}`);
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

  return { refreshKey };
};
