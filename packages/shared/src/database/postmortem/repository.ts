/**
 * Postmortem Repository
 *
 * Database operations for storing and querying postmortem documents.
 *
 * @module database/postmortem/repository
 */

import {
  query,
  createLogger,
  generateEventId,
  getErrorMessage,
  POSTMORTEM_QUERIES,
} from "../common.js";
import type {
  PostmortemRow,
  PostmortemRecord,
  CreatePostmortemInput,
  UpdatePostmortemInput,
  ListPostmortemFilters,
  PaginatedPostmortems,
} from "./types.js";
import {
  mapRowToPostmortem,
  validateCreatePostmortemInput,
  validatePostmortemId,
} from "./helpers.js";

/** ID prefix for generated postmortem IDs */
const POSTMORTEM_ID_PREFIX = "pst";

const logger = createLogger("postmortem-repository");

// ==================== Public API ====================

/**
 * Creates a new postmortem record in the database.
 *
 * @param input - The postmortem data to store
 * @returns The created postmortem record
 * @throws ValidationError if input validation fails
 */
export const createPostmortem = async (input: CreatePostmortemInput): Promise<PostmortemRecord> => {
  validateCreatePostmortemInput(input);

  const id = generateEventId(POSTMORTEM_ID_PREFIX);

  try {
    const result = await query<PostmortemRow>(POSTMORTEM_QUERIES.INSERT, [
      id,
      input.tenantId,
      input.alertId ?? null,
      input.title,
      input.status ?? "draft",
      JSON.stringify(input.content),
      input.createdBy ?? null,
    ]);

    const record = mapRowToPostmortem(result.rows[0]);

    logger.info("Postmortem created", {
      id: record.id,
      tenantId: record.tenantId,
      alertId: record.alertId,
    });

    return record;
  } catch (error) {
    logger.error("Failed to create postmortem", {
      tenantId: input.tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves a postmortem by its ID.
 *
 * @param id - The postmortem ID
 * @param tenantId - The tenant ID for scoping
 * @returns The postmortem record, or null if not found
 * @throws ValidationError if ID is empty
 */
export const getPostmortemById = async (
  id: string,
  tenantId: string
): Promise<PostmortemRecord | null> => {
  validatePostmortemId(id);

  try {
    const result = await query<PostmortemRow>(POSTMORTEM_QUERIES.GET_BY_ID, [id, tenantId]);
    return result.rows.length > 0 ? mapRowToPostmortem(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to get postmortem by id", {
      id,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/** Extracts the count from a count query row */
const parseCountRow = (rows: ReadonlyArray<{ readonly count: string }>): number =>
  parseInt(rows[0]?.count ?? "0", 10);

/**
 * Lists postmortems with pagination and optional filters.
 *
 * @param filters - Filtering and pagination parameters
 * @returns Paginated list of postmortems with total count
 */
export const listPostmortems = async (
  filters: ListPostmortemFilters
): Promise<PaginatedPostmortems> => {
  const { tenantId, status, limit, offset } = filters;

  try {
    const [itemsResult, countResult] = await Promise.all([
      query<PostmortemRow>(POSTMORTEM_QUERIES.LIST, [tenantId, status ?? null, limit, offset]),
      query<{ readonly count: string }>(POSTMORTEM_QUERIES.COUNT, [tenantId, status ?? null]),
    ]);

    const items = itemsResult.rows.map(mapRowToPostmortem);
    const total = parseCountRow(countResult.rows);

    logger.info("Listed postmortems", {
      tenantId,
      resultCount: items.length,
      total,
      limit,
      offset,
    });

    return { items, total, limit, offset };
  } catch (error) {
    logger.error("Failed to list postmortems", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates a postmortem record.
 *
 * @param id - The postmortem ID
 * @param tenantId - The tenant ID for scoping
 * @param input - The fields to update
 * @returns The updated postmortem record, or null if not found
 */
export const updatePostmortem = async (
  id: string,
  tenantId: string,
  input: UpdatePostmortemInput
): Promise<PostmortemRecord | null> => {
  validatePostmortemId(id);

  try {
    const result = await query<PostmortemRow>(POSTMORTEM_QUERIES.UPDATE, [
      id,
      tenantId,
      input.title ?? null,
      input.content ? JSON.stringify(input.content) : null,
      input.status ?? null,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    const record = mapRowToPostmortem(result.rows[0]);

    logger.info("Postmortem updated", {
      id: record.id,
      tenantId: record.tenantId,
    });

    return record;
  } catch (error) {
    logger.error("Failed to update postmortem", {
      id,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Publishes a postmortem (changes status to published, sets published_at).
 *
 * @param id - The postmortem ID
 * @param tenantId - The tenant ID for scoping
 * @returns The published postmortem record, or null if not found
 */
export const publishPostmortem = async (
  id: string,
  tenantId: string
): Promise<PostmortemRecord | null> => {
  validatePostmortemId(id);

  try {
    const result = await query<PostmortemRow>(POSTMORTEM_QUERIES.PUBLISH, [id, tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    const record = mapRowToPostmortem(result.rows[0]);

    logger.info("Postmortem published", {
      id: record.id,
      tenantId: record.tenantId,
    });

    return record;
  } catch (error) {
    logger.error("Failed to publish postmortem", {
      id,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
