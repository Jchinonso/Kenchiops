/**
 * Event Repository
 *
 * Database operations for querying events by tenant.
 *
 * @module database/event/repository
 */

import {
  query,
  createLogger,
  getErrorMessage,
  ValidationError,
  PARSE_INT_RADIX,
  EVENT_DB_DEFAULTS,
  EVENT_DB_QUERIES,
} from "../common.js";
import type { EventRow, EventRecord, EventCountRow, EventListOptions } from "./types.js";
import { mapRowToEvent, validateEventListOptions } from "./helpers.js";

const logger = createLogger("event-repository");

// ==================== Public API ====================

/**
 * Retrieves events by tenant, optionally filtered by type.
 *
 * @param options - Query options including tenantId, type, limit, offset
 * @returns Array of event records
 * @throws ValidationError if options are invalid
 * @throws Error if database operation fails
 */
export const getEventsByTenant = async (
  options: EventListOptions
): Promise<readonly EventRecord[]> => {
  validateEventListOptions(options);

  const limit = options.limit ?? EVENT_DB_DEFAULTS.QUERY_LIMIT;
  const offset = options.offset ?? 0;

  try {
    const result = options.type
      ? await query<EventRow>(EVENT_DB_QUERIES.GET_BY_TENANT_AND_TYPE, [
          options.tenantId,
          options.type,
          limit,
          offset,
        ])
      : await query<EventRow>(EVENT_DB_QUERIES.GET_BY_TENANT, [options.tenantId, limit, offset]);

    return Object.freeze(result.rows.map(mapRowToEvent));
  } catch (error) {
    logger.error("Failed to get events by tenant", {
      tenantId: options.tenantId,
      type: options.type,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Counts events by tenant, optionally filtered by type.
 *
 * @param tenantId - The tenant ID
 * @param type - Optional event type filter
 * @returns The count of matching events
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const countEventsByTenant = async (tenantId: string, type?: string): Promise<number> => {
  if (!tenantId?.trim()) {
    throw new ValidationError("tenantId is required", {
      operation: "countEventsByTenant",
      metadata: { field: "tenantId" },
    });
  }

  try {
    const result = type
      ? await query<EventCountRow>(EVENT_DB_QUERIES.COUNT_BY_TENANT_AND_TYPE, [tenantId, type])
      : await query<EventCountRow>(EVENT_DB_QUERIES.COUNT_BY_TENANT, [tenantId]);

    return parseInt(result.rows[0].count, PARSE_INT_RADIX);
  } catch (error) {
    logger.error("Failed to count events by tenant", {
      tenantId,
      type,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
