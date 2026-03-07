/**
 * Investigation Data Hooks
 *
 * Custom hooks for fetching investigation data from the API.
 * Uses TanStack Query for server state management with automatic
 * polling for active investigations via refetchInterval.
 */

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { fetchQuery, fetchMutation } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { useToFetchResult, type UseFetchResult, type MutationState } from "@/hooks/useQueryCompat";
import {
  isValidUuid,
  isActiveStatus,
  INVESTIGATION_POLLING_CONFIG,
  buildInvestigationsUrl,
} from "./helpers";
import type {
  InvestigationRecord,
  PaginatedInvestigations,
  StartInvestigationInput,
  StartInvestigationResult,
} from "./types";

// ==================== Query Hooks ====================

export const useInvestigations = (
  tenantId: string,
  limit: number = 20,
  offset: number = 0,
  status?: string
): UseFetchResult<PaginatedInvestigations> =>
  useToFetchResult(
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

  return useToFetchResult(
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
        return INVESTIGATION_POLLING_CONFIG.fallbackIntervalMs;
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

  const submit = useCallback(
    async (input: StartInvestigationInput): Promise<StartInvestigationResult | null> => {
      try {
        return await mutation.mutateAsync(input);
      } catch {
        return null;
      }
    },
    [mutation]
  );

  return {
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    submit,
  };
};
