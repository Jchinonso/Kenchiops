/**
 * Stripe Adapter
 *
 * Implements BillingPort using the Stripe SDK.
 * All Stripe SDK calls are isolated here — no vendor types cross this boundary.
 *
 * @module billing/stripeAdapter
 */

import Stripe from "stripe";
import { createLogger, getErrorMessage, ExternalServiceError } from "../core/index.js";
import { config } from "../core/config.js";
import {
  BILLING_QUERIES,
  type BillingPort,
  type CreateCheckoutInput,
  type CreatePortalInput,
  type CheckoutResult,
  type PortalResult,
  type StripeWebhookEvent,
  type BillingInterval,
} from "./types.js";
import { query } from "../database/common.js";

const logger = createLogger("stripe-adapter");

// ==================== Helpers ====================

/** Resolve the Stripe Price ID for a plan + interval. */
const resolveStripePriceId = async (planId: string, interval: BillingInterval): Promise<string> => {
  const result = await query<{
    readonly stripe_price_id_monthly: string | null;
    readonly stripe_price_id_yearly: string | null;
  }>(BILLING_QUERIES.GET_STRIPE_PRICE_ID, [planId]);

  const row = result.rows[0];
  if (!row) {
    throw new ExternalServiceError("stripe", `No plan found for planId: ${planId}`, {
      retryable: false,
    });
  }

  const priceId = interval === "year" ? row.stripe_price_id_yearly : row.stripe_price_id_monthly;
  if (!priceId) {
    throw new ExternalServiceError(
      "stripe",
      `No Stripe price configured for plan ${planId} (${interval})`,
      { retryable: false }
    );
  }

  return priceId;
};

/** Classify a Stripe SDK error for logging. */
const classifyStripeError = (
  error: unknown
): { readonly statusCode: number | undefined; readonly retryable: boolean } => {
  if (error instanceof Stripe.errors.StripeError) {
    const { statusCode } = error;
    const retryable = statusCode !== undefined && (statusCode >= 500 || statusCode === 429);
    return { statusCode, retryable };
  }
  return { statusCode: undefined, retryable: false };
};

// ==================== Factory ====================

/**
 * Create a Stripe billing adapter.
 *
 * @param stripeSecretKey - Stripe secret key (defaults to config)
 * @param stripeWebhookSecret - Stripe webhook signing secret (defaults to config)
 * @returns BillingPort implementation
 */
export const createStripeAdapter = (
  stripeSecretKey?: string,
  stripeWebhookSecret?: string
): BillingPort => {
  const secretKey = stripeSecretKey ?? config.STRIPE_SECRET_KEY;
  const webhookSecret = stripeWebhookSecret ?? config.STRIPE_WEBHOOK_SECRET;

  if (!secretKey) {
    logger.warn("STRIPE_SECRET_KEY not configured — billing adapter will throw on all calls");
  }

  // Lazy-initialize Stripe client (only when a call is made)
  // let: Stripe client must be lazily created — config may not be available at module load
  let stripeClient: Stripe | null = null; // let: lazy init

  const getClient = (): Stripe => {
    if (!stripeClient) {
      if (!secretKey) {
        throw new ExternalServiceError("stripe", "STRIPE_SECRET_KEY is not configured", {
          retryable: false,
        });
      }
      stripeClient = new Stripe(secretKey, {
        apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
        timeout: 30_000,
      });
    }
    return stripeClient;
  };

  return {
    createCheckoutSession: async (input: CreateCheckoutInput): Promise<CheckoutResult> => {
      const startTime = Date.now();
      const stripe = getClient();

      try {
        const priceId = await resolveStripePriceId(input.planId, input.interval);

        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          client_reference_id: input.tenantId,
          metadata: {
            tenantId: input.tenantId,
            userId: input.userId,
            planId: input.planId,
          },
        });

        const durationMs = Date.now() - startTime;
        logger.info("Stripe checkout session created", {
          provider: "stripe",
          operation: "createCheckoutSession",
          durationMs,
          sessionId: session.id,
          tenantId: input.tenantId,
          planId: input.planId,
        });

        if (!session.url) {
          throw new ExternalServiceError("stripe", "Checkout session created without URL", {
            retryable: false,
          });
        }

        return { sessionId: session.id, url: session.url };
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const classified = classifyStripeError(error);

        if (error instanceof ExternalServiceError) {
          throw error;
        }

        logger.error("Stripe checkout session creation failed", {
          provider: "stripe",
          operation: "createCheckoutSession",
          durationMs,
          statusCode: classified.statusCode,
          retryable: classified.retryable,
          tenantId: input.tenantId,
          error: getErrorMessage(error),
        });

        throw new ExternalServiceError("stripe", "Failed to create checkout session", {
          retryable: classified.retryable,
        });
      }
    },

    createPortalSession: async (input: CreatePortalInput): Promise<PortalResult> => {
      const startTime = Date.now();
      const stripe = getClient();

      try {
        // Look up Stripe customer ID for this tenant
        const subResult = await query<{ readonly stripe_customer_id: string | null }>(
          BILLING_QUERIES.FIND_BY_STRIPE_CUSTOMER,
          [input.tenantId]
        );

        // Try finding by tenant_id directly since FIND_BY_STRIPE_CUSTOMER searches by customer ID
        const tenantSub = await query<{ readonly stripe_customer_id: string | null }>(
          `SELECT stripe_customer_id FROM tenant_subscriptions WHERE tenant_id = $1`,
          [input.tenantId]
        );

        const customerId =
          tenantSub.rows[0]?.stripe_customer_id ?? subResult.rows[0]?.stripe_customer_id;
        if (!customerId) {
          throw new ExternalServiceError("stripe", "No Stripe customer found for this tenant", {
            retryable: false,
          });
        }

        const session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: input.returnUrl,
        });

        const durationMs = Date.now() - startTime;
        logger.info("Stripe portal session created", {
          provider: "stripe",
          operation: "createPortalSession",
          durationMs,
          tenantId: input.tenantId,
        });

        return { url: session.url };
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const classified = classifyStripeError(error);

        if (error instanceof ExternalServiceError) {
          throw error;
        }

        logger.error("Stripe portal session creation failed", {
          provider: "stripe",
          operation: "createPortalSession",
          durationMs,
          statusCode: classified.statusCode,
          retryable: classified.retryable,
          tenantId: input.tenantId,
          error: getErrorMessage(error),
        });

        throw new ExternalServiceError("stripe", "Failed to create billing portal session", {
          retryable: classified.retryable,
        });
      }
    },

    constructWebhookEvent: (payload: string | Buffer, signature: string): StripeWebhookEvent => {
      const stripe = getClient();

      if (!webhookSecret) {
        throw new ExternalServiceError("stripe", "STRIPE_WEBHOOK_SECRET is not configured", {
          retryable: false,
        });
      }

      try {
        const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

        return {
          id: event.id,
          type: event.type as StripeWebhookEvent["type"],
          data: {
            object: event.data.object as unknown as Readonly<Record<string, unknown>>,
          },
        };
      } catch (error) {
        logger.warn("Stripe webhook signature verification failed", {
          provider: "stripe",
          operation: "constructWebhookEvent",
          error: getErrorMessage(error),
        });

        throw new ExternalServiceError("stripe", "Invalid webhook signature", {
          retryable: false,
        });
      }
    },

    cancelSubscription: async (subscriptionId: string): Promise<void> => {
      const startTime = Date.now();
      const stripe = getClient();

      try {
        await stripe.subscriptions.cancel(subscriptionId);

        const durationMs = Date.now() - startTime;
        logger.info("Stripe subscription canceled", {
          provider: "stripe",
          operation: "cancelSubscription",
          durationMs,
          subscriptionId,
        });
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const classified = classifyStripeError(error);

        logger.error("Stripe subscription cancellation failed", {
          provider: "stripe",
          operation: "cancelSubscription",
          durationMs,
          statusCode: classified.statusCode,
          retryable: classified.retryable,
          subscriptionId,
          error: getErrorMessage(error),
        });

        throw new ExternalServiceError("stripe", "Failed to cancel subscription", {
          retryable: classified.retryable,
        });
      }
    },
  };
};
