/**
 * Investigation Data Hooks
 *
 * Custom hooks for fetching investigation data from the API.
 * Uses TanStack Query for server state management with automatic
 * polling for active investigations via refetchInterval.
 */

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { fetchQuery, fetchMutation } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { toFetchResult, type UseFetchResult, type MutationState } from "@/hooks/useQueryCompat";

// Inlined from @kenchi/shared — frontend Docker build context does not include shared package
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Polling config for active investigations. SSE push handles real-time
 * updates, so this is a safety-net fallback in case the SSE connection
 * is temporarily lost. The long interval avoids the previous 3s x 200
 * burst pattern that generated up to 200 requests per investigation.
 */
const investigationPollingConfig = {
  fallbackIntervalMs: 30_000,
} as const;

// ==================== Types ====================

export interface InvestigationEvidenceItem {
  readonly id: string;
  readonly source: string;
  readonly title: string;
  readonly summary: string;
  readonly relevance: number;
  readonly timestamp: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface TimelineEvent {
  readonly timestamp: string;
  readonly type: string;
  readonly description: string;
  readonly sourceId: string;
}

export interface InvestigationCorrelation {
  readonly patterns: readonly string[];
  readonly timelineEvents: readonly TimelineEvent[];
  readonly relatedServices: readonly string[];
  readonly commonFactors: readonly string[];
}

export interface SuggestedInvestigationAction {
  readonly action: string;
  readonly reasoning: string;
  readonly priority: "immediate" | "short_term" | "long_term";
}

export interface InvestigationDiagnosis {
  readonly summary: string;
  readonly rootCauseHypothesis: string;
  readonly confidence: number;
  readonly suggestedActions: readonly SuggestedInvestigationAction[];
  readonly evidenceCited: readonly string[];
  readonly diagnosisSource: "ai" | "fallback";
}

export interface InvestigationRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly initiatedBy: string;
  readonly initiatedFrom: string;
  readonly status: string;
  readonly description: string;
  readonly serviceName: string | null;
  readonly endpoint: string | null;
  readonly symptom: string | null;
  readonly environment: string | null;
  readonly timeRangeFrom: string | null;
  readonly timeRangeTo: string | null;
  readonly evidence: readonly InvestigationEvidenceItem[];
  readonly correlation: InvestigationCorrelation | null;
  readonly diagnosis: InvestigationDiagnosis | null;
  readonly durationMs: number | null;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly updatedAt: string;
}

export interface PaginatedInvestigations {
  readonly items: readonly InvestigationRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

interface StartInvestigationInput {
  readonly description: string;
  readonly serviceName?: string;
  readonly symptom?: string;
  readonly environment?: string;
  readonly endpoint?: string;
}

interface StartInvestigationResult {
  readonly id: string;
  readonly status: string;
}

// ==================== Validation ====================

/** Validates that an ID is a UUID to prevent path traversal via crafted IDs */
const isValidUuid = (value: string): boolean => uuidPattern.test(value);

// ==================== Polling Helpers ====================

const isActiveStatus = (status: string): boolean =>
  status === "queued" ||
  status === "gathering" ||
  status === "parsing" ||
  status === "correlating" ||
  status === "analyzing" ||
  status === "diagnosing";

// Primary updates come from SSE (investigation_status_changed event) which
// invalidates the TanStack Query cache. The refetchInterval below is only
// a fallback safety net for when the SSE connection is unavailable.

// ==================== URL Builders ====================

const buildInvestigationsUrl = (limit: number, offset: number, status?: string): string => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (status) {params.set("status", status);}
  return `/api/v1/investigations?${params.toString()}`;
};

// ==================== Typed Hooks ====================

export const useInvestigations = (
  tenantId: string,
  limit: number = 20,
  offset: number = 0,
  status?: string
): UseFetchResult<PaginatedInvestigations> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.investigations.list({ limit, offset, status }),
      queryFn: () =>
        fetchQuery<PaginatedInvestigations>(buildInvestigationsUrl(limit, offset, status)),
      enabled: !!tenantId,
      placeholderData: keepPreviousData,
    })
  );

export const useInvestigationDetail = (id: string | null): UseFetchResult<InvestigationRecord> => {
  const safeId = id && isValidUuid(id) ? id : null;

  return toFetchResult(
    useQuery({
      queryKey: queryKeys.investigations.detail(safeId ?? ""),
      queryFn: () => fetchQuery<InvestigationRecord>(`/api/v1/investigations/${safeId}`),
      enabled: safeId !== null,
      // SSE push (investigation_status_changed) handles real-time cache
      // invalidation. This fallback interval keeps the UI eventually
      // consistent if the SSE connection drops temporarily.
      refetchInterval: (query) => {
        const currentStatus = query.state.data?.status;
        if (!currentStatus || !isActiveStatus(currentStatus)) {
          return false;
        }
        return investigationPollingConfig.fallbackIntervalMs;
      },
    })
  );
};

// ==================== Mutation Hooks ====================

export const useStartInvestigation = (): MutationState & {
  readonly submit: (input: StartInvestigationInput) => Promise<StartInvestigationResult | null>;
} => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: StartInvestigationInput) =>
      fetchMutation<StartInvestigationResult>("/api/v1/investigations", {
        method: "POST",
        body: { ...input, initiatedFrom: "frontend" },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.investigations.all });
    },
  });

  const submit = async (
    input: StartInvestigationInput
  ): Promise<StartInvestigationResult | null> => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    submit,
  };
};
