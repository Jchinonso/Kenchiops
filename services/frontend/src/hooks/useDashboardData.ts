/**
 * Dashboard Data Hooks
 *
 * Custom hooks for fetching CI/CD dashboard data from the API.
 * Uses shared useFetch hook with useState/useEffect.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { apiClient } from "@/lib/apiClient";
import { useFetch, type FetchState, type UseFetchResult } from "@/hooks/useFetch";

interface TenantInfo {
  readonly id: string;
  readonly orgName: string;
  readonly githubConnected: boolean;
  readonly gitlabConnected: boolean;
  readonly slackConnected: boolean;
  readonly status: string;
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

// ==================== Typed Hooks ====================

export const useTenantInfo = (refreshKey: number = 0): UseFetchResult<TenantInfo> =>
  useFetch<TenantInfo>("/api/v1/dashboard/tenant", `${refreshKey}`);

export const useDashboardStats = (
  refreshKey: number = 0,
  source?: string
): UseFetchResult<DashboardStats> => {
  const url = source
    ? `/api/v1/dashboard/stats?source=${encodeURIComponent(source)}`
    : "/api/v1/dashboard/stats";
  return useFetch<DashboardStats>(url, `${refreshKey}-${source ?? ""}`);
};

export const useRepositories = (
  refreshKey: number = 0
): UseFetchResult<readonly InstallationRepository[]> =>
  useFetch<readonly InstallationRepository[]>("/api/v1/dashboard/repositories", `${refreshKey}`);

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
  if (options.repository) {
    params.set("repository", options.repository);
  }
  if (options.minConfidence) {
    params.set("minConfidence", options.minConfidence);
  }
  if (options.maxConfidence) {
    params.set("maxConfidence", options.maxConfidence);
  }
  if (options.since) {
    params.set("since", options.since);
  }
  if (options.source) {
    params.set("source", options.source);
  }
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
  if (options.repository) {
    params.set("repository", options.repository);
  }
  if (options.severity) {
    params.set("severity", options.severity);
  }
  if (options.since) {
    params.set("since", options.since);
  }
  if (options.source) {
    params.set("source", options.source);
  }
  return `/api/v1/dashboard/failures?${params.toString()}`;
};

interface UseAnalysesOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly refreshKey?: number;
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
    refreshKey = 0,
    repository,
    minConfidence,
    maxConfidence,
    since,
    source,
  } = options;

  return useFetch<PaginatedResult<AnalysisRecord>>(
    buildAnalysesUrl({ limit, offset, repository, minConfidence, maxConfidence, since, source }),
    `${limit}:${offset}:${refreshKey}:${repository ?? ""}:${minConfidence ?? ""}:${maxConfidence ?? ""}:${since ?? ""}:${source ?? ""}`
  );
};

interface UseFailuresOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly refreshKey?: number;
  readonly repository?: string;
  readonly severity?: string;
  readonly since?: string;
  readonly source?: string;
}

export const useFailures = (
  options: UseFailuresOptions = {}
): UseFetchResult<PaginatedResult<EventRecord>> => {
  const { limit = 20, offset = 0, refreshKey = 0, repository, severity, since, source } = options;

  return useFetch<PaginatedResult<EventRecord>>(
    buildFailuresUrl({ limit, offset, repository, severity, since, source }),
    `${limit}:${offset}:${refreshKey}:${repository ?? ""}:${severity ?? ""}:${since ?? ""}:${source ?? ""}`
  );
};

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

// ==================== Analysis Counts by Repo ====================

interface AnalysisCountByRepo {
  readonly repository: string;
  readonly analysisCount: number;
}

export const useAnalysisCountsByRepo = (
  refreshKey: number = 0
): UseFetchResult<readonly AnalysisCountByRepo[]> =>
  useFetch<readonly AnalysisCountByRepo[]>(
    "/api/v1/dashboard/stats/analyses-by-repo",
    `${refreshKey}`
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

// ==================== Correlation Types ====================

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

export const useCorrelation = (
  commitSha: string | null,
  refreshKey: number = 0
): UseFetchResult<CorrelationResult> =>
  useFetch<CorrelationResult>(
    commitSha ? `/api/v1/dashboard/correlations/${commitSha}` : "",
    `${commitSha ?? ""}:${refreshKey}`
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

export const useGitLabProjects = (
  refreshKey: number = 0
): UseFetchResult<readonly GitLabProject[]> =>
  useFetch<readonly GitLabProject[]>("/api/v1/dashboard/gitlab/projects", `${refreshKey}`);

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
  AnalysisStatusEntry,
  AnalysisStatusMap,
  ConfidenceTrendPoint,
  WebhookActivityRecord,
  CorrelationSummary,
  CorrelationResult,
  GitLabProject,
};
