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
  StripeWebhookEvent,
  WebhookProcessResult,
  BillingPort,
  BillingEventRow,
} from "./types.js";

export { BILLING_CONSTANTS, BILLING_QUERIES } from "./types.js";

export { createStripeAdapter } from "./stripeAdapter.js";

export { createBillingService, type BillingService } from "./billingService.js";

export { processStripeWebhook } from "./webhookHandler.js";
