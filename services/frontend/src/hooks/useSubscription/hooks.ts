/**
 * Subscription Data Hooks
 *
 * Custom hooks for fetching subscription plan data, usage, and plan changes.
 * Uses TanStack Query for GET requests and useMutation for writes.
 */

import { useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchQuery, fetchMutationRaw, ApiError, parseErrorBody } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { usePlanLimitError } from "@/hooks/usePlanLimitError";
import type {
  SubscriptionDTO,
  SubscriptionUsageDTO,
  PlanDTO,
  ChangePlanResultDTO,
  PlanLimitInfo,
} from "./types";

/** Plans are static catalog data — rarely change mid-session. */
const PLANS_STALE_TIME = 30 * 60 * 1000;

// ==================== Query Hooks ====================

export const useSubscription = () => {
  const query = useQuery({
    queryKey: queryKeys.subscription.info(),
    queryFn: () => fetchQuery<SubscriptionDTO>("/api/v1/subscription"),
  });

  return useMemo(
    () => ({
      data: query.data ?? null,
      isLoading: query.isPending,
      error: query.error?.message ?? null,
      refetch: query.refetch,
    }),
    [query.data, query.isPending, query.error, query.refetch]
  );
};

export const useSubscriptionUsage = () => {
  const query = useQuery({
    queryKey: queryKeys.subscription.usage(),
    queryFn: () => fetchQuery<SubscriptionUsageDTO>("/api/v1/subscription/usage"),
  });

  return useMemo(
    () => ({
      data: query.data ?? null,
      isLoading: query.isPending,
      error: query.error?.message ?? null,
    }),
    [query.data, query.isPending, query.error]
  );
};

export const usePlans = () => {
  const query = useQuery({
    queryKey: queryKeys.subscription.plans(),
    queryFn: () => fetchQuery<readonly PlanDTO[]>("/api/v1/subscription/plans"),
    staleTime: PLANS_STALE_TIME,
  });

  return useMemo(
    () => ({
      data: query.data ?? null,
      isLoading: query.isPending,
      error: query.error?.message ?? null,
    }),
    [query.data, query.isPending, query.error]
  );
};

// ==================== Mutation Hook ====================

export const useChangePlan = (): {
  readonly changePlan: (planId: string) => Promise<ChangePlanResultDTO | null>;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly planLimitError: PlanLimitInfo | null;
  readonly isLimitDialogOpen: boolean;
  readonly dismissLimitDialog: () => void;
} => {
  const queryClient = useQueryClient();
  const {
    planLimitError,
    isOpen: isLimitDialogOpen,
    checkResponse,
    dismiss: dismissLimitDialog,
  } = usePlanLimitError();

  const mutation = useMutation({
    mutationFn: async (planId: string): Promise<ChangePlanResultDTO | null> => {
      const response = await fetchMutationRaw("/api/v1/subscription/plan", {
        method: "PUT",
        body: { planId },
      });

      if (!response.ok) {
        // Detect plan limit error before parsing generic message
        const isLimitError = await checkResponse(response);
        if (isLimitError) {
          // Return null to signal plan limit — not an exception, handled via dialog
          return null;
        }

        const message = await parseErrorBody(
          response,
          `Failed to change plan (${response.status})`
        );
        throw new ApiError(message, response.status);
      }

      const json: { readonly data: ChangePlanResultDTO } = await response.json();
      return json.data;
    },
    onSuccess: (result) => {
      if (result) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
      }
    },
  });

  const changePlan = useCallback(
    async (planId: string): Promise<ChangePlanResultDTO | null> => {
      try {
        return await mutation.mutateAsync(planId);
      } catch {
        return null;
      }
    },
    [mutation]
  );

  return {
    changePlan,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    planLimitError,
    isLimitDialogOpen,
    dismissLimitDialog,
  };
};
