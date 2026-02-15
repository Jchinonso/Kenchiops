/**
 * Dashboard Data Hooks
 *
 * Custom hooks for fetching CI/CD dashboard data from the API.
 * Uses native fetch via apiClient with useState/useEffect.
 */

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";

// ==================== Types ====================

interface FetchState<T> {
  readonly data: T | null;
  readonly isLoading: boolean;
  readonly error: string | null;
}

interface UseFetchResult<T> extends FetchState<T> {
  readonly refetch: () => void;
}

interface TenantInfo {
  readonly id: string;
  readonly githubOrg: string;
  readonly githubConnected: boolean;
  readonly slackConnected: boolean;
  readonly status: string;
}

interface DashboardStats {
  readonly totalAnalyses: number;
  readonly totalFailures: number;
  readonly connectedRepos: number;
}

interface InstallationRepository {
  readonly id: number;
  readonly name: string;
  readonly fullName: string;
  readonly isPrivate: boolean;
  readonly defaultBranch: string;
}

interface EventRecord {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly severity: string | null;
  readonly timestamp: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly tenantId: string | null;
  readonly createdAt: string;
}

interface AnalysisRecord {
  readonly id: string;
  readonly eventId: string | null;
  readonly summary: string;
  readonly identifiedCause: string | null;
  readonly diagnosisConfidence: number;
  readonly actionConfidence: number | null;
  readonly confidenceSignals: Readonly<Record<string, unknown>> | null;
  readonly recommendedActions: readonly string[] | null;
  readonly fullAnalysis: Readonly<Record<string, unknown>>;
  readonly tenantId: string | null;
  readonly modelVersionId: string | null;
  readonly aggregationKey: string | null;
  readonly createdAt: string;
}

interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

// ==================== Generic Fetch Hook ====================

/**
 * Generic data-fetching hook with loading/error states and abort handling.
 */
const useFetch = <T>(path: string, depsKey: string = ""): UseFetchResult<T> => {
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
    const controller = new AbortController();
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

          setState({ data: null, isLoading: false, error: errorMessage });
          return;
        }

        const json: { readonly data: T } = await response.json();
        setState({ data: json.data, isLoading: false, error: null });
      } catch (caught) {
        if (cancelled) {
          return;
        }
        const message = caught instanceof Error ? caught.message : "Unknown error";
        setState({ data: null, isLoading: false, error: message });
      }
    };

    void fetchData();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [path, refreshKey, depsKey]);

  return { ...state, refetch };
};

// ==================== Typed Hooks ====================

export const useTenantInfo = (): UseFetchResult<TenantInfo> =>
  useFetch<TenantInfo>("/api/v1/dashboard/tenant");

export const useDashboardStats = (): UseFetchResult<DashboardStats> =>
  useFetch<DashboardStats>("/api/v1/dashboard/stats");

export const useRepositories = (): UseFetchResult<readonly InstallationRepository[]> =>
  useFetch<readonly InstallationRepository[]>("/api/v1/dashboard/repositories");

export const useAnalyses = (
  limit: number = 20,
  offset: number = 0
): UseFetchResult<PaginatedResult<AnalysisRecord>> =>
  useFetch<PaginatedResult<AnalysisRecord>>(
    `/api/v1/dashboard/analyses?limit=${limit}&offset=${offset}`,
    `${limit}:${offset}`
  );

export const useFailures = (
  limit: number = 20,
  offset: number = 0
): UseFetchResult<PaginatedResult<EventRecord>> =>
  useFetch<PaginatedResult<EventRecord>>(
    `/api/v1/dashboard/failures?limit=${limit}&offset=${offset}`,
    `${limit}:${offset}`
  );

// Re-export types for use in page components
export type {
  TenantInfo,
  DashboardStats,
  InstallationRepository,
  EventRecord,
  AnalysisRecord,
  PaginatedResult,
};
