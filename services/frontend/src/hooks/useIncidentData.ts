/**
 * Incident Data Hooks
 *
 * Custom hooks for fetching incident triage data from the API.
 * Uses TanStack Query for server state management.
 *
 * Each hook returns the legacy UseFetchResult<T> shape for backward
 * compatibility. Cache freshness is managed by TanStack Query and
 * SSE-driven invalidation.
 */

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { fetchQuery, fetchMutation } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { toFetchResult, type UseFetchResult, type MutationState } from "@/hooks/useQueryCompat";

// ==================== Types ====================

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
    readonly activeAlerts: number;
  };
}

// ==================== URL Builders ====================

const buildIncidentsUrl = (
  limit: number,
  offset: number,
  severity?: string,
  status?: string,
  source?: string
): string => {
  const params = new URLSearchParams();
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

export interface UseIncidentsOptions {
  readonly tenantId: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly severity?: string;
  readonly status?: string;
  readonly source?: string;
}

export const useIncidents = (options: UseIncidentsOptions): UseFetchResult<PaginatedIncidents> => {
  const { tenantId, limit = 20, offset = 0, severity, status, source } = options;
  return toFetchResult(
    useQuery({
      queryKey: queryKeys.incidents.list({ tenantId, limit, offset, severity, status, source }),
      queryFn: () =>
        fetchQuery<PaginatedIncidents>(buildIncidentsUrl(limit, offset, severity, status, source)),
      enabled: !!tenantId,
      placeholderData: keepPreviousData,
    })
  );
};

export const useIncidentDetail = (id: string | null): UseFetchResult<AlertWithTriageResult> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.incidents.detail(id ?? ""),
      queryFn: () => fetchQuery<AlertWithTriageResult>(`/api/v1/incidents/${id}`),
      enabled: id !== null,
    })
  );

export const useTriageStats = (tenantId: string): UseFetchResult<PipelineMetricsResponse> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.incidents.triageStats(),
      queryFn: () => fetchQuery<PipelineMetricsResponse>("/api/v1/triage/stats"),
      enabled: !!tenantId,
    })
  );

export interface SourceStatsEntry {
  readonly source: string;
  readonly eventCount: number;
  readonly lastReceived: string | null;
}

export const useIntegrationHealth = (
  tenantId: string
): UseFetchResult<readonly SourceStatsEntry[]> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.incidents.integrationHealth(),
      queryFn: () => fetchQuery<readonly SourceStatsEntry[]>("/api/v1/incidents/stats/by-source"),
      enabled: !!tenantId,
    })
  );

// ==================== Per-Source Stats Types ====================

export interface ActiveCountBySource {
  readonly source: string;
  readonly activeCount: number;
}

export interface SeverityBySourceEntry {
  readonly source: string;
  readonly severityLabel: string;
  readonly count: number;
}

// ==================== Per-Source Hooks ====================

export const useActiveCountsBySource = (
  tenantId: string
): UseFetchResult<readonly ActiveCountBySource[]> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.incidents.activeBySource(),
      queryFn: () =>
        fetchQuery<readonly ActiveCountBySource[]>("/api/v1/incidents/stats/active-by-source"),
      enabled: !!tenantId,
    })
  );

export const useBalancedRecentIncidents = (
  tenantId: string,
  perSource: number = 2,
  maxTotal: number = 6
): UseFetchResult<readonly IncidentAlertRecord[]> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.incidents.balancedRecent(perSource, maxTotal),
      queryFn: () =>
        fetchQuery<readonly IncidentAlertRecord[]>(
          `/api/v1/incidents/recent/balanced?perSource=${perSource}&maxTotal=${maxTotal}`
        ),
      enabled: !!tenantId,
    })
  );

export const useSeverityDistributionBySource = (
  tenantId: string
): UseFetchResult<readonly SeverityBySourceEntry[]> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.incidents.severityBySource(),
      queryFn: () =>
        fetchQuery<readonly SeverityBySourceEntry[]>("/api/v1/triage/stats/severity-by-source"),
      enabled: !!tenantId,
    })
  );

// ==================== Mutation Hooks ====================

export const useAcknowledgeIncident = (): MutationState & {
  readonly acknowledge: (id: string) => Promise<IncidentAlertRecord | null>;
} => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) =>
      fetchMutation<IncidentAlertRecord>(`/api/v1/incidents/${id}/acknowledge`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
    },
  });

  const acknowledge = async (id: string): Promise<IncidentAlertRecord | null> => {
    try {
      return await mutation.mutateAsync(id);
    } catch {
      return null;
    }
  };

  return {
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    acknowledge,
  };
};

export const useResolveIncident = (): MutationState & {
  readonly resolve: (id: string) => Promise<IncidentAlertRecord | null>;
} => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) =>
      fetchMutation<IncidentAlertRecord>(`/api/v1/incidents/${id}/resolve`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
    },
  });

  const resolve = async (id: string): Promise<IncidentAlertRecord | null> => {
    try {
      return await mutation.mutateAsync(id);
    } catch {
      return null;
    }
  };

  return {
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    resolve,
  };
};
