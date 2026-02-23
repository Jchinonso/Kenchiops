/**
 * Webhook Activity Repository
 *
 * Database operations for storing and querying webhook activity.
 *
 * @module database/webhookActivity/repository
 */

import {
  query,
  createLogger,
  generateEventId,
  getErrorMessage,
  ValidationError,
  PARSE_INT_RADIX,
  WEBHOOK_ACTIVITY_DEFAULTS,
  WEBHOOK_ACTIVITY_QUERIES,
} from "../common.js";
import type {
  WebhookActivityRow,
  WebhookActivityRecord,
  WebhookActivityCountRow,
  WebhookActivityListOptions,
  CreateWebhookActivityInput,
} from "./types.js";
import {
  mapRowToWebhookActivity,
  validateWebhookActivityListOptions,
  validateCreateWebhookActivityInput,
} from "./helpers.js";

/** ID prefix for generated webhook activity IDs */
const WEBHOOK_ACTIVITY_ID_PREFIX = "wha";

const logger = createLogger("webhook-activity-repository");

// ==================== Public API ====================

/**
 * Creates a new webhook activity record in the database.
 *
 * @param input - The webhook activity data to store
 * @returns The created webhook activity record
 * @throws ValidationError if input validation fails
 * @throws Error if database operation fails
 */
export const createWebhookActivity = async (
  input: CreateWebhookActivityInput
): Promise<WebhookActivityRecord> => {
  validateCreateWebhookActivityInput(input);

  const id = generateEventId(WEBHOOK_ACTIVITY_ID_PREFIX);

  try {
    const result = await query<WebhookActivityRow>(WEBHOOK_ACTIVITY_QUERIES.INSERT, [
      id,
      input.tenantId ?? null,
      input.deliveryId,
      input.eventType,
      input.source ?? "github",
      input.status,
      input.processingTimeMs ?? null,
      input.errorMessage ?? null,
      input.metadata ? JSON.stringify(input.metadata) : "{}",
    ]);

    const record = mapRowToWebhookActivity(result.rows[0]);

    logger.info("Webhook activity created", {
      id: record.id,
      eventType: record.eventType,
      status: record.status,
      tenantId: record.tenantId,
    });

    return record;
  } catch (error) {
    logger.error("Failed to create webhook activity", {
      deliveryId: input.deliveryId,
      eventType: input.eventType,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves webhook activity by tenant with optional source and status filters.
 *
 * @param options - Query options including tenantId, source, status, limit, offset
 * @returns Array of webhook activity records
 * @throws ValidationError if options are invalid
 * @throws Error if database operation fails
 */
export const getWebhookActivitiesByTenant = async (
  options: WebhookActivityListOptions
): Promise<readonly WebhookActivityRecord[]> => {
  validateWebhookActivityListOptions(options);

  const limit = options.limit ?? WEBHOOK_ACTIVITY_DEFAULTS.QUERY_LIMIT;
  const offset = options.offset ?? 0;

  try {
    const hasFilters = options.source !== undefined || options.status !== undefined;
    const result = hasFilters
      ? await query<WebhookActivityRow>(WEBHOOK_ACTIVITY_QUERIES.GET_BY_TENANT_FILTERED, [
          options.tenantId,
          options.source ?? null,
          options.status ?? null,
          limit,
          offset,
        ])
      : await query<WebhookActivityRow>(WEBHOOK_ACTIVITY_QUERIES.GET_BY_TENANT, [
          options.tenantId,
          limit,
          offset,
        ]);

    return Object.freeze(result.rows.map(mapRowToWebhookActivity));
  } catch (error) {
    logger.error("Failed to get webhook activity by tenant", {
      tenantId: options.tenantId,
      source: options.source,
      status: options.status,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Counts webhook activity by tenant with optional source and status filters.
 *
 * @param tenantId - The tenant ID
 * @param source - Optional source filter (e.g., "github")
 * @param status - Optional status filter (e.g., "processed", "failed")
 * @returns The count of matching records
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
/**
 * Finds a webhook activity record by its delivery ID (for replay protection).
 *
 * @param deliveryId - The webhook delivery ID
 * @returns The webhook activity record, or null if not found
 */
export const findWebhookActivityByDeliveryId = async (
  deliveryId: string
): Promise<WebhookActivityRecord | null> => {
  if (!deliveryId?.trim()) {
    return null;
  }

  try {
    const result = await query<WebhookActivityRow>(WEBHOOK_ACTIVITY_QUERIES.FIND_BY_DELIVERY_ID, [
      deliveryId,
    ]);
    return result.rows.length > 0 ? mapRowToWebhookActivity(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to find webhook activity by delivery id", {
      deliveryId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Counts webhook activity by tenant with optional source and status filters.
 *
 * @param tenantId - The tenant ID
 * @param source - Optional source filter (e.g., "github")
 * @param status - Optional status filter (e.g., "processed", "failed")
 * @returns The count of matching records
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const countWebhookActivitiesByTenant = async (
  tenantId: string,
  source?: string | null,
  status?: string | null
): Promise<number> => {
  if (!tenantId?.trim()) {
    throw new ValidationError("tenantId is required", {
      operation: "countWebhookActivitiesByTenant",
      metadata: { field: "tenantId" },
    });
  }

  try {
    const hasFilters = source !== undefined || status !== undefined;
    const result = hasFilters
      ? await query<WebhookActivityCountRow>(WEBHOOK_ACTIVITY_QUERIES.COUNT_BY_TENANT_FILTERED, [
          tenantId,
          source ?? null,
          status ?? null,
        ])
      : await query<WebhookActivityCountRow>(WEBHOOK_ACTIVITY_QUERIES.COUNT_BY_TENANT, [tenantId]);

    return parseInt(result.rows[0].count, PARSE_INT_RADIX);
  } catch (error) {
    logger.error("Failed to count webhook activity by tenant", {
      tenantId,
      source,
      status,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
