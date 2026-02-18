/**
 * Incident Triage Result Repository
 *
 * Database operations for storing and querying incident triage results.
 *
 * @module database/incidentTriageResult/repository
 */

import {
  query,
  createLogger,
  generateEventId,
  getErrorMessage,
  formatEmbeddingVector,
  INCIDENT_TRIAGE_RESULT_QUERIES,
} from "../common.js";
import type {
  IncidentTriageResultRow,
  IncidentTriageResultRecord,
  CreateTriageResultInput,
  UpdateTriageEnrichmentInput,
  TriageResultSimilarityRow,
  TriageSimilarityResult,
} from "./types.js";
import {
  mapRowToTriageResult,
  mapRowToSimilarityResult,
  validateTriageResultId,
} from "./helpers.js";

/** ID prefix for generated triage result IDs */
const TRIAGE_RESULT_ID_PREFIX = "tri";

const logger = createLogger("incident-triage-result-repository");

// ==================== Public API ====================

/**
 * Creates a new triage result record in the database.
 *
 * @param input - The triage result data to store
 * @returns The created triage result record
 */
export const createTriageResult = async (
  input: CreateTriageResultInput
): Promise<IncidentTriageResultRecord> => {
  const id = generateEventId(TRIAGE_RESULT_ID_PREFIX);

  try {
    const result = await query<IncidentTriageResultRow>(INCIDENT_TRIAGE_RESULT_QUERIES.INSERT, [
      id,
      input.alertId,
      input.tenantId ?? null,
      input.severityScore,
      input.severityLabel,
      JSON.stringify(input.severityFactors),
      input.pipelineDurationMs,
    ]);

    const record = mapRowToTriageResult(result.rows[0]);

    logger.info("Triage result created", {
      id: record.id,
      alertId: record.alertId,
      severityLabel: record.severityLabel,
      severityScore: record.severityScore,
    });

    return record;
  } catch (error) {
    logger.error("Failed to create triage result", {
      alertId: input.alertId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves a triage result by its ID.
 *
 * @param id - The triage result ID
 * @returns The triage result record, or null if not found
 */
export const getTriageResultById = async (
  id: string
): Promise<IncidentTriageResultRecord | null> => {
  validateTriageResultId(id);

  try {
    const result = await query<IncidentTriageResultRow>(INCIDENT_TRIAGE_RESULT_QUERIES.GET_BY_ID, [
      id,
    ]);
    return result.rows.length > 0 ? mapRowToTriageResult(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to get triage result by id", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves a triage result by its associated alert ID.
 *
 * @param alertId - The incident alert ID
 * @returns The triage result record, or null if not found
 */
export const getTriageResultByAlertId = async (
  alertId: string
): Promise<IncidentTriageResultRecord | null> => {
  if (!alertId?.trim()) {
    return null;
  }

  try {
    const result = await query<IncidentTriageResultRow>(
      INCIDENT_TRIAGE_RESULT_QUERIES.GET_BY_ALERT_ID,
      [alertId]
    );
    return result.rows.length > 0 ? mapRowToTriageResult(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to get triage result by alert id", {
      alertId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates a triage result with Phase 3 enrichment data (runbooks, correlations, evidence).
 *
 * @param input - The enrichment data to update
 * @returns The updated triage result record
 */
export const updateTriageEnrichment = async (
  input: UpdateTriageEnrichmentInput
): Promise<IncidentTriageResultRecord> => {
  validateTriageResultId(input.triageResultId);

  const embeddingVector = formatEmbeddingVector(input.alertEmbedding);

  try {
    const result = await query<IncidentTriageResultRow>(
      INCIDENT_TRIAGE_RESULT_QUERIES.UPDATE_ENRICHMENT,
      [
        input.triageResultId,
        input.confidence,
        input.completeness,
        input.missingFields,
        JSON.stringify(input.matchedRunbooks),
        JSON.stringify(input.correlatedIncidents),
        JSON.stringify(input.evidenceCatalog),
        embeddingVector,
        input.pipelineDurationMs,
      ]
    );

    const record = mapRowToTriageResult(result.rows[0]);

    logger.info("Triage result enrichment updated", {
      id: record.id,
      alertId: record.alertId,
      confidence: record.confidence,
      completeness: record.completeness,
    });

    return record;
  } catch (error) {
    logger.error("Failed to update triage enrichment", {
      triageResultId: input.triageResultId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Searches for similar triage results using vector similarity on alert embeddings.
 *
 * @param embedding - Query embedding vector
 * @param tenantId - Tenant to search within
 * @param excludeAlertId - Alert ID to exclude from results (the current alert)
 * @param minSimilarity - Minimum cosine similarity threshold
 * @param limit - Maximum number of results
 * @returns Array of similar triage results with similarity scores
 */
export const searchSimilarTriageResults = async (
  embedding: readonly number[],
  tenantId: string,
  excludeAlertId: string,
  minSimilarity: number,
  limit: number
): Promise<readonly TriageSimilarityResult[]> => {
  const embeddingVector = formatEmbeddingVector(embedding);

  try {
    const result = await query<TriageResultSimilarityRow>(
      INCIDENT_TRIAGE_RESULT_QUERIES.SEARCH_SIMILAR_TRIAGE,
      [embeddingVector, tenantId, excludeAlertId, minSimilarity, limit]
    );

    const results = result.rows.map(mapRowToSimilarityResult);

    logger.info("Searched similar triage results", {
      resultCount: results.length,
      tenantId,
      excludeAlertId,
      minSimilarity,
    });

    return Object.freeze(results);
  } catch (error) {
    logger.error("Failed to search similar triage results", {
      tenantId,
      excludeAlertId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
