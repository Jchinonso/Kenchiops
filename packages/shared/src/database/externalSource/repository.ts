/**
 * External Source Repository
 *
 * Database operations for external knowledge sources with tenant opt-in tracking.
 * Supports cross-repo knowledge ingestion from various external platforms.
 *
 * @module database/externalSource/repository
 */

import {
  query,
  createLogger,
  getErrorMessage,
  generateEventId,
  EXTERNAL_SOURCE_CONFIG,
  EXTERNAL_SOURCE_DEFAULTS,
  EXTERNAL_SOURCE_QUERIES,
  PARSE_INT_RADIX,
} from "../common.js";
import type {
  ExternalSource,
  ExternalSourceRow,
  CreateExternalSourceInput,
  UpdateExternalSourceInput,
  ExternalSourceType,
} from "./types.js";
import {
  validateNonEmptyString,
  validateMinimumNumber,
  validateCreateInput,
  serializeOptionalJson,
  mapRowToExternalSource,
} from "./helpers.js";

const logger = createLogger("external-source-repository");

// ==================== Public API ====================

/**
 * Creates a new external source.
 *
 * @param input - External source data to insert
 * @returns The created external source
 * @throws ValidationError if input is invalid
 * @throws Error if database operation fails
 */
export const createExternalSource = async (
  input: CreateExternalSourceInput
): Promise<ExternalSource> => {
  validateCreateInput(input);

  const id = generateEventId();

  try {
    const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.INSERT, [
      id,
      input.tenantId,
      input.sourceType,
      input.name,
      input.baseUrl ?? null,
      serializeOptionalJson(input.authConfig),
      input.techStackTags ?? [],
      input.credibilityScore ?? EXTERNAL_SOURCE_CONFIG.DEFAULT_CREDIBILITY_SCORE,
      input.syncFrequencyHours ?? EXTERNAL_SOURCE_CONFIG.DEFAULT_SYNC_FREQUENCY_HOURS,
      serializeOptionalJson(input.metadata),
    ]);

    logger.info("Created external source", {
      id,
      tenantId: input.tenantId,
      sourceType: input.sourceType,
      name: input.name,
    });

    return mapRowToExternalSource(result.rows[0]);
  } catch (error) {
    logger.error("Failed to create external source", {
      tenantId: input.tenantId,
      sourceType: input.sourceType,
      name: input.name,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets an external source by ID.
 *
 * @param sourceId - External source ID
 * @returns The external source or null if not found
 * @throws ValidationError if sourceId is empty
 * @throws Error if database operation fails
 */
export const getExternalSourceById = async (sourceId: string): Promise<ExternalSource | null> => {
  validateNonEmptyString(sourceId, "sourceId");

  try {
    const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.GET_BY_ID, [sourceId]);
    return result.rows.length === 0 ? null : mapRowToExternalSource(result.rows[0]);
  } catch (error) {
    logger.error("Failed to get external source by ID", {
      sourceId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets all external sources for a tenant.
 *
 * @param tenantId - Tenant ID
 * @returns Array of external sources
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const getExternalSourcesByTenant = async (
  tenantId: string
): Promise<readonly ExternalSource[]> => {
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.GET_BY_TENANT, [
      tenantId,
    ]);
    return Object.freeze(result.rows.map(mapRowToExternalSource));
  } catch (error) {
    logger.error("Failed to get external sources by tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets enabled external sources for a tenant.
 *
 * @param tenantId - Tenant ID
 * @returns Array of enabled external sources
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const getEnabledExternalSources = async (
  tenantId: string
): Promise<readonly ExternalSource[]> => {
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.GET_ENABLED_BY_TENANT, [
      tenantId,
    ]);
    return Object.freeze(result.rows.map(mapRowToExternalSource));
  } catch (error) {
    logger.error("Failed to get enabled external sources", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets external sources by type for a tenant.
 *
 * @param tenantId - Tenant ID
 * @param sourceType - External source type
 * @returns Array of external sources of the specified type
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const getExternalSourcesByType = async (
  tenantId: string,
  sourceType: ExternalSourceType
): Promise<readonly ExternalSource[]> => {
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.GET_BY_TYPE, [
      tenantId,
      sourceType,
    ]);
    return Object.freeze(result.rows.map(mapRowToExternalSource));
  } catch (error) {
    logger.error("Failed to get external sources by type", {
      tenantId,
      sourceType,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets external sources due for sync.
 *
 * @param limit - Maximum number of sources to return
 * @returns Array of external sources due for sync
 * @throws ValidationError if limit is invalid
 * @throws Error if database operation fails
 */
export const getSourcesDueForSync = async (
  limit: number = EXTERNAL_SOURCE_DEFAULTS.DEFAULT_SYNC_LIMIT
): Promise<readonly ExternalSource[]> => {
  validateMinimumNumber(limit, "limit", EXTERNAL_SOURCE_DEFAULTS.MIN_QUERY_LIMIT);

  try {
    const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.GET_DUE_FOR_SYNC, [
      limit,
    ]);
    return Object.freeze(result.rows.map(mapRowToExternalSource));
  } catch (error) {
    logger.error("Failed to get sources due for sync", {
      limit,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates an external source.
 *
 * @param sourceId - External source ID
 * @param input - Update data
 * @returns Updated external source or null if not found
 * @throws ValidationError if sourceId is empty
 * @throws Error if database operation fails
 */
export const updateExternalSource = async (
  sourceId: string,
  input: UpdateExternalSourceInput
): Promise<ExternalSource | null> => {
  validateNonEmptyString(sourceId, "sourceId");

  try {
    const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.UPDATE, [
      sourceId,
      input.name ?? null,
      input.baseUrl ?? null,
      serializeOptionalJson(input.authConfig),
      input.techStackTags ?? null,
      input.isEnabled ?? null,
      input.credibilityScore ?? null,
      input.syncFrequencyHours ?? null,
      serializeOptionalJson(input.metadata),
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    logger.info("Updated external source", { sourceId });
    return mapRowToExternalSource(result.rows[0]);
  } catch (error) {
    logger.error("Failed to update external source", {
      sourceId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates sync status after a sync operation.
 *
 * @param sourceId - External source ID
 * @param docCount - Number of documents synced
 * @param errorCount - Number of errors during sync
 * @returns Updated external source or null if not found
 * @throws ValidationError if sourceId is empty or counts are invalid
 * @throws Error if database operation fails
 */
export const updateSyncStatus = async (
  sourceId: string,
  docCount: number,
  errorCount: number
): Promise<ExternalSource | null> => {
  validateNonEmptyString(sourceId, "sourceId");
  validateMinimumNumber(docCount, "docCount", EXTERNAL_SOURCE_DEFAULTS.MIN_DOC_COUNT);
  validateMinimumNumber(errorCount, "errorCount", EXTERNAL_SOURCE_DEFAULTS.MIN_ERROR_COUNT);

  try {
    const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.UPDATE_SYNC_STATUS, [
      sourceId,
      docCount,
      errorCount,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    logger.debug("Updated external source sync status", { sourceId, docCount, errorCount });
    return mapRowToExternalSource(result.rows[0]);
  } catch (error) {
    logger.error("Failed to update sync status", {
      sourceId,
      docCount,
      errorCount,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Deletes an external source.
 *
 * @param sourceId - External source ID
 * @returns True if deleted, false if not found
 * @throws ValidationError if sourceId is empty
 * @throws Error if database operation fails
 */
export const deleteExternalSource = async (sourceId: string): Promise<boolean> => {
  validateNonEmptyString(sourceId, "sourceId");

  try {
    const result = await query(EXTERNAL_SOURCE_QUERIES.DELETE, [sourceId]);

    if (result.rowCount === 0) {
      return false;
    }

    logger.info("Deleted external source", { sourceId });
    return true;
  } catch (error) {
    logger.error("Failed to delete external source", {
      sourceId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Deletes all external sources for a tenant.
 *
 * @param tenantId - Tenant ID
 * @returns Number of deleted sources
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const deleteExternalSourcesByTenant = async (tenantId: string): Promise<number> => {
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query(EXTERNAL_SOURCE_QUERIES.DELETE_BY_TENANT, [tenantId]);

    logger.info("Deleted external sources for tenant", { tenantId, count: result.rowCount });
    return result.rowCount;
  } catch (error) {
    logger.error("Failed to delete external sources for tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets count of external sources for a tenant.
 *
 * @param tenantId - Tenant ID
 * @returns Number of external sources
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const getExternalSourceCount = async (tenantId: string): Promise<number> => {
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query<{ count: string }>(EXTERNAL_SOURCE_QUERIES.COUNT_BY_TENANT, [
      tenantId,
    ]);

    return parseInt(
      result.rows[0]?.count ?? EXTERNAL_SOURCE_DEFAULTS.DEFAULT_COUNT,
      PARSE_INT_RADIX
    );
  } catch (error) {
    logger.error("Failed to get external source count", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
