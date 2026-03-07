/**
 * Dashboard Data Hooks
 *
 * Custom hooks for fetching CI/CD dashboard data from the API.
 * Uses TanStack Query for server state management.
 *
 * Each hook returns the legacy UseFetchResult<T> shape for backward
 * compatibility with existing page consumers. Cache freshness is managed
 * by TanStack Query and SSE-driven invalidation.
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchQuery, fetchQueryPost } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import {
  useToFetchResult,
  useToFetchState,
  type FetchState,
  type UseFetchResult,
} from "@/hooks/useQueryCompat";
import {
  buildAnalysesUrl,
  buildFailuresUrl,
  buildConfidenceTrendUrl,
  buildWebhookActivityUrl,
} from "./urlBuilders";
import type {
  TenantInfo,
  DashboardStats,
  InstallationRepository,
  EventRecord,
  AnalysisRecord,
  PaginatedResult,
  UseAnalysesOptions,
  UseFailuresOptions,
  UseWebhookActivityOptions,
  AnalysisStatusMap,
  ConfidenceBucket,
  AnalysisCountByRepo,
  ConfidenceTrendPoint,
  WebhookActivityRecord,
  CorrelationResult,
  GitLabProject,
} from "./types";

/** Tenant info rarely changes mid-session; SSE handles invalidation. */
const TENANT_STALE_TIME = 5 * 60 * 1000;
/** Repository list only changes on new GitHub App installations. */
const REPOSITORIES_STALE_TIME = 5 * 60 * 1000;

// ==================== Tenant & Repositories ====================

export const useTenantInfo = (): UseFetchResult<TenantInfo> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.tenant(),
      queryFn: () => fetchQuery<TenantInfo>("/api/v1/dashboard/tenant"),
      staleTime: TENANT_STALE_TIME,
    })
  );

export const useRepositories = (): UseFetchResult<readonly InstallationRepository[]> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.repositories(),
      queryFn: () =>
        fetchQuery<readonly InstallationRepository[]>("/api/v1/dashboard/repositories"),
      staleTime: REPOSITORIES_STALE_TIME,
    })
  );

// ==================== Dashboard Stats ====================

export const useDashboardStats = (source?: string): UseFetchResult<DashboardStats> => {
  const url = source
    ? `/api/v1/dashboard/stats?source=${encodeURIComponent(source)}`
    : "/api/v1/dashboard/stats";
  return useToFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.stats(source),
      queryFn: () => fetchQuery<DashboardStats>(url),
    })
  );
};

// ==================== Analyses ====================

export const useAnalyses = (
  options: UseAnalysesOptions = {}
): UseFetchResult<PaginatedResult<AnalysisRecord>> => {
  const {
    limit = 20,
    offset = 0,
    repository,
    minConfidence,
    maxConfidence,
    since,
    source,
  } = options;
  return useToFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.analyses.list({
        limit,
        offset,
        repository,
        minConfidence,
        maxConfidence,
        since,
        source,
      }),
      queryFn: () =>
        fetchQuery<PaginatedResult<AnalysisRecord>>(
          buildAnalysesUrl({
            limit,
            offset,
            repository,
            minConfidence,
            maxConfidence,
            since,
            source,
          })
        ),
      placeholderData: keepPreviousData,
    })
  );
};

export const useAnalysisDetail = (analysisId: string | null): UseFetchResult<AnalysisRecord> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.analyses.detail(analysisId ?? ""),
      queryFn: () => fetchQuery<AnalysisRecord>(`/api/v1/dashboard/analyses/${analysisId}`),
      enabled: analysisId !== null,
    })
  );

export const useAnalysisCountsByRepo = (): UseFetchResult<readonly AnalysisCountByRepo[]> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.analyses.countsByRepo(),
      queryFn: () =>
        fetchQuery<readonly AnalysisCountByRepo[]>("/api/v1/dashboard/stats/analyses-by-repo"),
      placeholderData: keepPreviousData,
    })
  );

export const useAnalysisStatusByEvents = (
  eventIds: readonly string[]
): FetchState<AnalysisStatusMap> =>
  useToFetchState(
    useQuery({
      queryKey: queryKeys.dashboard.analyses.byEvents(eventIds),
      queryFn: () =>
        fetchQueryPost<AnalysisStatusMap>("/api/v1/dashboard/analyses/by-events", { eventIds }),
      enabled: eventIds.length > 0,
    }),
    eventIds.length > 0
  );

// ==================== Confidence ====================

export const useConfidenceDistribution = (): UseFetchResult<readonly ConfidenceBucket[]> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.confidence.distribution(),
      queryFn: () =>
        fetchQuery<readonly ConfidenceBucket[]>("/api/v1/dashboard/stats/confidence-distribution"),
      placeholderData: keepPreviousData,
    })
  );

export const useConfidenceTrend = (
  bucket: "day" | "week" = "day",
  since?: string
): UseFetchResult<readonly ConfidenceTrendPoint[]> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.confidence.trend(bucket, since),
      queryFn: () =>
        fetchQuery<readonly ConfidenceTrendPoint[]>(buildConfidenceTrendUrl(bucket, since)),
      placeholderData: keepPreviousData,
    })
  );

// ==================== Failures ====================

export const useFailures = (
  options: UseFailuresOptions = {}
): UseFetchResult<PaginatedResult<EventRecord>> => {
  const { limit = 20, offset = 0, repository, severity, since, source } = options;
  return useToFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.failures.list({
        limit,
        offset,
        repository,
        severity,
        since,
        source,
      }),
      queryFn: () =>
        fetchQuery<PaginatedResult<EventRecord>>(
          buildFailuresUrl({ limit, offset, repository, severity, since, source })
        ),
      placeholderData: keepPreviousData,
    })
  );
};

// ==================== Webhook Activity ====================

export const useWebhookActivity = (
  options: UseWebhookActivityOptions = {}
): UseFetchResult<PaginatedResult<WebhookActivityRecord>> => {
  const { limit = 20, offset = 0, source, status } = options;
  return useToFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.webhookActivity({ limit, offset, source, status }),
      queryFn: () =>
        fetchQuery<PaginatedResult<WebhookActivityRecord>>(
          buildWebhookActivityUrl(limit, offset, source, status)
        ),
      placeholderData: keepPreviousData,
    })
  );
};

// ==================== Correlation ====================

export const useCorrelation = (commitSha: string | null): UseFetchResult<CorrelationResult> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.correlation(commitSha ?? ""),
      queryFn: () => fetchQuery<CorrelationResult>(`/api/v1/dashboard/correlations/${commitSha}`),
      enabled: commitSha !== null,
    })
  );

// ==================== GitLab ====================

export const useGitLabProjects = (): UseFetchResult<readonly GitLabProject[]> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.gitlabProjects(),
      queryFn: () => fetchQuery<readonly GitLabProject[]>("/api/v1/dashboard/gitlab/projects"),
    })
  );
