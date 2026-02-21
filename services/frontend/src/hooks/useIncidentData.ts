/**
 * Incident Data Hooks
 *
 * Custom hooks for fetching incident triage data from the API.
 * Uses shared useFetch hook.
 */

import { useState, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";
import {
  useFetch,
  parseErrorBody,
  type UseFetchResult,
  type MutationState,
} from "@/hooks/useFetch";

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

export interface SourceStatsEntry {
  readonly source: string;
  readonly eventCount: number;
  readonly lastReceived: string | null;
}

export const useIntegrationHealth = (
  tenantId: string,
  refreshKey: number = 0
): UseFetchResult<readonly SourceStatsEntry[]> =>
  useFetch<readonly SourceStatsEntry[]>(
    tenantId ? `/api/v1/incidents/stats/by-source?tenantId=${tenantId}` : "",
    `${tenantId}:${refreshKey}`
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

/**
 * Fetches active (non-resolved/closed/deduped) alert counts grouped by source.
 */
export const useActiveCountsBySource = (
  tenantId: string,
  refreshKey: number = 0
): UseFetchResult<readonly ActiveCountBySource[]> =>
  useFetch<readonly ActiveCountBySource[]>(
    tenantId ? `/api/v1/incidents/stats/active-by-source?tenantId=${tenantId}` : "",
    `${tenantId}:${refreshKey}`
  );

/**
 * Fetches a balanced selection of recent incidents across sources.
 */
export const useBalancedRecentIncidents = (
  tenantId: string,
  perSource: number = 2,
  maxTotal: number = 6,
  refreshKey: number = 0
): UseFetchResult<readonly IncidentAlertRecord[]> =>
  useFetch<readonly IncidentAlertRecord[]>(
    tenantId
      ? `/api/v1/incidents/recent/balanced?tenantId=${tenantId}&perSource=${perSource}&maxTotal=${maxTotal}`
      : "",
    `${tenantId}:${perSource}:${maxTotal}:${refreshKey}`
  );

/**
 * Fetches severity distribution grouped by alert source.
 */
export const useSeverityDistributionBySource = (
  tenantId: string,
  refreshKey: number = 0
): UseFetchResult<readonly SeverityBySourceEntry[]> =>
  useFetch<readonly SeverityBySourceEntry[]>(
    tenantId ? `/api/v1/triage/stats/severity-by-source?tenantId=${tenantId}` : "",
    `${tenantId}:${refreshKey}`
  );

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
