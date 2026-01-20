/**
 * Analysis Helpers
 *
 * Validation functions and helper utilities for analysis repository operations.
 *
 * @module database/analysis/helpers
 */

import { ValidationError, ANALYSIS_DEFAULTS } from "../common.js";
import type {
  CreateAnalysisInput,
  CreateAnalysisValidationRule,
  AnalysisRow,
  AnalysisRecord,
} from "./types.js";

// ==================== Constants ====================

/** Analysis ID prefix for generation. */
export const ANALYSIS_ID_PREFIX = "ana";

// ==================== Validation Rules ====================

/** Validation rules for CreateAnalysisInput. */
const CREATE_INPUT_VALIDATION_RULES: readonly CreateAnalysisValidationRule[] = [
  {
    field: "summary",
    isInvalid: (input) => input.summary.trim().length === 0,
    message: "Analysis summary cannot be empty",
  },
  {
    field: "diagnosisConfidence",
    isInvalid: (input) => !Number.isFinite(input.diagnosisConfidence),
    message: "Diagnosis confidence must be a valid number",
    getValue: (input) => input.diagnosisConfidence,
  },
];

// ==================== Validation Functions ====================

/**
 * Validates that a string ID is non-empty.
 *
 * @throws ValidationError if ID is empty or whitespace-only
 */
export const validateId = (id: string, fieldName: string): void => {
  if (id.trim().length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, {
      operation: "validateId",
      metadata: { field: fieldName },
    });
  }
};

/**
 * Validates that a query limit is positive.
 *
 * @throws ValidationError if limit is not positive
 */
export const validateLimit = (limit: number): void => {
  if (!Number.isFinite(limit) || limit < ANALYSIS_DEFAULTS.MIN_QUERY_LIMIT) {
    throw new ValidationError(`Query limit must be at least ${ANALYSIS_DEFAULTS.MIN_QUERY_LIMIT}`, {
      operation: "validateLimit",
      metadata: { limit, minimum: ANALYSIS_DEFAULTS.MIN_QUERY_LIMIT },
    });
  }
};

/**
 * Validates required fields in CreateAnalysisInput.
 *
 * @throws ValidationError if required fields are invalid
 */
export const validateCreateInput = (input: CreateAnalysisInput): void => {
  const failedRule = CREATE_INPUT_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  const metadata: Record<string, unknown> = { field: failedRule.field };

  if (failedRule.getValue !== undefined) {
    metadata.value = failedRule.getValue(input);
  }

  throw new ValidationError(failedRule.message, {
    operation: "validateCreateInput",
    metadata,
  });
};

// ==================== Row Mappers ====================

/**
 * Maps a database row to an AnalysisRecord.
 */
export const mapRowToAnalysis = (row: AnalysisRow): AnalysisRecord => ({
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

/**
 * Extracts first row from query result, returning null if empty.
 */
export const extractFirstAnalysisRow = (rows: readonly AnalysisRow[]): AnalysisRecord | null =>
  rows.length > 0 ? mapRowToAnalysis(rows[0]) : null;

// ==================== Serialization Helpers ====================

/**
 * Serializes optional JSON field for database storage.
 */
export const serializeOptionalJson = (
  value: Record<string, unknown> | readonly string[] | undefined
): string | null => (value === undefined ? null : JSON.stringify(value));

/**
 * Serializes required JSON field for database storage.
 */
export const serializeRequiredJson = (value: Record<string, unknown>): string =>
  JSON.stringify(value);
