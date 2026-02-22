/**
 * Subscription Data Hooks
 *
 * Custom hooks for fetching subscription plan data, usage, and plan changes.
 * Uses shared useFetch hook for GET requests and manual apiClient for mutations.
 */

import { useState, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";
import {
  useFetch,
  parseErrorBody,
  type UseFetchResult,
  type MutationState,
} from "@/hooks/useFetch";
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

export const useSubscription = (refreshKey: number = 0): UseFetchResult<SubscriptionDTO> =>
  useFetch<SubscriptionDTO>("/api/v1/subscription", `${refreshKey}`);

export const useSubscriptionUsage = (
  refreshKey: number = 0
): UseFetchResult<SubscriptionUsageDTO> =>
  useFetch<SubscriptionUsageDTO>("/api/v1/subscription/usage", `${refreshKey}`);

export const usePlans = (refreshKey: number = 0): UseFetchResult<readonly PlanDTO[]> =>
  useFetch<readonly PlanDTO[]>("/api/v1/subscription/plans", `${refreshKey}`);

// ==================== Mutation Hook ====================

interface PlanLimitInfo {
  readonly limitKey: string;
  readonly currentUsage: number;
  readonly limit: number;
  readonly currentPlan: string;
}

export const useChangePlan = (): MutationState & {
  readonly changePlan: (planId: string) => Promise<ChangePlanResultDTO | null>;
  readonly planLimitError: PlanLimitInfo | null;
  readonly isLimitDialogOpen: boolean;
  readonly dismissLimitDialog: () => void;
} => {
  const [state, setState] = useState<MutationState>({ isLoading: false, error: null });
  const {
    planLimitError,
    isOpen: isLimitDialogOpen,
    checkResponse,
    dismiss: dismissLimitDialog,
  } = usePlanLimitError();

  const changePlan = useCallback(
    async (planId: string): Promise<ChangePlanResultDTO | null> => {
      setState({ isLoading: true, error: null });
      try {
        const response = await apiClient("/api/v1/subscription/plan", {
          method: "PUT",
          body: { planId },
        });
        if (!response.ok) {
          // Detect plan limit error before parsing generic message
          const isLimitError = await checkResponse(response);
          if (isLimitError) {
            setState({ isLoading: false, error: null });
            return null;
          }
          const message = await parseErrorBody(
            response,
            `Failed to change plan (${response.status})`
          );
          setState({ isLoading: false, error: message });
          return null;
        }
        const json: { readonly data: ChangePlanResultDTO } = await response.json();
        setState({ isLoading: false, error: null });
        return json.data;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Unknown error";
        setState({ isLoading: false, error: message });
        return null;
      }
    },
    [checkResponse]
  );

  return { ...state, changePlan, planLimitError, isLimitDialogOpen, dismissLimitDialog };
};
