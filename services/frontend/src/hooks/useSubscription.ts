/**
 * Subscription Data Hooks
 *
 * Custom hooks for fetching subscription plan data, usage, and plan changes.
 * Uses TanStack Query for GET requests and useMutation for writes.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchQuery, fetchMutationRaw, ApiError } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { parseErrorBody } from "@/lib/fetchQuery";
import { usePlanLimitError } from "@/hooks/usePlanLimitError";

// ==================== DTO Types ====================

interface PlanLimitsDTO {
  readonly maxRepositories: number | null;
  readonly maxAnalysesMonthly: number | null;
  readonly maxIntegrations: number | null;
  readonly maxTeamMembers: number | null;
}

interface PlanFeaturesDTO {
  readonly slackIntegration: boolean;
  readonly customRules: boolean;
  readonly teamAnalytics: boolean;
  readonly ssoSaml: boolean;
  readonly auditLog: boolean;
  readonly apiAccess: boolean;
  readonly prioritySupport: boolean;
}

export interface PlanDTO {
  readonly id: string;
  readonly displayName: string;
  readonly priceMonthlyCents: number | null;
  readonly limits: PlanLimitsDTO;
  readonly features: PlanFeaturesDTO;
}

interface SubscriptionInfoDTO {
  readonly planId: string;
  readonly status: string;
  readonly trialEndsAt: string | null;
  readonly changedAt: string | null;
}

export interface SubscriptionDTO {
  readonly plan: PlanDTO;
  readonly subscription: SubscriptionInfoDTO;
}

export interface UsageLimitDTO {
  readonly current: number;
  readonly limit: number | null;
  readonly limited: boolean;
}

export interface SubscriptionUsageDTO {
  readonly planId: string;
  readonly usage: {
    readonly repositories: UsageLimitDTO;
    readonly analysesThisMonth: UsageLimitDTO;
    readonly integrations: UsageLimitDTO;
    readonly teamMembers: UsageLimitDTO;
  };
}

interface ChangePlanResultDTO {
  readonly subscription: {
    readonly planId: string;
    readonly status: string;
    readonly changedAt: string;
  };
  readonly previousPlanId: string;
}

// ==================== Query Hooks ====================

export const useSubscription = () => {
  const query = useQuery({
    queryKey: queryKeys.subscription.info(),
    queryFn: () => fetchQuery<SubscriptionDTO>("/api/v1/subscription"),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
};

export const useSubscriptionUsage = () => {
  const query = useQuery({
    queryKey: queryKeys.subscription.usage(),
    queryFn: () => fetchQuery<SubscriptionUsageDTO>("/api/v1/subscription/usage"),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    error: query.error?.message ?? null,
  };
};

export const usePlans = () => {
  const query = useQuery({
    queryKey: queryKeys.subscription.plans(),
    queryFn: () => fetchQuery<readonly PlanDTO[]>("/api/v1/subscription/plans"),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    error: query.error?.message ?? null,
  };
};

// ==================== Mutation Hook ====================

interface PlanLimitInfo {
  readonly limitKey: string;
  readonly currentUsage: number;
  readonly limit: number;
  readonly currentPlan: string;
}

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

  const changePlan = async (planId: string): Promise<ChangePlanResultDTO | null> => {
    try {
      return await mutation.mutateAsync(planId);
    } catch {
      return null;
    }
  };

  return {
    changePlan,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    planLimitError,
    isLimitDialogOpen,
    dismissLimitDialog,
  };
};
