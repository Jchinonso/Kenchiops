/**
 * Billing Module
 *
 * Stripe billing integration for subscription management.
 *
 * @module billing
 */

export type {
  BillingInterval,
  CheckoutStatus,
  StripeWebhookEventType,
  CreateCheckoutInput,
  CreatePortalInput,
  CheckoutResult,
  PortalResult,
  BillingStatus,
  BillingService,
  StripeWebhookEvent,
  WebhookProcessResult,
  BillingPort,
  BillingEventRow,
} from "./types.js";

export { BILLING_CONSTANTS, BILLING_QUERIES } from "./types.js";

export { createStripeAdapter } from "./stripeAdapter.js";

export { createBillingService } from "./billingService.js";

export { processStripeWebhook, cleanupOldBillingEvents } from "./webhookHandler.js";
