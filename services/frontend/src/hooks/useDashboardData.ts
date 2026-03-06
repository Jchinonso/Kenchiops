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
import type { FetchState, UseFetchResult } from "@/hooks/useQueryCompat";
import { toFetchResult, toFetchState } from "@/hooks/useQueryCompat";

// ==================== Types ====================

interface TenantInfo {
  readonly id: string;
  readonly orgName: string;
  readonly githubConnected: boolean;
  readonly gitlabConnected: boolean;
  readonly slackConnected: boolean;
  readonly status: string;
  readonly hasData: boolean;
}

interface DashboardStats {
  readonly totalAnalyses: number;
  readonly totalFailures: number;
  readonly connectedRepos: number;
  readonly gitlabProjectCount: number;
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
  readonly ciProvider: string | null;
  readonly headSha: string | null;
  readonly createdAt: string;
}

interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

// ==================== URL Builders ====================

interface BuildAnalysesUrlOptions {
  readonly limit: number;
  readonly offset: number;
  readonly repository?: string;
  readonly minConfidence?: string;
  readonly maxConfidence?: string;
  readonly since?: string;
  readonly source?: string;
}

const buildAnalysesUrl = (options: BuildAnalysesUrlOptions): string => {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit));
  params.set("offset", String(options.offset));
  if (options.repository) params.set("repository", options.repository);
  if (options.minConfidence) params.set("minConfidence", options.minConfidence);
  if (options.maxConfidence) params.set("maxConfidence", options.maxConfidence);
  if (options.since) params.set("since", options.since);
  if (options.source) params.set("source", options.source);
  return `/api/v1/dashboard/analyses?${params.toString()}`;
};

interface BuildFailuresUrlOptions {
  readonly limit: number;
  readonly offset: number;
  readonly repository?: string;
  readonly severity?: string;
  readonly since?: string;
  readonly source?: string;
}

const buildFailuresUrl = (options: BuildFailuresUrlOptions): string => {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit));
  params.set("offset", String(options.offset));
  if (options.repository) params.set("repository", options.repository);
  if (options.severity) params.set("severity", options.severity);
  if (options.since) params.set("since", options.since);
  if (options.source) params.set("source", options.source);
  return `/api/v1/dashboard/failures?${params.toString()}`;
};

const buildConfidenceTrendUrl = (bucket: "day" | "week", since?: string): string => {
  const params = new URLSearchParams();
  params.set("bucket", bucket);
  if (since) params.set("since", since);
  return `/api/v1/dashboard/stats/confidence-trend?${params.toString()}`;
};

const buildWebhookActivityUrl = (
  limit: number,
  offset: number,
  source?: string,
  status?: string
): string => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (source) params.set("source", source);
  if (status) params.set("status", status);
  return `/api/v1/dashboard/webhook-activity?${params.toString()}`;
};

// ==================== Typed Hooks ====================

export const useTenantInfo = (): UseFetchResult<TenantInfo> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.tenant(),
      queryFn: () => fetchQuery<TenantInfo>("/api/v1/dashboard/tenant"),
    })
  );

export const useDashboardStats = (source?: string): UseFetchResult<DashboardStats> => {
  const url = source
    ? `/api/v1/dashboard/stats?source=${encodeURIComponent(source)}`
    : "/api/v1/dashboard/stats";
  return toFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.stats(source),
      queryFn: () => fetchQuery<DashboardStats>(url),
    })
  );
};

export const useRepositories = (): UseFetchResult<readonly InstallationRepository[]> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.repositories(),
      queryFn: () =>
        fetchQuery<readonly InstallationRepository[]>("/api/v1/dashboard/repositories"),
    })
  );

interface UseAnalysesOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly repository?: string;
  readonly minConfidence?: string;
  readonly maxConfidence?: string;
  readonly since?: string;
  readonly source?: string;
}

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
  return toFetchResult(
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

interface UseFailuresOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly repository?: string;
  readonly severity?: string;
  readonly since?: string;
  readonly source?: string;
}

export const useFailures = (
  options: UseFailuresOptions = {}
): UseFetchResult<PaginatedResult<EventRecord>> => {
  const { limit = 20, offset = 0, repository, severity, since, source } = options;
  return toFetchResult(
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

// ==================== Confidence Distribution ====================

interface ConfidenceBucket {
  readonly level: string;
  readonly count: number;
}

export const useConfidenceDistribution = (): UseFetchResult<readonly ConfidenceBucket[]> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.confidence.distribution(),
      queryFn: () =>
        fetchQuery<readonly ConfidenceBucket[]>("/api/v1/dashboard/stats/confidence-distribution"),
    })
  );

// ==================== Analysis Detail ====================

export const useAnalysisDetail = (analysisId: string | null): UseFetchResult<AnalysisRecord> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.analyses.detail(analysisId ?? ""),
      queryFn: () => fetchQuery<AnalysisRecord>(`/api/v1/dashboard/analyses/${analysisId}`),
      enabled: analysisId !== null,
    })
  );

// ==================== Analysis Counts by Repo ====================

interface AnalysisCountByRepo {
  readonly repository: string;
  readonly analysisCount: number;
}

export const useAnalysisCountsByRepo = (): UseFetchResult<readonly AnalysisCountByRepo[]> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.analyses.countsByRepo(),
      queryFn: () =>
        fetchQuery<readonly AnalysisCountByRepo[]>("/api/v1/dashboard/stats/analyses-by-repo"),
    })
  );

// ==================== Batch Lookup Hook ====================

interface AnalysisStatusEntry {
  readonly analysisId: string;
  readonly confidence: number;
}

type AnalysisStatusMap = Readonly<Record<string, AnalysisStatusEntry | null>>;

export const useAnalysisStatusByEvents = (
  eventIds: readonly string[]
): FetchState<AnalysisStatusMap> =>
  toFetchState(
    useQuery({
      queryKey: queryKeys.dashboard.analyses.byEvents(eventIds),
      queryFn: () =>
        fetchQueryPost<AnalysisStatusMap>("/api/v1/dashboard/analyses/by-events", { eventIds }),
      enabled: eventIds.length > 0,
    }),
    eventIds.length > 0
  );

// ==================== Confidence Trend ====================

interface ConfidenceTrendPoint {
  readonly date: string;
  readonly avgConfidence: number;
  readonly count: number;
}

export const useConfidenceTrend = (
  bucket: "day" | "week" = "day",
  since?: string
): UseFetchResult<readonly ConfidenceTrendPoint[]> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.confidence.trend(bucket, since),
      queryFn: () =>
        fetchQuery<readonly ConfidenceTrendPoint[]>(buildConfidenceTrendUrl(bucket, since)),
    })
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

interface UseWebhookActivityOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly source?: string;
  readonly status?: string;
}

export const useWebhookActivity = (
  options: UseWebhookActivityOptions = {}
): UseFetchResult<PaginatedResult<WebhookActivityRecord>> => {
  const { limit = 20, offset = 0, source, status } = options;
  return toFetchResult(
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

interface CorrelationSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
}

interface CorrelationResult {
  readonly commitSha: string;
  readonly analyses: readonly CorrelationSummary[];
  readonly incidents: readonly CorrelationSummary[];
}

export const useCorrelation = (commitSha: string | null): UseFetchResult<CorrelationResult> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.correlation(commitSha ?? ""),
      queryFn: () => fetchQuery<CorrelationResult>(`/api/v1/dashboard/correlations/${commitSha}`),
      enabled: commitSha !== null,
    })
  );

// ==================== GitLab Projects ====================

interface GitLabProject {
  readonly id: number;
  readonly name: string;
  readonly fullPath: string;
  readonly webUrl: string;
  readonly defaultBranch: string | null;
  readonly visibility: string;
  readonly lastActivity: string;
}

export const useGitLabProjects = (): UseFetchResult<readonly GitLabProject[]> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.dashboard.gitlabProjects(),
      queryFn: () => fetchQuery<readonly GitLabProject[]>("/api/v1/dashboard/gitlab/projects"),
    })
  );

// Re-export types for use in page components
export type {
  TenantInfo,
  DashboardStats,
  InstallationRepository,
  EventRecord,
  AnalysisRecord,
  PaginatedResult,
  UseAnalysesOptions,
  UseFailuresOptions,
  UseWebhookActivityOptions,
  AnalysisStatusEntry,
  AnalysisStatusMap,
  ConfidenceTrendPoint,
  WebhookActivityRecord,
  CorrelationSummary,
  CorrelationResult,
  GitLabProject,
};
