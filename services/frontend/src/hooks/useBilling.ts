/**
 * Billing Hooks
 *
 * Custom hooks for Stripe billing integration: checkout sessions,
 * customer portal, and billing status.
 * Uses TanStack Query for server state management.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchQuery, fetchMutation, fetchMutationRaw, ApiError } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { parseErrorBody } from "@/lib/fetchQuery";
import type { UseFetchResult } from "@/hooks/useQueryCompat";
import { toFetchResult } from "@/hooks/useQueryCompat";

// ==================== DTO Types ====================

export interface BillingStatusDTO {
  readonly hasStripeCustomer: boolean;
  readonly stripeCustomerId: string | null;
  readonly currentPeriodEnd: string | null;
  readonly planId: string;
  readonly status: string;
}

interface CheckoutResultDTO {
  readonly sessionId: string;
  readonly url: string;
}

interface PortalResultDTO {
  readonly url: string;
}

// ==================== Query Hook ====================

export const useBillingStatus = (): UseFetchResult<BillingStatusDTO> =>
  toFetchResult(
    useQuery({
      queryKey: queryKeys.billing.status(),
      queryFn: () => fetchQuery<BillingStatusDTO>("/api/v1/billing/status"),
    })
  );

// ==================== Mutation Hooks ====================

interface CreateCheckoutInput {
  readonly planId: string;
  readonly interval: "month" | "year";
}

export const useCreateCheckout = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: CreateCheckoutInput): Promise<CheckoutResultDTO> => {
      const successUrl = `${window.location.origin}/dashboard/settings?billing=success`;
      const cancelUrl = `${window.location.origin}/dashboard/settings?billing=canceled`;

      return fetchMutation<CheckoutResultDTO>("/api/v1/billing/checkout", {
        method: "POST",
        body: {
          planId: input.planId,
          interval: input.interval,
          successUrl,
          cancelUrl,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
    },
  });

  // Preserve the consumer-facing API: { createCheckout, isLoading, error }
  const createCheckout = async (
    planId: string,
    interval: "month" | "year"
  ): Promise<CheckoutResultDTO | null> => {
    try {
      return await mutation.mutateAsync({ planId, interval });
    } catch {
      return null;
    }
  };

  return {
    createCheckout,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
  };
};

export const useBillingPortal = () => {
  const mutation = useMutation({
    mutationFn: async (): Promise<string> => {
      const returnUrl = `${window.location.origin}/dashboard/settings`;
      const response = await fetchMutationRaw("/api/v1/billing/portal", {
        method: "POST",
        body: { returnUrl },
      });

      if (!response.ok) {
        const message = await parseErrorBody(response, `Portal failed (${response.status})`);
        throw new ApiError(message, response.status);
      }

      const json: { readonly data: PortalResultDTO } = await response.json();
      return json.data.url;
    },
  });

  const openPortal = async (): Promise<void> => {
    try {
      const url = await mutation.mutateAsync();

      // Defense-in-depth: validate the portal URL uses HTTPS before navigating.
      // The URL comes from our API but we verify protocol to prevent open redirect.
      try {
        const { protocol } = new URL(url);
        if (protocol !== "https:") {
          return;
        }
      } catch {
        return;
      }

      // Redirect to Stripe Customer Portal
      window.location.href = url;
    } catch {
      // Error is captured in mutation.error
    }
  };

  return {
    openPortal,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
  };
};
