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
  AnalysisEventRow,
  ConfidenceDistributionRow,
  ConfidenceTrendRow,
  ConfidenceTrendPoint,
  AnalysisCountByRepoRow,
  AnalysisCountByRepo,
} from "./types.js";
import {
  ANALYSIS_ID_PREFIX,
  validateId,
  validateLimit,
  validateCreateInput,
  mapRowToAnalysis,
  extractFirstAnalysisRow,
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
      input.confidenceSignals === undefined ? null : JSON.stringify(input.confidenceSignals),
      input.recommendedActions === undefined ? null : JSON.stringify(input.recommendedActions),
      JSON.stringify(input.fullAnalysis),
      input.tenantId ?? null,
      input.modelVersionId ?? null,
      input.aggregationKey ?? null,
      input.ciProvider ?? null,
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

/**
 * Retrieves analyses by tenant ID.
 *
 * @param tenantId - The tenant ID
 * @param limit - Maximum number of records to return (default: 50)
 * @param offset - Number of records to skip (default: 0)
 * @returns Array of analysis records
 * @throws ValidationError if tenantId is empty or limit is invalid
 * @throws Error if database operation fails
 */
export const getAnalysesByTenant = async (
  tenantId: string,
  limit: number = ANALYSIS_DEFAULTS.TENANT_QUERY_LIMIT,
  offset: number = 0
): Promise<readonly AnalysisRecord[]> => {
  validateId(tenantId, "tenantId");
  validateLimit(limit);

  try {
    const result = await query<AnalysisRow>(ANALYSIS_QUERIES.GET_BY_TENANT, [
      tenantId,
      limit,
      offset,
    ]);

    return Object.freeze(result.rows.map(mapRowToAnalysis));
  } catch (error) {
    logger.error("Failed to get analyses by tenant", {
      tenantId,
      limit,
      offset,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Counts analyses by tenant ID.
 *
 * @param tenantId - The tenant ID
 * @returns The count of analyses
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const countAnalysesByTenant = async (tenantId: string): Promise<number> => {
  validateId(tenantId, "tenantId");

  try {
    const result = await query<AnalysisCountRow>(ANALYSIS_QUERIES.COUNT_BY_TENANT, [tenantId]);

    return parseInt(result.rows[0].count, PARSE_INT_RADIX);
  } catch (error) {
    logger.error("Failed to count analyses by tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves analyses by tenant ID with optional filters.
 *
 * @param tenantId - The tenant ID
 * @param repository - Optional repository name filter (ILIKE match on aggregation_key)
 * @param minConfidence - Optional minimum diagnosis confidence threshold
 * @param limit - Maximum number of records to return (default: 50)
 * @param offset - Number of records to skip (default: 0)
 * @returns Array of analysis records matching the filters
 * @throws ValidationError if tenantId is empty or limit is invalid
 * @throws Error if database operation fails
 */
export const getAnalysesByTenantFiltered = async (
  tenantId: string,
  repository: string | null,
  minConfidence: number | null,
  maxConfidence: number | null,
  since: string | null = null,
  until: string | null = null,
  limit: number = ANALYSIS_DEFAULTS.TENANT_QUERY_LIMIT,
  offset: number = 0,
  source: string | null = null
): Promise<readonly AnalysisRecord[]> => {
  validateId(tenantId, "tenantId");
  validateLimit(limit);

  try {
    const result = await query<AnalysisRow>(ANALYSIS_QUERIES.GET_BY_TENANT_FILTERED, [
      tenantId,
      repository,
      minConfidence,
      maxConfidence,
      since,
      until,
      source,
      limit,
      offset,
    ]);
    return Object.freeze(result.rows.map(mapRowToAnalysis));
  } catch (error) {
    logger.error("Failed to get filtered analyses by tenant", {
      tenantId,
      repository,
      minConfidence,
      maxConfidence,
      since,
      until,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Counts analyses by tenant ID with optional filters.
 *
 * @param tenantId - The tenant ID
 * @param repository - Optional repository name filter (ILIKE match on aggregation_key)
 * @param minConfidence - Optional minimum diagnosis confidence threshold
 * @returns The count of matching analyses
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const countAnalysesByTenantFiltered = async (
  tenantId: string,
  repository: string | null,
  minConfidence: number | null,
  maxConfidence: number | null,
  since: string | null = null,
  until: string | null = null,
  source: string | null = null
): Promise<number> => {
  validateId(tenantId, "tenantId");

  try {
    const result = await query<AnalysisCountRow>(ANALYSIS_QUERIES.COUNT_BY_TENANT_FILTERED, [
      tenantId,
      repository,
      minConfidence,
      maxConfidence,
      since,
      until,
      source,
    ]);
    return parseInt(result.rows[0].count, PARSE_INT_RADIX);
  } catch (error) {
    logger.error("Failed to count filtered analyses by tenant", {
      tenantId,
      since,
      until,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves analysis summaries for multiple event IDs (batch lookup).
 * Returns a map of eventId to analysisId and confidence.
 */
export const getAnalysesByEventIds = async (
  eventIds: readonly string[],
  tenantId: string
): Promise<ReadonlyMap<string, { readonly analysisId: string; readonly confidence: number }>> => {
  const { length: count } = eventIds;
  if (count === 0) {
    return new Map();
  }

  try {
    const result = await query<AnalysisEventRow>(ANALYSIS_QUERIES.GET_BY_EVENT_IDS, [
      eventIds,
      tenantId,
    ]);

    const mapEventRow = ({
      event_id,
      id,
      diagnosis_confidence,
    }: AnalysisEventRow): readonly [
      string,
      { readonly analysisId: string; readonly confidence: number },
    ] => [event_id, { analysisId: id, confidence: diagnosis_confidence }];

    return new Map(result.rows.map(mapEventRow));
  } catch (error) {
    logger.error("Failed to get analyses by event IDs", {
      eventIdCount: count,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Returns the confidence distribution for a tenant's analyses,
 * bucketed into high (>=0.8), medium (>=0.5), and low (<0.5).
 */
export const getConfidenceDistribution = async (
  tenantId: string
): Promise<readonly ConfidenceDistributionRow[]> => {
  validateId(tenantId, "tenantId");

  try {
    const result = await query<ConfidenceDistributionRow>(
      ANALYSIS_QUERIES.CONFIDENCE_DISTRIBUTION,
      [tenantId]
    );
    return Object.freeze(result.rows);
  } catch (error) {
    logger.error("Failed to get confidence distribution", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Finds analyses matching a commit SHA via aggregation_key suffix.
 * Used for cross-pipeline correlation (linking incidents to CI/CD analyses).
 *
 * @param tenantId - The tenant ID
 * @param commitSha - The commit SHA to search for
 * @returns Array of analysis records matching the commit
 */
export const findAnalysesByCommitSha = async (
  tenantId: string,
  commitSha: string
): Promise<readonly AnalysisRecord[]> => {
  validateId(tenantId, "tenantId");
  validateId(commitSha, "commitSha");

  try {
    const result = await query<AnalysisRow>(ANALYSIS_QUERIES.FIND_BY_COMMIT_SHA, [
      tenantId,
      commitSha,
    ]);

    return Object.freeze(result.rows.map(mapRowToAnalysis));
  } catch (error) {
    logger.error("Failed to find analyses by commit SHA", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Returns per-repository analysis counts for a tenant.
 * Used for rendering repo filter tabs on the CI/CD Analyses page.
 *
 * @param tenantId - The tenant ID
 * @returns Array of per-repository analysis counts ordered by count desc
 */
export const getAnalysisCountsByRepo = async (
  tenantId: string
): Promise<readonly AnalysisCountByRepo[]> => {
  validateId(tenantId, "tenantId");

  try {
    const result = await query<AnalysisCountByRepoRow>(ANALYSIS_QUERIES.COUNT_BY_REPO, [tenantId]);

    const counts = result.rows.map((row) => ({
      repository: row.repository,
      analysisCount: parseInt(row.analysis_count, PARSE_INT_RADIX),
    }));

    logger.info("Retrieved analysis counts by repo", {
      tenantId,
      repoCount: counts.length,
    });

    return Object.freeze(counts);
  } catch (error) {
    logger.error("Failed to get analysis counts by repo", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Returns a time-series of average confidence, bucketed by day or week.
 *
 * @param tenantId - The tenant ID
 * @param bucket - Time bucket: "day" or "week"
 * @param since - ISO timestamp for the start of the window
 * @returns Array of trend data points ordered by date
 */
export const getConfidenceTrend = async (
  tenantId: string,
  bucket: "day" | "week" = "day",
  since: string = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
): Promise<readonly ConfidenceTrendPoint[]> => {
  validateId(tenantId, "tenantId");

  try {
    const result = await query<ConfidenceTrendRow>(ANALYSIS_QUERIES.CONFIDENCE_TREND, [
      tenantId,
      bucket,
      since,
    ]);

    return Object.freeze(
      result.rows.map((row) => ({
        date: row.bucket,
        avgConfidence: parseFloat(row.avg_confidence),
        count: row.count,
      }))
    );
  } catch (error) {
    logger.error("Failed to get confidence trend", {
      tenantId,
      bucket,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
