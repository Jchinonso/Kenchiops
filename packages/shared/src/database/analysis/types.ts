/**
 * Analysis Types
 *
 * Type definitions for analysis storage and retrieval.
 *
 * @module database/analysis/types
 */

// ==================== Input Types ====================

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

// ==================== Record Types ====================

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

// ==================== Database Row Types ====================

/**
 * Database row type for analyses table.
 */
export interface AnalysisRow {
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

/**
 * Database row type for batch event ID lookup (partial SELECT).
 */
export interface AnalysisEventRow {
  readonly id: string;
  readonly event_id: string;
  readonly diagnosis_confidence: number;
}

/**
 * Database row type for count queries.
 */
export interface AnalysisCountRow {
  readonly count: string;
}

// ==================== Validation Types ====================

/**
 * Validation rule for CreateAnalysisInput fields.
 */
export interface CreateAnalysisValidationRule {
  readonly field: keyof CreateAnalysisInput;
  readonly isInvalid: (input: CreateAnalysisInput) => boolean;
  readonly message: string;
  readonly getValue?: (input: CreateAnalysisInput) => unknown;
}
