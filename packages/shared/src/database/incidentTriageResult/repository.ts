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
  UpdateTriageAiSummaryInput,
  UpdateTriageDispatchInput,
  TriageResultSimilarityRow,
  TriageSimilarityResult,
  SeverityDistributionRow,
  SeverityDistributionEntry,
  SeverityBySourceRow,
  SeverityBySourceEntry,
  PipelineStatsRow,
  DedupRateRow,
  TriageStats,
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
  id: string,
  tenantId: string
): Promise<IncidentTriageResultRecord | null> => {
  validateTriageResultId(id);

  try {
    const result = await query<IncidentTriageResultRow>(INCIDENT_TRIAGE_RESULT_QUERIES.GET_BY_ID, [
      id,
      tenantId,
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
  alertId: string,
  tenantId: string
): Promise<IncidentTriageResultRecord | null> => {
  if (!alertId?.trim()) {
    return null;
  }

  try {
    const result = await query<IncidentTriageResultRow>(
      INCIDENT_TRIAGE_RESULT_QUERIES.GET_BY_ALERT_ID,
      [alertId, tenantId]
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
 * Updates a triage result with AI summary data (Phase 4).
 *
 * @param input - The AI summary data to store
 * @returns The updated triage result record
 */
export const updateTriageAiSummary = async (
  input: UpdateTriageAiSummaryInput
): Promise<IncidentTriageResultRecord> => {
  validateTriageResultId(input.triageResultId);

  try {
    const result = await query<IncidentTriageResultRow>(
      INCIDENT_TRIAGE_RESULT_QUERIES.UPDATE_AI_SUMMARY,
      [
        input.triageResultId,
        JSON.stringify(input.aiSummary),
        input.summarySource,
        input.pipelineDurationMs,
      ]
    );

    const record = mapRowToTriageResult(result.rows[0]);

    logger.info("Triage result AI summary updated", {
      id: record.id,
      alertId: record.alertId,
      summarySource: record.summarySource,
    });

    return record;
  } catch (error) {
    logger.error("Failed to update triage AI summary", {
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

/**
 * Updates a triage result with dispatch results (Phase 5).
 *
 * @param input - The dispatch result data to store
 * @returns The updated triage result record
 */
export const updateTriageDispatchResults = async (
  input: UpdateTriageDispatchInput
): Promise<IncidentTriageResultRecord> => {
  validateTriageResultId(input.triageResultId);

  try {
    const result = await query<IncidentTriageResultRow>(
      INCIDENT_TRIAGE_RESULT_QUERIES.UPDATE_DISPATCH_RESULTS,
      [
        input.triageResultId,
        JSON.stringify(input.routingDecision),
        JSON.stringify(input.dispatchedTo),
        input.pipelineDurationMs,
      ]
    );

    const record = mapRowToTriageResult(result.rows[0]);

    logger.info("Triage result dispatch updated", {
      id: record.id,
      alertId: record.alertId,
    });

    return record;
  } catch (error) {
    logger.error("Failed to update triage dispatch results", {
      triageResultId: input.triageResultId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/** Maps a severity distribution row to domain entry */
const mapSeverityRow = (row: SeverityDistributionRow): SeverityDistributionEntry => ({
  severityLabel: row.severity_label,
  count: parseInt(row.count, 10),
});

/** Safely parses a nullable numeric string */
const parseNullableFloat = (value: string | null): number | null =>
  value === null ? null : parseFloat(value);

/**
 * Retrieves triage pipeline statistics for a tenant.
 *
 * @param tenantId - The tenant to query stats for
 * @returns Aggregated pipeline metrics
 */
export const getTriageStats = async (tenantId: string): Promise<TriageStats> => {
  try {
    const [distResult, statsResult, dedupResult] = await Promise.all([
      query<SeverityDistributionRow>(INCIDENT_TRIAGE_RESULT_QUERIES.GET_SEVERITY_DISTRIBUTION, [
        tenantId,
      ]),
      query<PipelineStatsRow>(INCIDENT_TRIAGE_RESULT_QUERIES.GET_PIPELINE_STATS, [tenantId]),
      query<DedupRateRow>(INCIDENT_TRIAGE_RESULT_QUERIES.GET_DEDUP_RATE, [tenantId]),
    ]);

    const severityDistribution = distResult.rows.map(mapSeverityRow);
    const stats = statsResult.rows[0];
    const dedup = dedupResult.rows[0];

    const result: TriageStats = {
      severityDistribution,
      totalTriaged: parseInt(stats?.total_triaged ?? "0", 10),
      avgDurationMs: parseNullableFloat(stats?.avg_duration_ms ?? null),
      p50DurationMs: parseNullableFloat(stats?.p50_duration_ms ?? null),
      p95DurationMs: parseNullableFloat(stats?.p95_duration_ms ?? null),
      aiSummaryCount: parseInt(stats?.ai_summary_count ?? "0", 10),
      fallbackSummaryCount: parseInt(stats?.fallback_summary_count ?? "0", 10),
      dispatchedCount: parseInt(stats?.dispatched_count ?? "0", 10),
      routedCount: parseInt(stats?.routed_count ?? "0", 10),
      totalAlerts: parseInt(dedup?.total_alerts ?? "0", 10),
      dedupedCount: parseInt(dedup?.deduped_count ?? "0", 10),
      activeAlerts: parseInt(dedup?.active_alerts ?? "0", 10),
    };

    logger.info("Retrieved triage stats", {
      tenantId,
      totalTriaged: result.totalTriaged,
      totalAlerts: result.totalAlerts,
    });

    return result;
  } catch (error) {
    logger.error("Failed to get triage stats", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/** Maps a severity-by-source row to the domain type */
const mapSeverityBySourceRow = (row: SeverityBySourceRow): SeverityBySourceEntry => ({
  source: row.source,
  severityLabel: row.severity_label,
  count: row.count,
});

/**
 * Retrieves severity distribution grouped by alert source.
 *
 * @param tenantId - The tenant to query
 * @returns Array of severity distribution entries grouped by source
 */
export const getSeverityDistributionBySource = async (
  tenantId: string
): Promise<readonly SeverityBySourceEntry[]> => {
  try {
    const result = await query<SeverityBySourceRow>(
      INCIDENT_TRIAGE_RESULT_QUERIES.GET_SEVERITY_BY_SOURCE,
      [tenantId]
    );

    const entries = result.rows.map(mapSeverityBySourceRow);

    logger.info("Retrieved severity distribution by source", {
      tenantId,
      entryCount: entries.length,
    });

    return entries;
  } catch (error) {
    logger.error("Failed to get severity distribution by source", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
