/**
 * Investigation Data Hooks
 *
 * Custom hooks for fetching investigation data from the API.
 * Uses native fetch via apiClient with useState/useEffect.
 * Follows the same pattern as useIncidentData.ts.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "@/lib/apiClient";
// Inlined from @kenchi/shared — frontend Docker build context does not include shared package
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const investigationPollingConfig = {
  intervalMs: 3000,
  maxPollCount: 200,
} as const;

// ==================== Types ====================

interface FetchState<T> {
  readonly data: T | null;
  readonly isLoading: boolean;
  readonly error: string | null;
}

interface UseFetchResult<T> extends FetchState<T> {
  readonly refetch: () => void;
}

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

interface MutationState {
  readonly isLoading: boolean;
  readonly error: string | null;
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

/** Truncate error messages to prevent internal details from leaking to the UI */
const sanitizeErrorMessage = (message: string): string =>
  message.length > 200 ? `${message.slice(0, 200)}...` : message;

// ==================== Validation ====================

/** Validates that an ID is a UUID to prevent path traversal via crafted IDs */
const isValidUuid = (value: string): boolean => uuidPattern.test(value);

// ==================== Polling Constants ====================

const isActiveStatus = (status: string): boolean =>
  status === "queued" || status === "gathering" || status === "analyzing";

// ==================== Generic Fetch Hook ====================

/**
 * Generic data-fetching hook with loading/error states and cancellation.
 * Replicates the same pattern as useIncidentData.ts useFetch.
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

          setState({ data: null, isLoading: false, error: sanitizeErrorMessage(errorMessage) });
          return;
        }

        const json: { readonly data: T } = await response.json();
        setState({ data: json.data, isLoading: false, error: null });
      } catch (caught) {
        if (cancelled) {
          return;
        }
        const message = caught instanceof Error ? caught.message : "Unknown error";
        setState({ data: null, isLoading: false, error: sanitizeErrorMessage(message) });
      }
    };

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [path, refreshKey, depsKey]);

  // Derive final state: when path is empty, override to idle
  const resolvedState: FetchState<T> = path ? state : { data: null, isLoading: false, error: null };

  return { ...resolvedState, refetch };
};

// ==================== URL Builders ====================

const buildInvestigationsUrl = (
  tenantId: string,
  limit: number,
  offset: number,
  status?: string
): string => {
  const params = new URLSearchParams();
  params.set("tenantId", tenantId);
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
    tenantId ? buildInvestigationsUrl(tenantId, limit, offset, status) : "",
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
          result.refetch();
        }, investigationPollingConfig.intervalMs)
      );
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
    // Only re-run when status changes (not on every refetch)
  }, [currentStatus]); // eslint-disable-line

  return result;
};

// ==================== Mutation Helpers ====================

/** Safely parse an error message from an API response body, truncated for display safety */
const parseErrorBody = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body: unknown = await response.json();
    const parsed = body as { readonly error?: { readonly message?: string } } | null;
    return sanitizeErrorMessage(parsed?.error?.message ?? fallback);
  } catch {
    return sanitizeErrorMessage(fallback);
  }
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
