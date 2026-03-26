/**
 * OpsGenie Webhook Verification Middleware
 *
 * Verifies that incoming webhooks are from OpsGenie using a shared secret.
 * Delegates to the generic webhook verification factory with shared-secret strategy.
 */

import { createWebhookVerificationMiddleware } from "./webhookVerification.js";
import { appConfig } from "../config/appConfig.js";

/** Shared-secret header used by OpsGenie */
const OPSGENIE_SECRET_HEADER = "x-kenchi-webhook-secret";

/**
 * Express middleware to verify OpsGenie webhooks via shared secret.
 */
export const verifyOpsGenieWebhook = createWebhookVerificationMiddleware({
  strategy: "shared-secret",
  provider: "opsgenie",
  secretHeader: OPSGENIE_SECRET_HEADER,
  secret: appConfig.opsgenieWebhookSecret,
});
