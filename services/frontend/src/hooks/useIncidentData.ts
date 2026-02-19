/**
 * Incident Data Hooks
 *
 * Custom hooks for fetching incident triage data from the API.
 * Uses native fetch via apiClient with useState/useEffect.
 * Follows the same pattern as useDashboardData.ts.
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

export interface IncidentAlertRecord {
  readonly id: string;
  readonly tenantId: string | null;
  readonly source: string;
  readonly sourceAlertId: string;
  readonly deliveryId: string;
  readonly fingerprint: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly severity: string;
  readonly status: string;
  readonly serviceName: string | null;
  readonly environment: string | null;
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly labels: Readonly<Record<string, string>>;
  readonly sourcePayload: Readonly<Record<string, unknown>>;
  readonly receivedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AlertWithTriageResult {
  readonly alert: IncidentAlertRecord;
  readonly triageResult: Readonly<Record<string, unknown>> | null;
}

export interface PaginatedIncidents {
  readonly items: readonly IncidentAlertRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface SeverityDistributionEntry {
  readonly severityLabel: string;
  readonly count: number;
}

export interface PipelineMetricsResponse {
  readonly severityDistribution: readonly SeverityDistributionEntry[];
  readonly pipeline: {
    readonly totalTriaged: number;
    readonly avgDurationMs: number | null;
    readonly p50DurationMs: number | null;
    readonly p95DurationMs: number | null;
  };
  readonly summarySource: {
    readonly aiCount: number;
    readonly fallbackCount: number;
    readonly aiRate: number | null;
  };
  readonly dispatch: {
    readonly dispatchedCount: number;
    readonly routedCount: number;
    readonly dispatchRate: number | null;
  };
  readonly dedup: {
    readonly totalAlerts: number;
    readonly dedupedCount: number;
    readonly dedupRate: number | null;
  };
}

interface MutationState {
  readonly isLoading: boolean;
  readonly error: string | null;
}

// ==================== Generic Fetch Hook ====================

/**
 * Generic data-fetching hook with loading/error states and cancellation.
 * Replicates the same pattern as useDashboardData.ts useFetch.
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

  // Derive final state: when path is empty, override to idle (avoids synchronous setState in effect)
  const resolvedState: FetchState<T> = path ? state : { data: null, isLoading: false, error: null };

  return { ...resolvedState, refetch };
};

// ==================== URL Builders ====================

const buildIncidentsUrl = (
  tenantId: string,
  limit: number,
  offset: number,
  severity?: string,
  status?: string,
  source?: string
): string => {
  const params = new URLSearchParams();
  params.set("tenantId", tenantId);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (severity) {
    params.set("severity", severity);
  }
  if (status) {
    params.set("status", status);
  }
  if (source) {
    params.set("source", source);
  }
  return `/api/v1/incidents?${params.toString()}`;
};

// ==================== Typed Hooks ====================

export const useIncidents = (
  tenantId: string,
  limit: number = 20,
  offset: number = 0,
  refreshKey: number = 0,
  severity?: string,
  status?: string,
  source?: string
): UseFetchResult<PaginatedIncidents> =>
  useFetch<PaginatedIncidents>(
    tenantId ? buildIncidentsUrl(tenantId, limit, offset, severity, status, source) : "",
    `${tenantId}:${limit}:${offset}:${refreshKey}:${severity ?? ""}:${status ?? ""}:${source ?? ""}`
  );

export const useIncidentDetail = (
  id: string | null,
  refreshKey: number = 0
): UseFetchResult<AlertWithTriageResult> =>
  useFetch<AlertWithTriageResult>(id ? `/api/v1/incidents/${id}` : "", `${id ?? ""}:${refreshKey}`);

export const useTriageStats = (
  tenantId: string,
  refreshKey: number = 0
): UseFetchResult<PipelineMetricsResponse> =>
  useFetch<PipelineMetricsResponse>(
    tenantId ? `/api/v1/triage/stats?tenantId=${tenantId}` : "",
    `${tenantId}:${refreshKey}`
  );

// ==================== Mutation Helpers ====================

/** Safely parse an error message from an API response body */
const parseErrorBody = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body: unknown = await response.json();
    const parsed = body as { readonly error?: { readonly message?: string } } | null;
    return parsed?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
};

// ==================== Mutation Hooks ====================

export const useAcknowledgeIncident = (): MutationState & {
  readonly acknowledge: (id: string) => Promise<IncidentAlertRecord | null>;
} => {
  const [state, setState] = useState<MutationState>({ isLoading: false, error: null });

  const acknowledge = useCallback(async (id: string): Promise<IncidentAlertRecord | null> => {
    setState({ isLoading: true, error: null });
    try {
      const response = await apiClient(`/api/v1/incidents/${id}/acknowledge`, { method: "POST" });
      if (!response.ok) {
        const message = await parseErrorBody(
          response,
          `Failed to acknowledge (${response.status})`
        );
        setState({ isLoading: false, error: message });
        return null;
      }
      const json: { readonly data: IncidentAlertRecord } = await response.json();
      setState({ isLoading: false, error: null });
      return json.data;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown error";
      setState({ isLoading: false, error: message });
      return null;
    }
  }, []);

  return { ...state, acknowledge };
};

export const useResolveIncident = (): MutationState & {
  readonly resolve: (id: string) => Promise<IncidentAlertRecord | null>;
} => {
  const [state, setState] = useState<MutationState>({ isLoading: false, error: null });

  const resolve = useCallback(async (id: string): Promise<IncidentAlertRecord | null> => {
    setState({ isLoading: true, error: null });
    try {
      const response = await apiClient(`/api/v1/incidents/${id}/resolve`, { method: "POST" });
      if (!response.ok) {
        const message = await parseErrorBody(response, `Failed to resolve (${response.status})`);
        setState({ isLoading: false, error: message });
        return null;
      }
      const json: { readonly data: IncidentAlertRecord } = await response.json();
      setState({ isLoading: false, error: null });
      return json.data;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown error";
      setState({ isLoading: false, error: message });
      return null;
    }
  }, []);

  return { ...state, resolve };
};
