/**
 * Shared Data Fetching Hook
 *
 * Generic useFetch<T> hook with loading/error states, cancellation, and refetch.
 * Shared across useDashboardData.ts, useIncidentData.ts, and useInvestigationData.ts.
 */

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";

// ==================== Types ====================

export interface FetchState<T> {
  readonly data: T | null;
  readonly isLoading: boolean;
  readonly error: string | null;
}

export interface UseFetchResult<T> extends FetchState<T> {
  readonly refetch: () => void;
}

interface MutationState {
  readonly isLoading: boolean;
  readonly error: string | null;
}

export type { MutationState };

// ==================== Helpers ====================

/** Truncate error messages to prevent internal details from leaking to the UI */
export const sanitizeErrorMessage = (message: string): string =>
  message.length > 200 ? `${message.slice(0, 200)}...` : message;

/** Safely parse an error message from an API response body, truncated for display safety */
export const parseErrorBody = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body: unknown = await response.json();
    const parsed = body as { readonly error?: { readonly message?: string } } | null;
    return sanitizeErrorMessage(parsed?.error?.message ?? fallback);
  } catch {
    return sanitizeErrorMessage(fallback);
  }
};

// ==================== Generic Fetch Hook ====================

/**
 * Generic data-fetching hook with loading/error states and cancellation.
 * When path is empty, returns idle state without fetching.
 */
export const useFetch = <T>(path: string, depsKey: string = ""): UseFetchResult<T> => {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    isLoading: true,
    error: null,
  });

  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!path) {
      return;
    }

    // let: mutable flag for async cleanup coordination
    let cancelled = false; // let: tracks if effect was cleaned up during async fetch

    const fetchData = async () => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await apiClient(path);

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

          setState({ data: null, isLoading: false, error: sanitizeErrorMessage(errorMessage) });
          return;
        }

        const json: { readonly data: T } = await response.json();
        setState({ data: json.data, isLoading: false, error: null });
      } catch (caught) {
        if (cancelled) {
          return;
        }
        const message = caught instanceof Error ? caught.message : "Unknown error";
        setState({ data: null, isLoading: false, error: sanitizeErrorMessage(message) });
      }
    };

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [path, refreshKey, depsKey]);

  // Derive final state: when path is empty, override to idle
  const resolvedState: FetchState<T> = path ? state : { data: null, isLoading: false, error: null };

  return { ...resolvedState, refetch };
};
