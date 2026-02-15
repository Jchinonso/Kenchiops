/**
 * Dashboard SSE Hook
 *
 * Connects to the SSE endpoint for real-time dashboard updates.
 * Returns a refreshKey that increments on each event, triggering
 * data refetches in consuming hooks.
 *
 * Uses the browser's native EventSource API with automatic reconnection.
 * Cookies are sent automatically for same-origin requests (cookie-based auth).
 */

import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const SSE_ENDPOINT = `${API_URL}/api/v1/dashboard/events/stream`;

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

    const incrementKey = () => {
      setRefreshKey((prev) => prev + 1);
    };

    eventSource.addEventListener("new_failure", incrementKey);
    eventSource.addEventListener("analysis_complete", incrementKey);

    return () => {
      eventSource.removeEventListener("new_failure", incrementKey);
      eventSource.removeEventListener("analysis_complete", incrementKey);
      eventSource.close();
    };
  }, []);

  return { refreshKey };
};
