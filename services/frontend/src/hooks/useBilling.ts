/**
 * Billing Hooks
 *
 * Custom hooks for Stripe billing integration: checkout sessions,
 * customer portal, and billing status.
 */

import { useState, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";
import {
  useFetch,
  parseErrorBody,
  type UseFetchResult,
  type MutationState,
} from "@/hooks/useFetch";

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

export const useBillingStatus = (refreshKey: number = 0): UseFetchResult<BillingStatusDTO> =>
  useFetch<BillingStatusDTO>("/api/v1/billing/status", `${refreshKey}`);

// ==================== Mutation Hooks ====================

export const useCreateCheckout = (): MutationState & {
  readonly createCheckout: (
    planId: string,
    interval: "month" | "year"
  ) => Promise<CheckoutResultDTO | null>;
} => {
  const [state, setState] = useState<MutationState>({ isLoading: false, error: null });

  const createCheckout = useCallback(
    async (planId: string, interval: "month" | "year"): Promise<CheckoutResultDTO | null> => {
      setState({ isLoading: true, error: null });
      try {
        const successUrl = `${window.location.origin}/dashboard/settings?billing=success`;
        const cancelUrl = `${window.location.origin}/dashboard/settings?billing=canceled`;

        const response = await apiClient("/api/v1/billing/checkout", {
          method: "POST",
          body: { planId, interval, successUrl, cancelUrl },
        });

        if (!response.ok) {
          const message = await parseErrorBody(response, `Checkout failed (${response.status})`);
          setState({ isLoading: false, error: message });
          return null;
        }

        const json: { readonly data: CheckoutResultDTO } = await response.json();
        setState({ isLoading: false, error: null });
        return json.data;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Unknown error";
        setState({ isLoading: false, error: message });
        return null;
      }
    },
    []
  );

  return { ...state, createCheckout };
};

export const useBillingPortal = (): MutationState & {
  readonly openPortal: () => Promise<void>;
} => {
  const [state, setState] = useState<MutationState>({ isLoading: false, error: null });

  const openPortal = useCallback(async (): Promise<void> => {
    setState({ isLoading: true, error: null });
    try {
      const returnUrl = `${window.location.origin}/dashboard/settings`;

      const response = await apiClient("/api/v1/billing/portal", {
        method: "POST",
        body: { returnUrl },
      });

      if (!response.ok) {
        const message = await parseErrorBody(response, `Portal failed (${response.status})`);
        setState({ isLoading: false, error: message });
        return;
      }

      const json: { readonly data: PortalResultDTO } = await response.json();
      setState({ isLoading: false, error: null });

      // Defense-in-depth: validate the portal URL uses HTTPS before navigating.
      // The URL comes from our API but we verify protocol to prevent open redirect.
      try {
        const { protocol } = new URL(json.data.url);
        if (protocol !== "https:") {
          setState({ isLoading: false, error: "Invalid portal URL" });
          return;
        }
      } catch {
        setState({ isLoading: false, error: "Invalid portal URL" });
        return;
      }

      // Redirect to Stripe Customer Portal
      window.location.href = json.data.url;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown error";
      setState({ isLoading: false, error: message });
    }
  }, []);

  return { ...state, openPortal };
};
