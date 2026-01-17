/**
 * Analysis Repository
 *
 * Database operations for storing and retrieving analyses.
 * Tracks which model version was used for each analysis.
 *
 * @module database/analysisRepository
 */

import { query } from "./client.js";
import { createLogger, generateEventId } from "../core/index.js";

const logger = createLogger("analysis-repository");

// ==================== Types ====================

/**
 * Input for creating a new analysis.
 */
export interface CreateAnalysisInput {
  readonly eventId?: string | null;
  readonly summary: string;
  readonly identifiedCause?: string;
  readonly diagnosisConfidence: number;
  readonly actionConfidence?: number;
  readonly confidenceSignals?: Record<string, unknown>;
  readonly recommendedActions?: readonly string[];
  readonly fullAnalysis: Record<string, unknown>;
  readonly tenantId?: string;
  readonly modelVersionId?: string;
  /** Links to feedback via repo:commit format (e.g., "owner/repo:sha") */
  readonly aggregationKey?: string;
}

/**
 * Stored analysis record.
 */
export interface AnalysisRecord {
  readonly id: string;
  readonly eventId: string | null;
  readonly summary: string;
  readonly identifiedCause: string | null;
  readonly diagnosisConfidence: number;
  readonly actionConfidence: number | null;
  readonly confidenceSignals: Record<string, unknown> | null;
  readonly recommendedActions: readonly string[] | null;
  readonly fullAnalysis: Record<string, unknown>;
  readonly tenantId: string | null;
  readonly modelVersionId: string | null;
  /** Links to feedback via repo:commit format (e.g., "owner/repo:sha") */
  readonly aggregationKey: string | null;
  readonly createdAt: Date;
}

/**
 * Database row type for analyses.
 */
interface AnalysisRow {
  readonly id: string;
  readonly event_id: string | null;
  readonly summary: string;
  readonly identified_cause: string | null;
  readonly diagnosis_confidence: number;
  readonly action_confidence: number | null;
  readonly confidence_signals: Record<string, unknown> | null;
  readonly recommended_actions: string[] | null;
  readonly full_analysis: Record<string, unknown>;
  readonly tenant_id: string | null;
  readonly model_version_id: string | null;
  readonly aggregation_key: string | null;
  readonly created_at: Date;
}

// ==================== SQL Queries ====================

const ANALYSIS_QUERIES = {
  INSERT: `
    INSERT INTO analyses (
      id, event_id, summary, identified_cause, diagnosis_confidence,
      action_confidence, confidence_signals, recommended_actions,
      full_analysis, tenant_id, model_version_id, aggregation_key
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `,

  GET_BY_ID: `
    SELECT * FROM analyses WHERE id = $1
  `,

  GET_BY_EVENT_ID: `
    SELECT * FROM analyses WHERE event_id = $1
  `,

  GET_BY_MODEL_VERSION: `
    SELECT * FROM analyses
    WHERE model_version_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `,

  COUNT_BY_MODEL_VERSION: `
    SELECT COUNT(*) as count FROM analyses
    WHERE model_version_id = $1
  `,
} as const;

// ==================== Mapping Functions ====================

/**
 * Maps a database row to an AnalysisRecord.
 */
const mapRowToRecord = (row: AnalysisRow): AnalysisRecord => ({
  id: row.id,
  eventId: row.event_id,
  summary: row.summary,
  identifiedCause: row.identified_cause,
  diagnosisConfidence: row.diagnosis_confidence,
  actionConfidence: row.action_confidence,
  confidenceSignals: row.confidence_signals,
  recommendedActions: row.recommended_actions,
  fullAnalysis: row.full_analysis,
  tenantId: row.tenant_id,
  modelVersionId: row.model_version_id,
  aggregationKey: row.aggregation_key,
  createdAt: row.created_at,
});

// ==================== Public API ====================

/**
 * Creates a new analysis record in the database.
 *
 * @param input - The analysis data to store
 * @returns The created analysis record
 */
export const createAnalysis = async (input: CreateAnalysisInput): Promise<AnalysisRecord> => {
  const id = generateEventId("ana");

  const result = await query<AnalysisRow>(ANALYSIS_QUERIES.INSERT, [
    id,
    input.eventId,
    input.summary,
    input.identifiedCause ?? null,
    input.diagnosisConfidence,
    input.actionConfidence ?? null,
    input.confidenceSignals ? JSON.stringify(input.confidenceSignals) : null,
    input.recommendedActions ? JSON.stringify(input.recommendedActions) : null,
    JSON.stringify(input.fullAnalysis),
    input.tenantId ?? null,
    input.modelVersionId ?? null,
    input.aggregationKey ?? null,
  ]);

  const record = mapRowToRecord(result.rows[0]);

  logger.info("Analysis created", {
    id: record.id,
    eventId: record.eventId,
    modelVersionId: record.modelVersionId,
    diagnosisConfidence: record.diagnosisConfidence,
  });

  return record;
};

/**
 * Retrieves an analysis by its ID.
 *
 * @param id - The analysis ID
 * @returns The analysis record or null if not found
 */
export const getAnalysisById = async (id: string): Promise<AnalysisRecord | null> => {
  const result = await query<AnalysisRow>(ANALYSIS_QUERIES.GET_BY_ID, [id]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToRecord(result.rows[0]);
};

/**
 * Retrieves an analysis by its event ID.
 *
 * @param eventId - The event ID
 * @returns The analysis record or null if not found
 */
export const getAnalysisByEventId = async (eventId: string): Promise<AnalysisRecord | null> => {
  const result = await query<AnalysisRow>(ANALYSIS_QUERIES.GET_BY_EVENT_ID, [eventId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToRecord(result.rows[0]);
};

/**
 * Retrieves analyses by model version ID.
 *
 * @param modelVersionId - The model version ID
 * @param limit - Maximum number of records to return
 * @returns Array of analysis records
 */
export const getAnalysesByModelVersion = async (
  modelVersionId: string,
  limit = 100
): Promise<readonly AnalysisRecord[]> => {
  const result = await query<AnalysisRow>(ANALYSIS_QUERIES.GET_BY_MODEL_VERSION, [
    modelVersionId,
    limit,
  ]);

  return result.rows.map(mapRowToRecord);
};

/**
 * Counts analyses by model version ID.
 *
 * @param modelVersionId - The model version ID
 * @returns The count of analyses
 */
export const countAnalysesByModelVersion = async (modelVersionId: string): Promise<number> => {
  const result = await query<{ count: string }>(ANALYSIS_QUERIES.COUNT_BY_MODEL_VERSION, [
    modelVersionId,
  ]);

  return parseInt(result.rows[0].count, 10);
};
