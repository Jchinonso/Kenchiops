/**
 * New Relic Webhook Verification Middleware
 *
 * Verifies that incoming webhooks are from New Relic using a shared secret.
 * Delegates to the generic webhook verification factory with shared-secret strategy.
 */

import { createWebhookVerificationMiddleware } from "./webhookVerification.js";
import { appConfig } from "../config/appConfig.js";

/** Shared-secret header used by New Relic */
const NEWRELIC_SECRET_HEADER = "x-kenchi-webhook-secret";

/**
 * Express middleware to verify New Relic webhooks via shared secret.
 */
export const verifyNewRelicWebhook = createWebhookVerificationMiddleware({
  strategy: "shared-secret",
  provider: "newrelic",
  secretHeader: NEWRELIC_SECRET_HEADER,
  secret: appConfig.newrelicWebhookSecret,
});
