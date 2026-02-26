/**
 * Stripe Webhook Handler
 *
 * Processes Stripe webhook events and updates subscription state.
 * All event handlers are idempotent (billing_events table dedup).
 *
 * @module billing/webhookHandler
 */

import { createLogger, getErrorMessage } from "../core/index.js";
import type { RequestContext } from "../core/types.js";
import { query } from "../database/common.js";
import { logAuditEvent } from "../database/tenant/audit.js";
import { AUDIT_ACTIONS } from "../constants/tenant.js";
import { DEFAULT_PLAN_ID } from "../constants/subscription.js";
import {
  BILLING_QUERIES,
  type StripeWebhookEvent,
  type StripeWebhookEventType,
  type WebhookProcessResult,
} from "./types.js";

const logger = createLogger("billing-webhook");

// ==================== Helpers ====================

/** Check if a billing event has already been processed (idempotency). */
const isEventProcessed = async (stripeEventId: string): Promise<boolean> => {
  const result = await query<{ readonly id: string }>(BILLING_QUERIES.FIND_BILLING_EVENT, [
    stripeEventId,
  ]);
  return result.rows.length > 0;
};

/** Record a billing event in the audit log. */
const recordBillingEvent = async (
  tenantId: string,
  stripeEventId: string,
  eventType: string,
  status: string,
  metadata: Readonly<Record<string, unknown>> = {}
): Promise<void> => {
  await query(BILLING_QUERIES.INSERT_BILLING_EVENT, [
    tenantId,
    stripeEventId,
    eventType,
    status,
    JSON.stringify(metadata),
  ]);
};

/**
 * Extract a string value safely from a Stripe event object.
 */
const extractString = (obj: Readonly<Record<string, unknown>>, key: string): string | null => {
  const value = obj[key];
  return typeof value === "string" ? value : null;
};

/**
 * Extract a number value safely from a Stripe event object.
 */
const extractNumber = (obj: Readonly<Record<string, unknown>>, key: string): number | null => {
  const value = obj[key];
  return typeof value === "number" ? value : null;
};

/**
 * Extract nested metadata safely.
 */
const extractMetadata = (
  obj: Readonly<Record<string, unknown>>
): Readonly<Record<string, string>> => {
  const meta = obj.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    return meta as Readonly<Record<string, string>>;
  }
  return {};
};

// ==================== Event Handler Type ====================

type WebhookEventHandler = (
  event: StripeWebhookEvent,
  context: RequestContext
) => Promise<WebhookProcessResult>;

// ==================== Event Handlers ====================

/**
 * Handle checkout.session.completed: Link Stripe customer to tenant and activate subscription.
 */
const handleCheckoutCompleted: WebhookEventHandler = async (event, context) => {
  const session = event.data.object;
  const metadata = extractMetadata(session);
  const tenantId = metadata.tenantId ?? extractString(session, "client_reference_id");

  if (!tenantId) {
    logger.warn("Checkout completed without tenantId", { ...context, eventId: event.id });
    return { processed: false, eventType: event.type, action: "skipped_no_tenant" };
  }

  const customerId = extractString(session, "customer");
  const subscriptionId = extractString(session, "subscription");
  const planId = metadata.planId ?? DEFAULT_PLAN_ID;

  if (customerId) {
    await query(BILLING_QUERIES.UPDATE_STRIPE_CUSTOMER, [customerId, tenantId]);
  }

  if (subscriptionId && customerId) {
    await query(BILLING_QUERIES.UPDATE_STRIPE_SUBSCRIPTION, [
      subscriptionId,
      customerId,
      planId,
      "active",
      null, // current_period_end will be set by invoice.paid
      tenantId,
    ]);
  }

  await logAuditEvent(tenantId, AUDIT_ACTIONS.PLAN_CHANGED, {
    newPlanId: planId,
    source: "stripe_checkout",
    stripeCustomerId: customerId,
  });

  await recordBillingEvent(tenantId, event.id, event.type, "processed", {
    customerId,
    subscriptionId,
    planId,
  });

  logger.info("Checkout completed", {
    ...context,
    provider: "stripe",
    operation: "handleCheckoutCompleted",
    tenantId,
    planId,
  });

  return { processed: true, eventType: event.type, tenantId, action: "subscription_activated" };
};

/**
 * Handle invoice.paid: Update billing period end date.
 */
const handleInvoicePaid: WebhookEventHandler = async (event, context) => {
  const invoice = event.data.object;
  const subscriptionId = extractString(invoice, "subscription");
  const periodEnd = extractNumber(invoice, "period_end");

  if (!subscriptionId) {
    return { processed: false, eventType: event.type, action: "skipped_no_subscription" };
  }

  // Find tenant by subscription ID
  const subResult = await query<{ readonly tenant_id: string }>(
    BILLING_QUERIES.FIND_BY_STRIPE_SUBSCRIPTION,
    [subscriptionId]
  );
  const tenantId = subResult.rows[0]?.tenant_id;

  if (!tenantId) {
    logger.warn("Invoice paid for unknown subscription", {
      ...context,
      provider: "stripe",
      operation: "handleInvoicePaid",
      subscriptionId,
    });
    return { processed: false, eventType: event.type, action: "skipped_unknown_subscription" };
  }

  if (periodEnd) {
    const periodEndDate = new Date(periodEnd * 1000);
    await query(BILLING_QUERIES.UPDATE_PERIOD_END, [periodEndDate.toISOString(), subscriptionId]);
  }

  await recordBillingEvent(tenantId, event.id, event.type, "processed", {
    subscriptionId,
    periodEnd,
  });

  logger.info("Invoice paid", {
    ...context,
    provider: "stripe",
    operation: "handleInvoicePaid",
    tenantId,
    subscriptionId,
  });

  return { processed: true, eventType: event.type, tenantId, action: "period_extended" };
};

/**
 * Handle invoice.payment_failed: Set subscription to past_due.
 */
const handlePaymentFailed: WebhookEventHandler = async (event, context) => {
  const invoice = event.data.object;
  const subscriptionId = extractString(invoice, "subscription");

  if (!subscriptionId) {
    return { processed: false, eventType: event.type, action: "skipped_no_subscription" };
  }

  const subResult = await query<{ readonly tenant_id: string }>(
    BILLING_QUERIES.FIND_BY_STRIPE_SUBSCRIPTION,
    [subscriptionId]
  );
  const tenantId = subResult.rows[0]?.tenant_id;

  if (!tenantId) {
    return { processed: false, eventType: event.type, action: "skipped_unknown_subscription" };
  }

  await query(BILLING_QUERIES.SET_PAST_DUE, [subscriptionId]);

  await logAuditEvent(tenantId, AUDIT_ACTIONS.PAYMENT_FAILED, {
    subscriptionId,
    source: "stripe_webhook",
  });

  await recordBillingEvent(tenantId, event.id, event.type, "processed", { subscriptionId });

  logger.warn("Payment failed", {
    ...context,
    provider: "stripe",
    operation: "handlePaymentFailed",
    tenantId,
    subscriptionId,
  });

  return { processed: true, eventType: event.type, tenantId, action: "set_past_due" };
};

/**
 * Handle customer.subscription.updated: Sync plan changes from Stripe.
 */
const handleSubscriptionUpdated: WebhookEventHandler = async (event, context) => {
  const subscription = event.data.object;
  const subscriptionId = extractString(subscription, "id");

  if (!subscriptionId) {
    return { processed: false, eventType: event.type, action: "skipped_no_id" };
  }

  const subResult = await query<{ readonly tenant_id: string; readonly plan_id: string }>(
    BILLING_QUERIES.FIND_BY_STRIPE_SUBSCRIPTION,
    [subscriptionId]
  );
  const tenantId = subResult.rows[0]?.tenant_id;

  if (!tenantId) {
    return { processed: false, eventType: event.type, action: "skipped_unknown_subscription" };
  }

  const metadata = extractMetadata(subscription);
  const newPlanId = metadata.planId;

  if (newPlanId) {
    const currentPeriodEnd = extractNumber(subscription, "current_period_end");
    const periodEndDate = currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null;
    const status = extractString(subscription, "status") === "active" ? "active" : "past_due";

    await query(BILLING_QUERIES.UPDATE_STRIPE_SUBSCRIPTION, [
      subscriptionId,
      extractString(subscription, "customer"),
      newPlanId,
      status,
      periodEndDate?.toISOString() ?? null,
      tenantId,
    ]);
  }

  await recordBillingEvent(tenantId, event.id, event.type, "processed", {
    subscriptionId,
    newPlanId,
  });

  logger.info("Subscription updated", {
    ...context,
    provider: "stripe",
    operation: "handleSubscriptionUpdated",
    tenantId,
    subscriptionId,
  });

  return { processed: true, eventType: event.type, tenantId, action: "subscription_synced" };
};

/**
 * Handle customer.subscription.deleted: Cancel and downgrade to free.
 */
const handleSubscriptionDeleted: WebhookEventHandler = async (event, context) => {
  const subscription = event.data.object;
  const subscriptionId = extractString(subscription, "id");

  if (!subscriptionId) {
    return { processed: false, eventType: event.type, action: "skipped_no_id" };
  }

  const cancelResult = await query<{ readonly tenant_id: string; readonly plan_id: string }>(
    BILLING_QUERIES.CANCEL_SUBSCRIPTION,
    [subscriptionId]
  );

  const tenantId = cancelResult.rows[0]?.tenant_id;

  if (!tenantId) {
    return { processed: false, eventType: event.type, action: "skipped_unknown_subscription" };
  }

  const previousPlanId = cancelResult.rows[0]?.plan_id ?? "unknown";

  // Downgrade to free plan
  await query(BILLING_QUERIES.DOWNGRADE_TO_FREE, [DEFAULT_PLAN_ID, tenantId]);

  await logAuditEvent(tenantId, AUDIT_ACTIONS.PLAN_CHANGED, {
    previousPlanId,
    newPlanId: DEFAULT_PLAN_ID,
    reason: "stripe_subscription_deleted",
  });

  await recordBillingEvent(tenantId, event.id, event.type, "processed", {
    subscriptionId,
    previousPlanId,
  });

  logger.info("Subscription deleted, downgraded to free", {
    ...context,
    provider: "stripe",
    operation: "handleSubscriptionDeleted",
    tenantId,
    previousPlanId,
  });

  return { processed: true, eventType: event.type, tenantId, action: "downgraded_to_free" };
};

// ==================== Event Router ====================

/** Map of event types to handlers. */
const EVENT_HANDLERS: Readonly<Record<StripeWebhookEventType, WebhookEventHandler>> = {
  "checkout.session.completed": handleCheckoutCompleted,
  "invoice.paid": handleInvoicePaid,
  "invoice.payment_failed": handlePaymentFailed,
  "customer.subscription.updated": handleSubscriptionUpdated,
  "customer.subscription.deleted": handleSubscriptionDeleted,
};

/**
 * Process a Stripe webhook event.
 * Idempotent: checks billing_events table before processing.
 *
 * @param event - Verified Stripe webhook event
 * @param context - Request context for tracing
 * @returns Processing result
 */
export const processStripeWebhook = async (
  event: StripeWebhookEvent,
  context: RequestContext
): Promise<WebhookProcessResult> => {
  // Idempotency check
  const alreadyProcessed = await isEventProcessed(event.id);
  if (alreadyProcessed) {
    logger.info("Duplicate Stripe event, skipping", {
      provider: "stripe",
      operation: "processStripeWebhook",
      eventId: event.id,
      eventType: event.type,
      ...context,
    });
    return { processed: false, eventType: event.type, action: "duplicate" };
  }

  const handler = EVENT_HANDLERS[event.type];
  if (!handler) {
    logger.debug("Unhandled Stripe event type", {
      provider: "stripe",
      operation: "processStripeWebhook",
      eventType: event.type,
      ...context,
    });
    return { processed: false, eventType: event.type, action: "unhandled_event_type" };
  }

  try {
    return await handler(event, context);
  } catch (error) {
    logger.error("Failed to process Stripe webhook", {
      provider: "stripe",
      operation: "processStripeWebhook",
      eventId: event.id,
      eventType: event.type,
      error: getErrorMessage(error),
      ...context,
    });

    // Record failure for debugging
    try {
      await recordBillingEvent("system", event.id, event.type, "failed", {
        error: getErrorMessage(error),
      });
    } catch (recordError) {
      logger.warn("Failed to record billing event failure", {
        provider: "stripe",
        operation: "recordBillingEvent",
        eventId: event.id,
        error: getErrorMessage(recordError),
        ...context,
      });
    }

    throw error;
  }
};

// ==================== Cleanup ====================

/** Default retention period for billing events. */
const DEFAULT_RETENTION_DAYS = 90;

/** Minimum allowed retention period to prevent accidental mass deletion. */
const MIN_RETENTION_DAYS = 1;

/** Maximum allowed retention period to prevent integer overflow in interval. */
const MAX_RETENTION_DAYS = 3650;

/**
 * Delete billing events older than the specified retention period.
 * Should be called periodically (e.g., daily cron job) to prevent unbounded table growth.
 *
 * @param retentionDays - Number of days to retain events (default: 90, range: 1-3650)
 * @returns Number of deleted rows
 * @throws ValidationError if retentionDays is not a positive finite integer in range
 */
export const cleanupOldBillingEvents = async (
  retentionDays: number = DEFAULT_RETENTION_DAYS
): Promise<number> => {
  // SECURITY: Validate the interval parameter to prevent SQL interval injection.
  // Negative values would delete future events; NaN/Infinity would cause query errors.
  if (
    !Number.isFinite(retentionDays) ||
    !Number.isInteger(retentionDays) ||
    retentionDays < MIN_RETENTION_DAYS ||
    retentionDays > MAX_RETENTION_DAYS
  ) {
    logger.warn("Invalid retentionDays for billing cleanup", {
      provider: "stripe",
      operation: "cleanupOldBillingEvents",
      retentionDays,
    });
    return 0;
  }

  const result = await query<{ readonly id: string }>(BILLING_QUERIES.CLEANUP_OLD_BILLING_EVENTS, [
    `${String(retentionDays)} days`,
  ]);

  const deletedCount = result.rows.length;
  if (deletedCount > 0) {
    logger.info("Cleaned up old billing events", {
      provider: "stripe",
      operation: "cleanupOldBillingEvents",
      deletedCount,
      retentionDays,
    });
  }

  return deletedCount;
};
