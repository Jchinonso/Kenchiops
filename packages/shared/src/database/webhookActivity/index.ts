/**
 * Webhook Activity Module
 *
 * Database operations for storing and querying webhook delivery activity.
 *
 * @module database/webhookActivity
 */

// Types
export type {
  WebhookActivityRow,
  WebhookActivityRecord,
  WebhookActivityCountRow,
  WebhookActivityListOptions,
  CreateWebhookActivityInput,
} from "./types.js";

// Helpers (includes validation and mappers)
export {
  mapRowToWebhookActivity,
  validateWebhookActivityListOptions,
  validateCreateWebhookActivityInput,
} from "./helpers.js";

// Repository operations
export {
  createWebhookActivity,
  getWebhookActivitiesByTenant,
  countWebhookActivitiesByTenant,
} from "./repository.js";
