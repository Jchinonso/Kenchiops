/**
 * Event Helpers
 *
 * Validation functions and row mappers for event repository operations.
 *
 * @module database/event/helpers
 */

import { ValidationError, EVENT_DB_DEFAULTS } from "../common.js";
import type { EventRow, EventRecord, EventListOptions } from "./types.js";

// ==================== Row Mappers ====================

/**
 * Maps a database row to an EventRecord domain object.
 */
export const mapRowToEvent = (row: EventRow): EventRecord => ({
  id: row.id,
  type: row.type,
  source: row.source,
  severity: row.severity,
  timestamp: row.timestamp,
  payload: row.payload,
  metadata: row.metadata,
  tenantId: row.tenant_id,
  createdAt: row.created_at,
});

// ==================== Validation ====================

/**
 * Validates options for listing events by tenant.
 *
 * @throws ValidationError if tenantId is empty or limit is out of range
 */
export const validateEventListOptions = (options: EventListOptions): void => {
  if (!options.tenantId?.trim()) {
    throw new ValidationError("tenantId is required", {
      operation: "validateEventListOptions",
      metadata: { field: "tenantId" },
    });
  }

  const limit = options.limit ?? EVENT_DB_DEFAULTS.QUERY_LIMIT;

  if (limit < EVENT_DB_DEFAULTS.MIN_QUERY_LIMIT || limit > EVENT_DB_DEFAULTS.MAX_QUERY_LIMIT) {
    throw new ValidationError(
      `limit must be between ${EVENT_DB_DEFAULTS.MIN_QUERY_LIMIT} and ${EVENT_DB_DEFAULTS.MAX_QUERY_LIMIT}`,
      {
        operation: "validateEventListOptions",
        metadata: { field: "limit", value: limit },
      }
    );
  }
};
