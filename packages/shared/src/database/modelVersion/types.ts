/**
 * Model Version Repository Types
 *
 * Type definitions for model version database operations.
 *
 * @module database/modelVersion/types
 */

import type { ModelFeatureFlags } from "../common.js";

// ==================== Database Row Types ====================

/**
 * Database row for model versions table.
 */
export interface ModelVersionRow {
  readonly id: string;
  readonly name: string;
  readonly model_id: string;
  readonly description: string | null;
  readonly created_at: string;
  readonly is_baseline: boolean;
  readonly training_dataset_id: string | null;
  readonly training_examples_count: number | null;
  readonly parent_model_id: string | null;
  readonly accuracy: number | null;
  readonly helpful_rate: number | null;
  readonly recall_at_5: number | null;
  readonly mrr: number | null;
  readonly human_review_score: number | null;
}

/**
 * Database row for model feature flags table.
 */
export interface FeatureFlagsRow {
  readonly id: string;
  readonly default_model_version: string;
  readonly rollback_enabled: boolean;
  readonly rollback_model_version: string;
  readonly ab_test_enabled: boolean;
  readonly ab_test_control_version: string | null;
  readonly ab_test_treatment_version: string | null;
  readonly ab_test_treatment_percentage: number | null;
  readonly ab_test_started_at: string | null;
  readonly ab_test_end_at: string | null;
  readonly tenant_overrides: Record<string, string> | null;
  readonly rollback_active: boolean;
  readonly updated_at: string;
}

// ==================== Input Types ====================

/**
 * Input for creating a model version.
 */
export interface CreateModelVersionInput {
  readonly name: string;
  readonly modelId: string;
  readonly description?: string;
  readonly isBaseline?: boolean;
  readonly metadata?: {
    readonly trainingDatasetId?: string;
    readonly trainingExamplesCount?: number;
    readonly parentModelId?: string;
    readonly evaluationMetrics?: {
      readonly accuracy?: number;
      readonly helpfulRate?: number;
      readonly recallAt5?: number;
      readonly mrr?: number;
      readonly humanReviewScore?: number;
    };
  };
}

/**
 * Input for saving feature flags.
 */
export interface SaveFeatureFlagsInput {
  readonly flags: ModelFeatureFlags;
  readonly rollbackActive: boolean;
}

/**
 * Feature flags with rollback state.
 */
export type FeatureFlagsWithRollback = ModelFeatureFlags & { readonly rollbackActive: boolean };

// ==================== Validation Types ====================

/**
 * Validation rule for CreateModelVersionInput.
 */
export interface CreateModelVersionValidationRule {
  readonly isInvalid: (input: CreateModelVersionInput) => boolean;
  readonly getMessage: () => string;
  readonly field: string;
}

/**
 * A/B test configuration values extracted from row.
 */
export interface ABTestConfigValues {
  readonly controlVersion: string;
  readonly treatmentVersion: string;
  readonly treatmentPercentage: number;
}
