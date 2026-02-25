/**
 * Billing Service
 *
 * Business logic for subscription billing operations.
 * Orchestrates between Stripe adapter and subscription repository.
 *
 * @module billing/billingService
 */

import { createLogger, ValidationError, NotFoundError } from "../core/index.js";
import {
  getSubscriptionByTenant,
  getSubscriptionWithPlan,
  changePlan,
} from "../database/subscription/repository.js";
import { validatePlanId } from "../database/subscription/helpers.js";
import { logAuditEvent } from "../database/tenant/audit.js";
import { AUDIT_ACTIONS } from "../constants/tenant.js";
import { DEFAULT_PLAN_ID } from "../constants/subscription.js";
import type { PlanId } from "../database/subscription/types.js";
import type { RequestContext } from "../core/types.js";
import type {
  BillingPort,
  CreateCheckoutInput,
  CreatePortalInput,
  CheckoutResult,
  PortalResult,
  BillingStatus,
} from "./types.js";

const logger = createLogger("billing-service");

// ==================== Types ====================

export interface BillingService {
  readonly createCheckout: (
    input: CreateCheckoutInput,
    context: RequestContext
  ) => Promise<CheckoutResult>;
  readonly createPortal: (
    input: CreatePortalInput,
    context: RequestContext
  ) => Promise<PortalResult>;
  readonly getStatus: (tenantId: string, context: RequestContext) => Promise<BillingStatus>;
  readonly cancelSubscription: (tenantId: string, context: RequestContext) => Promise<void>;
}

// ==================== Factory ====================

/**
 * Create the billing service with injected adapter.
 *
 * @param billingAdapter - Stripe adapter (or mock for tests)
 * @returns BillingService with all billing operations
 */
export const createBillingService = (billingAdapter: BillingPort): BillingService => ({
  createCheckout: async (
    input: CreateCheckoutInput,
    context: RequestContext
  ): Promise<CheckoutResult> => {
    // Validate plan ID
    const validatedPlanId = validatePlanId(input.planId);

    if (validatedPlanId === DEFAULT_PLAN_ID) {
      throw new ValidationError("Cannot create checkout for free plan", {
        operation: "createCheckout",
        metadata: { planId: input.planId },
      });
    }

    logger.info("Creating checkout session", {
      ...context,
      planId: validatedPlanId,
      interval: input.interval,
    });

    const result = await billingAdapter.createCheckoutSession({
      ...input,
      planId: validatedPlanId,
    });

    await logAuditEvent(input.tenantId, AUDIT_ACTIONS.CHECKOUT_STARTED, {
      planId: validatedPlanId,
      interval: input.interval,
      sessionId: result.sessionId,
    });

    return result;
  },

  createPortal: async (
    input: CreatePortalInput,
    context: RequestContext
  ): Promise<PortalResult> => {
    const subscription = await getSubscriptionByTenant(input.tenantId);

    if (!subscription?.stripeCustomerId) {
      throw new NotFoundError("No billing account found for this tenant", {
        metadata: { tenantId: input.tenantId },
      });
    }

    logger.info("Creating billing portal session", { ...context });

    return billingAdapter.createPortalSession(input);
  },

  getStatus: async (tenantId: string, context: RequestContext): Promise<BillingStatus> => {
    const subscriptionWithPlan = await getSubscriptionWithPlan(tenantId);

    if (!subscriptionWithPlan) {
      logger.info("No subscription found, returning free plan status", { ...context });
      return {
        hasStripeCustomer: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        planId: DEFAULT_PLAN_ID as PlanId,
        status: "active",
      };
    }

    const { subscription } = subscriptionWithPlan;

    return {
      hasStripeCustomer: !!subscription.stripeCustomerId,
      stripeCustomerId: subscription.stripeCustomerId ?? null,
      stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd ?? null,
      planId: subscription.planId,
      status: subscription.status,
    };
  },

  cancelSubscription: async (tenantId: string, context: RequestContext): Promise<void> => {
    const subscription = await getSubscriptionByTenant(tenantId);

    if (!subscription?.stripeSubscriptionId) {
      throw new NotFoundError("No active Stripe subscription found", {
        metadata: { tenantId },
      });
    }

    logger.info("Canceling subscription", {
      ...context,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });

    await billingAdapter.cancelSubscription(subscription.stripeSubscriptionId);

    // Downgrade to free plan
    await changePlan({
      tenantId,
      newPlanId: DEFAULT_PLAN_ID as PlanId,
      changedBy: context.actor ?? "system",
    });

    await logAuditEvent(tenantId, AUDIT_ACTIONS.PLAN_CHANGED, {
      previousPlanId: subscription.planId,
      newPlanId: DEFAULT_PLAN_ID,
      reason: "subscription_canceled",
    });

    logger.info("Subscription canceled and downgraded to free", { ...context });
  },
});
