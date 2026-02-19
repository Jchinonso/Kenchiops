/**
 * Integration Connections Hook
 *
 * Fetches CI provider connection statuses from the API.
 * Uses the same useFetch pattern as useDashboardData.
 */

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";

// ==================== Types ====================

export interface IntegrationConnection {
  readonly provider: string;
  readonly connected: boolean;
  readonly connectionId: string | null;
  readonly connectionName: string | null;
  readonly connectedAt: string | null;
}

interface FetchState {
  readonly connections: readonly IntegrationConnection[];
  readonly isLoading: boolean;
  readonly error: string | null;
}

interface UseIntegrationConnectionsResult extends FetchState {
  readonly refetch: () => void;
}

// ==================== Hook ====================

export const useIntegrationConnections = (
  refreshKey: number = 0
): UseIntegrationConnectionsResult => {
  const [state, setState] = useState<FetchState>({
    connections: [],
    isLoading: true,
    error: null,
  });

  const [internalRefreshKey, setInternalRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setInternalRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    // let: mutable flag for async cleanup coordination
    let cancelled = false; // let: tracks if effect was cleaned up during async fetch

    const fetchConnections = async () => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await apiClient("/integrations");

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          // let: error message may come from response body or fallback to status text
          let errorMessage = `Request failed (${response.status})`; // let: conditionally updated from response body

          try {
            const errorBody: unknown = await response.json();
            const parsed = errorBody as { readonly error?: { readonly message?: string } };
            if (parsed?.error?.message) {
              errorMessage = parsed.error.message;
            }
          } catch {
            // Response body not parseable as JSON — use default message
          }

          setState({ connections: [], isLoading: false, error: errorMessage });
          return;
        }

        const json: { readonly data: readonly IntegrationConnection[] } = await response.json();
        setState({ connections: json.data, isLoading: false, error: null });
      } catch (caught) {
        if (cancelled) {
          return;
        }
        const message = caught instanceof Error ? caught.message : "Unknown error";
        setState({ connections: [], isLoading: false, error: message });
      }
    };

    void fetchConnections();

    return () => {
      cancelled = true;
    };
  }, [refreshKey, internalRefreshKey]);

  return { ...state, refetch };
};
