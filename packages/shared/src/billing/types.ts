/**
 * Billing Module Types
 *
 * Type definitions for Stripe billing integration.
 *
 * @module billing/types
 */

import type { PlanId, SubscriptionStatus } from "../database/subscription/types.js";

// ==================== Stripe Domain Types ====================

export type BillingInterval = "month" | "year";

export type CheckoutStatus = "pending" | "completed" | "expired";

export type StripeWebhookEventType =
  | "checkout.session.completed"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "customer.subscription.updated"
  | "customer.subscription.deleted";

// ==================== Input Types ====================

export interface CreateCheckoutInput {
  readonly tenantId: string;
  readonly planId: PlanId;
  readonly interval: BillingInterval;
  readonly userId: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
}

export interface CreatePortalInput {
  readonly tenantId: string;
  readonly returnUrl: string;
}

// ==================== Result Types ====================

export interface CheckoutResult {
  readonly sessionId: string;
  readonly url: string;
}

export interface PortalResult {
  readonly url: string;
}

export interface BillingStatus {
  readonly hasStripeCustomer: boolean;
  readonly stripeCustomerId: string | null;
  readonly stripeSubscriptionId: string | null;
  readonly currentPeriodEnd: Date | null;
  readonly planId: PlanId;
  readonly status: SubscriptionStatus;
}

// ==================== Webhook Types ====================

export interface StripeWebhookEvent {
  readonly id: string;
  readonly type: StripeWebhookEventType;
  readonly data: {
    readonly object: Readonly<Record<string, unknown>>;
  };
}

export interface WebhookProcessResult {
  readonly processed: boolean;
  readonly eventType: string;
  readonly tenantId?: string;
  readonly action?: string;
}

// ==================== Adapter Port ====================

/**
 * Port interface for Stripe operations.
 * Vendor SDK calls are isolated behind this interface.
 */
export interface BillingPort {
  readonly createCheckoutSession: (input: CreateCheckoutInput) => Promise<CheckoutResult>;
  readonly createPortalSession: (input: CreatePortalInput) => Promise<PortalResult>;
  readonly constructWebhookEvent: (
    payload: string | Buffer,
    signature: string
  ) => StripeWebhookEvent;
  readonly cancelSubscription: (subscriptionId: string) => Promise<void>;
}

// ==================== DB Row Types ====================

export interface BillingEventRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly stripe_event_id: string;
  readonly event_type: string;
  readonly status: string;
  readonly metadata: Record<string, unknown>;
  readonly created_at: Date;
}

// ==================== Constants ====================

export const BILLING_CONSTANTS = {
  /** Stripe event ID prefix for validation */
  STRIPE_EVENT_PREFIX: "evt_",
  /** Stripe customer ID prefix */
  STRIPE_CUSTOMER_PREFIX: "cus_",
  /** Stripe subscription ID prefix */
  STRIPE_SUBSCRIPTION_PREFIX: "sub_",
  /** Billing event log ID prefix */
  BILLING_EVENT_ID_PREFIX: "bil",
} as const;

export const BILLING_QUERIES = {
  FIND_BILLING_EVENT: `SELECT * FROM billing_events WHERE stripe_event_id = $1`,

  INSERT_BILLING_EVENT: `INSERT INTO billing_events (tenant_id, stripe_event_id, event_type, status, metadata)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (stripe_event_id) DO NOTHING
                         RETURNING *`,

  UPDATE_STRIPE_CUSTOMER: `UPDATE tenant_subscriptions
                           SET stripe_customer_id = $1, updated_at = NOW()
                           WHERE tenant_id = $2`,

  UPDATE_STRIPE_SUBSCRIPTION: `UPDATE tenant_subscriptions
                               SET stripe_subscription_id = $1,
                                   stripe_customer_id = $2,
                                   plan_id = $3,
                                   status = $4,
                                   current_period_end = $5,
                                   updated_at = NOW()
                               WHERE tenant_id = $6
                               RETURNING *`,

  UPDATE_PERIOD_END: `UPDATE tenant_subscriptions
                      SET current_period_end = $1, status = 'active', updated_at = NOW()
                      WHERE stripe_subscription_id = $2`,

  SET_PAST_DUE: `UPDATE tenant_subscriptions
                 SET status = 'past_due', updated_at = NOW()
                 WHERE stripe_subscription_id = $1`,

  CANCEL_SUBSCRIPTION: `UPDATE tenant_subscriptions
                        SET status = 'canceled', stripe_subscription_id = NULL, updated_at = NOW()
                        WHERE stripe_subscription_id = $1
                        RETURNING *`,

  FIND_BY_STRIPE_CUSTOMER: `SELECT * FROM tenant_subscriptions WHERE stripe_customer_id = $1`,

  FIND_BY_STRIPE_SUBSCRIPTION: `SELECT * FROM tenant_subscriptions WHERE stripe_subscription_id = $1`,

  GET_STRIPE_PRICE_ID: `SELECT stripe_price_id_monthly, stripe_price_id_yearly FROM plans WHERE id = $1`,

  /** Delete billing events older than a specified interval. Parameterized: $1 = interval (e.g. '90 days'). */
  CLEANUP_OLD_BILLING_EVENTS: `DELETE FROM billing_events WHERE created_at < NOW() - $1::interval RETURNING id`,
} as const;
