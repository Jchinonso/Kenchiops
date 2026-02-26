/**
 * Investigation Repository
 *
 * Database operations for storing and querying diagnostic investigations.
 *
 * @module database/investigations/repository
 */

import {
  query,
  createLogger,
  generateEventId,
  getErrorMessage,
  INVESTIGATION_QUERIES,
  INVESTIGATION_STATUS,
} from "../common.js";
import type {
  InvestigationRow,
  InvestigationRecord,
  CreateInvestigationInput,
  UpdateInvestigationIntentInput,
  ListInvestigationFilters,
  PaginatedInvestigations,
} from "./types.js";
import {
  mapRowToInvestigation,
  validateCreateInvestigationInput,
  validateInvestigationId,
} from "./helpers.js";

/** ID prefix for generated investigation IDs */
const INVESTIGATION_ID_PREFIX = "inv";

const logger = createLogger("investigation-repository");

// ==================== Public API ====================

/**
 * Creates a new investigation record in the database.
 *
 * @param input - The investigation data to store
 * @returns The created investigation record
 * @throws ValidationError if input validation fails
 */
export const createInvestigation = async (
  input: CreateInvestigationInput
): Promise<InvestigationRecord> => {
  validateCreateInvestigationInput(input);

  const id = generateEventId(INVESTIGATION_ID_PREFIX);

  try {
    const result = await query<InvestigationRow>(INVESTIGATION_QUERIES.INSERT, [
      id,
      input.tenantId,
      input.initiatedBy,
      input.initiatedFrom,
      INVESTIGATION_STATUS.QUEUED,
      input.description,
      input.serviceName ?? null,
      input.endpoint ?? null,
      input.symptom ?? null,
      input.environment ?? null,
      input.timeRangeFrom ?? null,
      input.timeRangeTo ?? null,
    ]);

    const record = mapRowToInvestigation(result.rows[0]);

    logger.info("Investigation created", {
      id: record.id,
      tenantId: record.tenantId,
      initiatedFrom: record.initiatedFrom,
    });

    return record;
  } catch (error) {
    logger.error("Failed to create investigation", {
      tenantId: input.tenantId,
      initiatedFrom: input.initiatedFrom,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves an investigation by its ID.
 *
 * @param id - The investigation ID
 * @returns The investigation record, or null if not found
 * @throws ValidationError if ID is empty
 */
export const getInvestigationById = async (
  id: string,
  tenantId: string
): Promise<InvestigationRecord | null> => {
  validateInvestigationId(id);

  try {
    const result = await query<InvestigationRow>(INVESTIGATION_QUERIES.GET_BY_ID, [id, tenantId]);
    return result.rows.length > 0 ? mapRowToInvestigation(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to get investigation by id", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/** Extracts the count from a count query row */
const parseCountRow = (rows: ReadonlyArray<{ readonly count: string }>): number =>
  parseInt(rows[0]?.count ?? "0", 10);

/**
 * Lists investigations with pagination and optional status filter.
 *
 * @param filters - Filtering and pagination parameters
 * @returns Paginated list of investigations with total count
 */
export const listInvestigations = async (
  filters: ListInvestigationFilters
): Promise<PaginatedInvestigations> => {
  const { tenantId, status, limit, offset } = filters;

  try {
    const [itemsResult, countResult] = await Promise.all([
      query<InvestigationRow>(INVESTIGATION_QUERIES.LIST_BY_TENANT, [
        tenantId,
        status ?? null,
        limit,
        offset,
      ]),
      query<{ readonly count: string }>(INVESTIGATION_QUERIES.COUNT_BY_TENANT, [
        tenantId,
        status ?? null,
      ]),
    ]);

    const items = itemsResult.rows.map(mapRowToInvestigation);
    const total = parseCountRow(countResult.rows);

    logger.info("Listed investigations", {
      tenantId,
      resultCount: items.length,
      total,
      limit,
      offset,
    });

    return { items, total, limit, offset };
  } catch (error) {
    logger.error("Failed to list investigations", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates the status of an investigation.
 *
 * @param id - The investigation ID
 * @param status - The new status
 * @returns The updated investigation record, or null if not found
 * @throws ValidationError if ID is empty
 */
export const updateInvestigationStatus = async (
  id: string,
  status: string,
  tenantId: string
): Promise<InvestigationRecord | null> => {
  validateInvestigationId(id);

  try {
    const result = await query<InvestigationRow>(INVESTIGATION_QUERIES.UPDATE_STATUS, [
      id,
      status,
      tenantId,
    ]);
    return result.rows.length > 0 ? mapRowToInvestigation(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to update investigation status", {
      id,
      status,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates the parsed intent fields on an investigation.
 *
 * @param id - The investigation ID
 * @param intent - The parsed intent fields to set
 * @returns The updated investigation record, or null if not found
 * @throws ValidationError if ID is empty
 */
export const updateInvestigationIntent = async (
  id: string,
  intent: UpdateInvestigationIntentInput,
  tenantId: string
): Promise<InvestigationRecord | null> => {
  validateInvestigationId(id);

  try {
    const result = await query<InvestigationRow>(INVESTIGATION_QUERIES.UPDATE_INTENT, [
      id,
      intent.serviceName ?? null,
      intent.endpoint ?? null,
      intent.symptom ?? null,
      intent.environment ?? null,
      intent.timeRangeFrom ?? null,
      intent.timeRangeTo ?? null,
      tenantId,
    ]);
    return result.rows.length > 0 ? mapRowToInvestigation(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to update investigation intent", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates the evidence JSONB field on an investigation.
 *
 * @param id - The investigation ID
 * @param evidence - The evidence array to store
 * @returns The updated investigation record, or null if not found
 * @throws ValidationError if ID is empty
 */
export const updateInvestigationEvidence = async (
  id: string,
  evidence: readonly unknown[],
  tenantId: string
): Promise<InvestigationRecord | null> => {
  validateInvestigationId(id);

  try {
    const result = await query<InvestigationRow>(INVESTIGATION_QUERIES.UPDATE_EVIDENCE, [
      id,
      JSON.stringify(evidence),
      tenantId,
    ]);
    return result.rows.length > 0 ? mapRowToInvestigation(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to update investigation evidence", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates the correlation JSONB field on an investigation.
 *
 * @param id - The investigation ID
 * @param correlation - The correlation data to store
 * @returns The updated investigation record, or null if not found
 * @throws ValidationError if ID is empty
 */
export const updateInvestigationCorrelation = async (
  id: string,
  correlation: Readonly<Record<string, unknown>>,
  tenantId: string
): Promise<InvestigationRecord | null> => {
  validateInvestigationId(id);

  try {
    const result = await query<InvestigationRow>(INVESTIGATION_QUERIES.UPDATE_CORRELATION, [
      id,
      JSON.stringify(correlation),
      tenantId,
    ]);
    return result.rows.length > 0 ? mapRowToInvestigation(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to update investigation correlation", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates the diagnosis JSONB field and marks the investigation as completed.
 * Automatically sets completed_at to NOW() and status to 'completed'.
 *
 * @param id - The investigation ID
 * @param diagnosis - The diagnosis data to store
 * @param durationMs - Total pipeline execution time in milliseconds
 * @returns The updated investigation record, or null if not found
 * @throws ValidationError if ID is empty
 */
export const updateInvestigationDiagnosis = async (
  id: string,
  diagnosis: Readonly<Record<string, unknown>>,
  durationMs: number,
  tenantId: string
): Promise<InvestigationRecord | null> => {
  validateInvestigationId(id);

  try {
    const result = await query<InvestigationRow>(INVESTIGATION_QUERIES.UPDATE_DIAGNOSIS, [
      id,
      JSON.stringify(diagnosis),
      durationMs,
      tenantId,
    ]);
    return result.rows.length > 0 ? mapRowToInvestigation(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to update investigation diagnosis", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Records an error on an investigation and sets status to 'error'.
 *
 * @param id - The investigation ID
 * @param errorMessage - The error message to store
 * @returns The updated investigation record, or null if not found
 * @throws ValidationError if ID is empty
 */
export const updateInvestigationError = async (
  id: string,
  errorMessage: string,
  tenantId: string
): Promise<InvestigationRecord | null> => {
  validateInvestigationId(id);

  try {
    const result = await query<InvestigationRow>(INVESTIGATION_QUERIES.UPDATE_ERROR, [
      id,
      errorMessage,
      tenantId,
    ]);
    return result.rows.length > 0 ? mapRowToInvestigation(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to update investigation error", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
