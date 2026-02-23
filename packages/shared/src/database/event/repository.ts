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
  generateEventId,
  getErrorMessage,
  ValidationError,
  PARSE_INT_RADIX,
  EVENT_DB_DEFAULTS,
  EVENT_DB_QUERIES,
} from "../common.js";
import type {
  EventRow,
  EventRecord,
  EventCountRow,
  EventListOptions,
  CreateEventInput,
} from "./types.js";
import { mapRowToEvent, validateEventListOptions, validateCreateEventInput } from "./helpers.js";

/** ID prefix for generated event IDs */
const EVENT_ID_PREFIX = "evt";

const logger = createLogger("event-repository");

// ==================== Public API ====================

/**
 * Creates a new event record in the database.
 *
 * @param input - The event data to store
 * @returns The created event record
 * @throws ValidationError if input validation fails
 * @throws Error if database operation fails
 */
export const createEvent = async (input: CreateEventInput): Promise<EventRecord> => {
  validateCreateEventInput(input);

  const id = generateEventId(EVENT_ID_PREFIX);

  try {
    const result = await query<EventRow>(EVENT_DB_QUERIES.INSERT, [
      id,
      input.type,
      input.source,
      input.severity,
      input.timestamp,
      JSON.stringify(input.payload),
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.tenantId ?? null,
    ]);

    const record = mapRowToEvent(result.rows[0]);

    logger.info("Event created", {
      id: record.id,
      type: record.type,
      source: record.source,
      tenantId: record.tenantId,
    });

    return record;
  } catch (error) {
    logger.error("Failed to create event", {
      type: input.type,
      source: input.source,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

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
 * Retrieves events by tenant with optional repository and severity filters.
 *
 * @param options - Query options including tenantId, type, repository, severity, limit, offset
 * @returns Array of event records matching the filters
 * @throws ValidationError if options are invalid
 * @throws Error if database operation fails
 */
export const getEventsByTenantFiltered = async (
  options: EventListOptions & {
    readonly repository?: string | null;
    readonly severity?: string | null;
    readonly since?: string | null;
    readonly until?: string | null;
    readonly source?: string | null;
  }
): Promise<readonly EventRecord[]> => {
  validateEventListOptions(options);

  const limit = options.limit ?? EVENT_DB_DEFAULTS.QUERY_LIMIT;
  const offset = options.offset ?? 0;

  try {
    const result = await query<EventRow>(EVENT_DB_QUERIES.GET_BY_TENANT_TYPE_FILTERED, [
      options.tenantId,
      options.type ?? "CICD_FAILURE",
      options.repository ?? null,
      options.severity ?? null,
      options.since ?? null,
      options.until ?? null,
      options.source ?? null,
      limit,
      offset,
    ]);
    return Object.freeze(result.rows.map(mapRowToEvent));
  } catch (error) {
    logger.error("Failed to get filtered events by tenant", {
      tenantId: options.tenantId,
      since: options.since,
      until: options.until,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Counts events by tenant with optional repository and severity filters.
 *
 * @param tenantId - The tenant ID
 * @param type - The event type
 * @param repository - Optional repository name filter
 * @param severity - Optional severity filter
 * @returns The count of matching events
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const countEventsByTenantFiltered = async (
  tenantId: string,
  type: string,
  repository: string | null,
  severity: string | null,
  since: string | null = null,
  until: string | null = null,
  source: string | null = null
): Promise<number> => {
  if (!tenantId?.trim()) {
    throw new ValidationError("tenantId is required", {
      operation: "countEventsByTenantFiltered",
      metadata: { field: "tenantId" },
    });
  }

  try {
    const result = await query<EventCountRow>(EVENT_DB_QUERIES.COUNT_BY_TENANT_TYPE_FILTERED, [
      tenantId,
      type,
      repository,
      severity,
      since,
      until,
      source,
    ]);
    return parseInt(result.rows[0].count, PARSE_INT_RADIX);
  } catch (error) {
    logger.error("Failed to count filtered events by tenant", {
      tenantId,
      since,
      until,
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
/**
 * Finds the most recent event matching a repository and commit SHA.
 *
 * @param tenantId - The tenant ID
 * @param repository - The repository full name (e.g. "owner/repo")
 * @param commitSha - The commit SHA
 * @returns The event ID, or null if no matching event found
 */
export const findEventIdByRepoAndCommit = async (
  tenantId: string,
  repository: string,
  commitSha: string
): Promise<string | null> => {
  if (!tenantId?.trim() || !repository?.trim() || !commitSha?.trim()) {
    return null;
  }

  try {
    const result = await query<{ readonly id: string }>(EVENT_DB_QUERIES.FIND_BY_REPO_AND_COMMIT, [
      tenantId,
      repository,
      commitSha,
    ]);

    return result.rows[0]?.id ?? null;
  } catch (error) {
    logger.warn("Failed to find event by repo and commit", {
      tenantId,
      repository,
      error: getErrorMessage(error),
    });
    return null;
  }
};

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
