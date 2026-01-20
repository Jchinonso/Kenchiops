/**
 * Analysis Repository
 *
 * Database operations for storing and retrieving analyses.
 * Tracks which model version was used for each analysis.
 *
 * @module database/analysis/repository
 */

import {
  query,
  createLogger,
  generateEventId,
  getErrorMessage,
  PARSE_INT_RADIX,
  ANALYSIS_DEFAULTS,
  ANALYSIS_QUERIES,
} from "../common.js";
import type {
  CreateAnalysisInput,
  AnalysisRecord,
  AnalysisRow,
  AnalysisCountRow,
} from "./types.js";
import {
  ANALYSIS_ID_PREFIX,
  validateId,
  validateLimit,
  validateCreateInput,
  mapRowToAnalysis,
  extractFirstAnalysisRow,
  serializeOptionalJson,
  serializeRequiredJson,
} from "./helpers.js";

const logger = createLogger("analysis-repository");

// ==================== Public API ====================

/**
 * Creates a new analysis record in the database.
 *
 * @param input - The analysis data to store
 * @returns The created analysis record
 * @throws ValidationError if input validation fails
 * @throws Error if database operation fails
 */
export const createAnalysis = async (input: CreateAnalysisInput): Promise<AnalysisRecord> => {
  validateCreateInput(input);

  const id = generateEventId(ANALYSIS_ID_PREFIX);

  try {
    const result = await query<AnalysisRow>(ANALYSIS_QUERIES.INSERT, [
      id,
      input.eventId ?? null,
      input.summary,
      input.identifiedCause ?? null,
      input.diagnosisConfidence,
      input.actionConfidence ?? null,
      serializeOptionalJson(input.confidenceSignals),
      serializeOptionalJson(input.recommendedActions),
      serializeRequiredJson(input.fullAnalysis),
      input.tenantId ?? null,
      input.modelVersionId ?? null,
      input.aggregationKey ?? null,
    ]);

    const record = mapRowToAnalysis(result.rows[0]);

    logger.info("Analysis created", {
      id: record.id,
      eventId: record.eventId,
      modelVersionId: record.modelVersionId,
      diagnosisConfidence: record.diagnosisConfidence,
    });

    return record;
  } catch (error) {
    logger.error("Failed to create analysis", {
      eventId: input.eventId,
      modelVersionId: input.modelVersionId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves an analysis by its ID.
 *
 * @param id - The analysis ID
 * @returns The analysis record or null if not found
 * @throws ValidationError if ID is empty
 * @throws Error if database operation fails
 */
export const getAnalysisById = async (id: string): Promise<AnalysisRecord | null> => {
  validateId(id, "id");

  try {
    const result = await query<AnalysisRow>(ANALYSIS_QUERIES.GET_BY_ID, [id]);
    return extractFirstAnalysisRow(result.rows);
  } catch (error) {
    logger.error("Failed to get analysis by ID", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves an analysis by its event ID.
 *
 * @param eventId - The event ID
 * @returns The analysis record or null if not found
 * @throws ValidationError if eventId is empty
 * @throws Error if database operation fails
 */
export const getAnalysisByEventId = async (eventId: string): Promise<AnalysisRecord | null> => {
  validateId(eventId, "eventId");

  try {
    const result = await query<AnalysisRow>(ANALYSIS_QUERIES.GET_BY_EVENT_ID, [eventId]);
    return extractFirstAnalysisRow(result.rows);
  } catch (error) {
    logger.error("Failed to get analysis by event ID", {
      eventId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves analyses by model version ID.
 *
 * @param modelVersionId - The model version ID
 * @param limit - Maximum number of records to return (default: 100)
 * @returns Array of analysis records
 * @throws ValidationError if modelVersionId is empty or limit is invalid
 * @throws Error if database operation fails
 */
export const getAnalysesByModelVersion = async (
  modelVersionId: string,
  limit: number = ANALYSIS_DEFAULTS.MODEL_VERSION_QUERY_LIMIT
): Promise<readonly AnalysisRecord[]> => {
  validateId(modelVersionId, "modelVersionId");
  validateLimit(limit);

  try {
    const result = await query<AnalysisRow>(ANALYSIS_QUERIES.GET_BY_MODEL_VERSION, [
      modelVersionId,
      limit,
    ]);

    return Object.freeze(result.rows.map(mapRowToAnalysis));
  } catch (error) {
    logger.error("Failed to get analyses by model version", {
      modelVersionId,
      limit,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Counts analyses by model version ID.
 *
 * @param modelVersionId - The model version ID
 * @returns The count of analyses
 * @throws ValidationError if modelVersionId is empty
 * @throws Error if database operation fails
 */
export const countAnalysesByModelVersion = async (modelVersionId: string): Promise<number> => {
  validateId(modelVersionId, "modelVersionId");

  try {
    const result = await query<AnalysisCountRow>(ANALYSIS_QUERIES.COUNT_BY_MODEL_VERSION, [
      modelVersionId,
    ]);

    return parseInt(result.rows[0].count, PARSE_INT_RADIX);
  } catch (error) {
    logger.error("Failed to count analyses by model version", {
      modelVersionId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
