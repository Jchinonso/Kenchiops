/**
 * Webhook Activity Helpers
 *
 * Validation functions and row mappers for webhook activity repository operations.
 *
 * @module database/webhookActivity/helpers
 */

import { ValidationError, WEBHOOK_ACTIVITY_DEFAULTS } from "../common.js";
import type {
  WebhookActivityRow,
  WebhookActivityRecord,
  WebhookActivityListOptions,
  CreateWebhookActivityInput,
} from "./types.js";

// ==================== Row Mappers ====================

/**
 * Maps a database row to a WebhookActivityRecord domain object.
 */
export const mapRowToWebhookActivity = (row: WebhookActivityRow): WebhookActivityRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  deliveryId: row.delivery_id,
  eventType: row.event_type,
  source: row.source,
  status: row.status,
  processingTimeMs: row.processing_time_ms,
  errorMessage: row.error_message,
  metadata: row.metadata,
  createdAt: row.created_at,
});

// ==================== Validation ====================

/**
 * Validates options for listing webhook activity by tenant.
 *
 * @throws ValidationError if tenantId is empty or limit is out of range
 */
export const validateWebhookActivityListOptions = (options: WebhookActivityListOptions): void => {
  if (!options.tenantId?.trim()) {
    throw new ValidationError("tenantId is required", {
      operation: "validateWebhookActivityListOptions",
      metadata: { field: "tenantId" },
    });
  }

  const limit = options.limit ?? WEBHOOK_ACTIVITY_DEFAULTS.QUERY_LIMIT;

  if (
    limit < WEBHOOK_ACTIVITY_DEFAULTS.MIN_QUERY_LIMIT ||
    limit > WEBHOOK_ACTIVITY_DEFAULTS.MAX_QUERY_LIMIT
  ) {
    throw new ValidationError(
      `limit must be between ${WEBHOOK_ACTIVITY_DEFAULTS.MIN_QUERY_LIMIT} and ${WEBHOOK_ACTIVITY_DEFAULTS.MAX_QUERY_LIMIT}`,
      {
        operation: "validateWebhookActivityListOptions",
        metadata: { field: "limit", value: limit },
      }
    );
  }
};

/**
 * Validates input for creating a new webhook activity record.
 *
 * @throws ValidationError if required fields are missing
 */
export const validateCreateWebhookActivityInput = (input: CreateWebhookActivityInput): void => {
  if (!input.deliveryId?.trim()) {
    throw new ValidationError("deliveryId is required", {
      operation: "validateCreateWebhookActivityInput",
      metadata: { field: "deliveryId" },
    });
  }

  if (!input.eventType?.trim()) {
    throw new ValidationError("eventType is required", {
      operation: "validateCreateWebhookActivityInput",
      metadata: { field: "eventType" },
    });
  }

  if (!input.status?.trim()) {
    throw new ValidationError("status is required", {
      operation: "validateCreateWebhookActivityInput",
      metadata: { field: "status" },
    });
  }
};
