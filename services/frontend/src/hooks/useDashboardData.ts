/**
 * Dashboard Data Hooks
 *
 * Custom hooks for fetching CI/CD dashboard data from the API.
 * Uses native fetch via apiClient with useState/useEffect.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
 * Generic data-fetching hook with loading/error states and cancellation.
 * Uses a cancelled flag to prevent state updates after effect cleanup.
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
    if (!path) {
      setState({ data: null, isLoading: false, error: null });
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
    };
  }, [path, refreshKey, depsKey]);

  return { ...state, refetch };
};

// ==================== Typed Hooks ====================

export const useTenantInfo = (refreshKey: number = 0): UseFetchResult<TenantInfo> =>
  useFetch<TenantInfo>("/api/v1/dashboard/tenant", `${refreshKey}`);

export const useDashboardStats = (refreshKey: number = 0): UseFetchResult<DashboardStats> =>
  useFetch<DashboardStats>("/api/v1/dashboard/stats", `${refreshKey}`);

export const useRepositories = (
  refreshKey: number = 0
): UseFetchResult<readonly InstallationRepository[]> =>
  useFetch<readonly InstallationRepository[]>("/api/v1/dashboard/repositories", `${refreshKey}`);

const buildAnalysesUrl = (
  limit: number,
  offset: number,
  repository?: string,
  minConfidence?: string,
  maxConfidence?: string,
  since?: string
): string => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (repository) {
    params.set("repository", repository);
  }
  if (minConfidence) {
    params.set("minConfidence", minConfidence);
  }
  if (maxConfidence) {
    params.set("maxConfidence", maxConfidence);
  }
  if (since) {
    params.set("since", since);
  }
  return `/api/v1/dashboard/analyses?${params.toString()}`;
};

const buildFailuresUrl = (
  limit: number,
  offset: number,
  repository?: string,
  severity?: string,
  since?: string
): string => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (repository) {
    params.set("repository", repository);
  }
  if (severity) {
    params.set("severity", severity);
  }
  if (since) {
    params.set("since", since);
  }
  return `/api/v1/dashboard/failures?${params.toString()}`;
};

export const useAnalyses = (
  limit: number = 20,
  offset: number = 0,
  refreshKey: number = 0,
  repository?: string,
  minConfidence?: string,
  maxConfidence?: string,
  since?: string
): UseFetchResult<PaginatedResult<AnalysisRecord>> =>
  useFetch<PaginatedResult<AnalysisRecord>>(
    buildAnalysesUrl(limit, offset, repository, minConfidence, maxConfidence, since),
    `${limit}:${offset}:${refreshKey}:${repository ?? ""}:${minConfidence ?? ""}:${maxConfidence ?? ""}:${since ?? ""}`
  );

export const useFailures = (
  limit: number = 20,
  offset: number = 0,
  refreshKey: number = 0,
  repository?: string,
  severity?: string,
  since?: string
): UseFetchResult<PaginatedResult<EventRecord>> =>
  useFetch<PaginatedResult<EventRecord>>(
    buildFailuresUrl(limit, offset, repository, severity, since),
    `${limit}:${offset}:${refreshKey}:${repository ?? ""}:${severity ?? ""}:${since ?? ""}`
  );

// ==================== Confidence Distribution ====================

interface ConfidenceBucket {
  readonly level: string;
  readonly count: number;
}

export const useConfidenceDistribution = (
  refreshKey: number = 0
): UseFetchResult<readonly ConfidenceBucket[]> =>
  useFetch<readonly ConfidenceBucket[]>(
    "/api/v1/dashboard/stats/confidence-distribution",
    `${refreshKey}`
  );

// ==================== Analysis Detail ====================

export const useAnalysisDetail = (
  analysisId: string | null,
  refreshKey: number = 0
): UseFetchResult<AnalysisRecord> =>
  useFetch<AnalysisRecord>(
    analysisId ? `/api/v1/dashboard/analyses/${analysisId}` : "",
    `${analysisId ?? ""}:${refreshKey}`
  );

// ==================== Batch Lookup Hook ====================

interface AnalysisStatusEntry {
  readonly analysisId: string;
  readonly confidence: number;
}

type AnalysisStatusMap = Readonly<Record<string, AnalysisStatusEntry | null>>;

/**
 * POST-based batch lookup for analysis status by event IDs.
 * Returns a map of eventId to analysis info (or null if not analyzed).
 * Uses useMemo to stabilize the dependency array key.
 */
export const useAnalysisStatusByEvents = (
  eventIds: readonly string[],
  refreshKey: number = 0
): FetchState<AnalysisStatusMap> => {
  const [state, setState] = useState<FetchState<AnalysisStatusMap>>({
    data: null,
    isLoading: false,
    error: null,
  });

  // Stabilize the event IDs key to avoid re-rendering on every render
  const eventIdsKey = useMemo(() => eventIds.join(","), [eventIds]);
  // Keep a ref to the latest eventIds for use in the async callback
  const eventIdsRef = useRef(eventIds);
  useEffect(() => {
    Object.assign(eventIdsRef, { current: eventIds });
  }, [eventIds]);

  useEffect(() => {
    if (eventIdsKey === "") {
      setState({ data: null, isLoading: false, error: null });
      return;
    }

    // let: mutable flag for async cleanup coordination
    let cancelled = false; // let: tracks if effect was cleaned up during async fetch

    const fetchData = async (): Promise<void> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await apiClient("/api/v1/dashboard/analyses/by-events", {
          method: "POST",
          body: { eventIds: eventIdsRef.current },
        });

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setState({ data: null, isLoading: false, error: `Request failed (${response.status})` });
          return;
        }

        const json: { readonly data: AnalysisStatusMap } = await response.json();
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
    };
  }, [eventIdsKey, refreshKey]);

  return state;
};

// ==================== Confidence Trend ====================

interface ConfidenceTrendPoint {
  readonly date: string;
  readonly avgConfidence: number;
  readonly count: number;
}

const buildConfidenceTrendUrl = (bucket: "day" | "week", since?: string): string => {
  const params = new URLSearchParams();
  params.set("bucket", bucket);
  if (since) {
    params.set("since", since);
  }
  return `/api/v1/dashboard/stats/confidence-trend?${params.toString()}`;
};

export const useConfidenceTrend = (
  bucket: "day" | "week" = "day",
  since?: string,
  refreshKey: number = 0
): UseFetchResult<readonly ConfidenceTrendPoint[]> =>
  useFetch<readonly ConfidenceTrendPoint[]>(
    buildConfidenceTrendUrl(bucket, since),
    `${bucket}:${since ?? ""}:${refreshKey}`
  );

// ==================== Webhook Activity ====================

interface WebhookActivityRecord {
  readonly id: string;
  readonly tenantId: string | null;
  readonly deliveryId: string;
  readonly eventType: string;
  readonly source: string;
  readonly status: string;
  readonly processingTimeMs: number | null;
  readonly errorMessage: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

const buildWebhookActivityUrl = (
  limit: number,
  offset: number,
  source?: string,
  status?: string
): string => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (source) {
    params.set("source", source);
  }
  if (status) {
    params.set("status", status);
  }
  return `/api/v1/dashboard/webhook-activity?${params.toString()}`;
};

export const useWebhookActivity = (
  limit: number = 20,
  offset: number = 0,
  refreshKey: number = 0,
  source?: string,
  status?: string
): UseFetchResult<PaginatedResult<WebhookActivityRecord>> =>
  useFetch<PaginatedResult<WebhookActivityRecord>>(
    buildWebhookActivityUrl(limit, offset, source, status),
    `${limit}:${offset}:${refreshKey}:${source ?? ""}:${status ?? ""}`
  );

// Re-export types for use in page components
export type {
  TenantInfo,
  DashboardStats,
  InstallationRepository,
  EventRecord,
  AnalysisRecord,
  PaginatedResult,
  AnalysisStatusEntry,
  AnalysisStatusMap,
  ConfidenceTrendPoint,
  WebhookActivityRecord,
};
