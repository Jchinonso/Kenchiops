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

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { fetchQuery, fetchMutation } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { useToFetchResult, type UseFetchResult, type MutationState } from "@/hooks/useQueryCompat";
import { buildIncidentsUrl } from "./urlBuilders";
import type {
  IncidentAlertRecord,
  AlertWithTriageResult,
  PaginatedIncidents,
  PipelineMetricsResponse,
  UseIncidentsOptions,
  SourceStatsEntry,
  ActiveCountBySource,
  SeverityBySourceEntry,
} from "./types";

// ==================== Query Hooks ====================

export const useIncidents = (options: UseIncidentsOptions): UseFetchResult<PaginatedIncidents> => {
  const { tenantId, limit = 20, offset = 0, severity, status, source } = options;
  return useToFetchResult(
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
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.incidents.detail(id ?? ""),
      queryFn: () => fetchQuery<AlertWithTriageResult>(`/api/v1/incidents/${id}`),
      enabled: id !== null,
    })
  );

export const useTriageStats = (tenantId: string): UseFetchResult<PipelineMetricsResponse> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.incidents.triageStats(),
      queryFn: () => fetchQuery<PipelineMetricsResponse>("/api/v1/triage/stats"),
      enabled: !!tenantId,
      placeholderData: keepPreviousData,
    })
  );

export const useIntegrationHealth = (
  tenantId: string
): UseFetchResult<readonly SourceStatsEntry[]> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.incidents.integrationHealth(),
      queryFn: () => fetchQuery<readonly SourceStatsEntry[]>("/api/v1/incidents/stats/by-source"),
      enabled: !!tenantId,
      placeholderData: keepPreviousData,
    })
  );

// ==================== Per-Source Hooks ====================

export const useActiveCountsBySource = (
  tenantId: string
): UseFetchResult<readonly ActiveCountBySource[]> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.incidents.activeBySource(),
      queryFn: () =>
        fetchQuery<readonly ActiveCountBySource[]>("/api/v1/incidents/stats/active-by-source"),
      enabled: !!tenantId,
      placeholderData: keepPreviousData,
    })
  );

export const useBalancedRecentIncidents = (
  tenantId: string,
  perSource: number = 2,
  maxTotal: number = 6
): UseFetchResult<readonly IncidentAlertRecord[]> =>
  useToFetchResult(
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
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.incidents.severityBySource(),
      queryFn: () =>
        fetchQuery<readonly SeverityBySourceEntry[]>("/api/v1/triage/stats/severity-by-source"),
      enabled: !!tenantId,
      placeholderData: keepPreviousData,
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

  const acknowledge = useCallback(
    async (id: string): Promise<IncidentAlertRecord | null> => {
      try {
        return await mutation.mutateAsync(id);
      } catch {
        return null;
      }
    },
    [mutation]
  );

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

  const resolve = useCallback(
    async (id: string): Promise<IncidentAlertRecord | null> => {
      try {
        return await mutation.mutateAsync(id);
      } catch {
        return null;
      }
    },
    [mutation]
  );

  return {
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    resolve,
  };
};
