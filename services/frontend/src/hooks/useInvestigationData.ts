/**
 * Investigation Data Hooks
 *
 * Custom hooks for fetching investigation data from the API.
 * Uses shared useFetch hook with polling for active investigations.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "@/lib/apiClient";
import {
  useFetch,
  sanitizeErrorMessage,
  parseErrorBody,
  type UseFetchResult,
  type MutationState,
} from "@/hooks/useFetch";

// Inlined from @kenchi/shared — frontend Docker build context does not include shared package
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const investigationPollingConfig = {
  intervalMs: 3000,
  maxPollCount: 200,
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

// ==================== Helpers ====================

/** Helper to set a ref value without triggering the object-mutation lint rule */
const setRef = <T>(ref: React.MutableRefObject<T>, value: T): void => {
  Object.assign(ref, { current: value });
};

// ==================== Validation ====================

/** Validates that an ID is a UUID to prevent path traversal via crafted IDs */
const isValidUuid = (value: string): boolean => uuidPattern.test(value);

// ==================== Polling Constants ====================

const isActiveStatus = (status: string): boolean =>
  status === "queued" || status === "gathering" || status === "analyzing";

// ==================== URL Builders ====================

const buildInvestigationsUrl = (limit: number, offset: number, status?: string): string => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (status) {
    params.set("status", status);
  }
  return `/api/v1/investigations?${params.toString()}`;
};

// ==================== Typed Hooks ====================

export const useInvestigations = (
  tenantId: string,
  limit: number = 20,
  offset: number = 0,
  refreshKey: number = 0,
  status?: string
): UseFetchResult<PaginatedInvestigations> =>
  useFetch<PaginatedInvestigations>(
    tenantId ? buildInvestigationsUrl(limit, offset, status) : "",
    `${tenantId}:${limit}:${offset}:${refreshKey}:${status ?? ""}`
  );

export const useInvestigationDetail = (
  id: string | null,
  refreshKey: number = 0
): UseFetchResult<InvestigationRecord> => {
  // Validate ID format to prevent path traversal (e.g., "../../admin/users")
  const safeId = id && isValidUuid(id) ? id : null;

  const result = useFetch<InvestigationRecord>(
    safeId ? `/api/v1/investigations/${safeId}` : "",
    `${safeId ?? ""}:${refreshKey}`
  );

  // Extract stable refetch reference for polling effect deps
  const refetchFn = result.refetch;

  // Auto-poll when investigation is in an active state, with bounded retries
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const pollCountRef = useRef(0);
  const currentStatus = result.data?.status;

  useEffect(() => {
    // Reset poll count when status changes
    setRef(pollCountRef, 0);

    if (currentStatus && isActiveStatus(currentStatus)) {
      setRef(
        intervalRef,
        setInterval(() => {
          const nextCount = pollCountRef.current + 1;
          setRef(pollCountRef, nextCount);
          if (nextCount >= investigationPollingConfig.maxPollCount) {
            // Stop polling after max attempts to prevent indefinite load
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
            return;
          }
          refetchFn();
        }, investigationPollingConfig.intervalMs)
      );
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [currentStatus, refetchFn]);

  return result;
};

// ==================== Mutation Hooks ====================

export const useStartInvestigation = (): MutationState & {
  readonly submit: (input: StartInvestigationInput) => Promise<StartInvestigationResult | null>;
} => {
  const [state, setState] = useState<MutationState>({ isLoading: false, error: null });

  const submit = useCallback(
    async (input: StartInvestigationInput): Promise<StartInvestigationResult | null> => {
      setState({ isLoading: true, error: null });
      try {
        const response = await apiClient("/api/v1/investigations", {
          method: "POST",
          body: {
            ...input,
            initiatedFrom: "frontend",
          },
        });
        if (!response.ok) {
          const message = await parseErrorBody(
            response,
            `Failed to start investigation (${response.status})`
          );
          setState({ isLoading: false, error: message });
          return null;
        }
        const json: { readonly data: StartInvestigationResult } = await response.json();
        setState({ isLoading: false, error: null });
        return json.data;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Unknown error";
        setState({ isLoading: false, error: sanitizeErrorMessage(message) });
        return null;
      }
    },
    []
  );

  return { ...state, submit };
};
