/**
 * Model Version Repository Helpers
 *
 * Validation functions and row mappers for model version operations.
 *
 * @module database/modelVersion/helpers
 */

import {
  ValidationError,
  validateId,
  type ModelVersion,
  type ModelMetadata,
  type ABTestConfig,
} from "../common.js";
import type {
  ABTestConfigValues,
  CreateModelVersionInput,
  CreateModelVersionValidationRule,
  FeatureFlagsRow,
  FeatureFlagsWithRollback,
  ModelVersionRow,
  SaveFeatureFlagsInput,
} from "./types.js";

// ==================== Validation Rules ====================

/** Validation rules for creating model versions. */
const CREATE_MODEL_VERSION_VALIDATION_RULES: readonly CreateModelVersionValidationRule[] = [
  {
    isInvalid: (input) => input.name.trim().length === 0,
    getMessage: () => "Model version name cannot be empty",
    field: "name",
  },
  {
    isInvalid: (input) => input.modelId.trim().length === 0,
    getMessage: () => "Model ID cannot be empty",
    field: "modelId",
  },
];

// ==================== Input Validation ====================

/**
 * Validates CreateModelVersionInput using handler pattern.
 *
 * @param input - Input to validate
 * @throws ValidationError if input is invalid
 */
export const validateCreateModelVersionInput = (input: CreateModelVersionInput): void => {
  const failedRule = CREATE_MODEL_VERSION_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  throw new ValidationError(failedRule.getMessage(), {
    operation: "validateCreateModelVersionInput",
    metadata: { field: failedRule.field },
  });
};

// Re-export shared validator for backwards compatibility
export { validateId };

/**
 * Validates SaveFeatureFlagsInput.
 *
 * @param input - Input to validate
 * @throws ValidationError if input is invalid
 */
export const validateSaveFeatureFlagsInput = (input: SaveFeatureFlagsInput): void => {
  if (input.flags.defaultModelVersion.trim().length === 0) {
    throw new ValidationError("Default model version cannot be empty", {
      operation: "validateSaveFeatureFlagsInput",
      metadata: { field: "defaultModelVersion" },
    });
  }

  if (input.flags.rollbackModelVersion.trim().length === 0) {
    throw new ValidationError("Rollback model version cannot be empty", {
      operation: "validateSaveFeatureFlagsInput",
      metadata: { field: "rollbackModelVersion" },
    });
  }
};

// ==================== Helper Functions ====================

/**
 * Checks if row has metadata fields populated.
 */
const hasMetadataFields = (row: ModelVersionRow): boolean =>
  row.training_dataset_id !== null ||
  row.training_examples_count !== null ||
  row.parent_model_id !== null ||
  row.accuracy !== null;

/**
 * Checks if row has evaluation metrics populated.
 */
const hasEvaluationMetrics = (row: ModelVersionRow): boolean =>
  row.accuracy !== null ||
  row.helpful_rate !== null ||
  row.recall_at_5 !== null ||
  row.mrr !== null ||
  row.human_review_score !== null;

/**
 * Builds evaluation metrics from row if present.
 */
const buildEvaluationMetrics = (
  row: ModelVersionRow
): ModelMetadata["evaluationMetrics"] | undefined => {
  if (!hasEvaluationMetrics(row)) {
    return undefined;
  }

  return {
    accuracy: row.accuracy ?? undefined,
    helpfulRate: row.helpful_rate ?? undefined,
    recallAt5: row.recall_at_5 ?? undefined,
    mrr: row.mrr ?? undefined,
    humanReviewScore: row.human_review_score ?? undefined,
  };
};

/**
 * Builds model metadata from row if present.
 */
const buildModelMetadata = (row: ModelVersionRow): ModelMetadata | undefined => {
  if (!hasMetadataFields(row)) {
    return undefined;
  }

  return {
    trainingDatasetId: row.training_dataset_id ?? undefined,
    trainingExamplesCount: row.training_examples_count ?? undefined,
    parentModelId: row.parent_model_id ?? undefined,
    evaluationMetrics: buildEvaluationMetrics(row),
  };
};

/**
 * Extracts A/B test configuration from row if valid.
 * Returns null if config is incomplete.
 */
const extractABTestConfigValues = (row: FeatureFlagsRow): ABTestConfigValues | null => {
  const controlVersion = row.ab_test_control_version;
  const treatmentVersion = row.ab_test_treatment_version;
  const treatmentPercentage = row.ab_test_treatment_percentage;

  if (
    !row.ab_test_enabled ||
    controlVersion === null ||
    treatmentVersion === null ||
    treatmentPercentage === null
  ) {
    return null;
  }

  return { controlVersion, treatmentVersion, treatmentPercentage };
};

/**
 * Builds A/B test config from row if valid.
 */
const buildABTestConfig = (row: FeatureFlagsRow): ABTestConfig | undefined => {
  const configValues = extractABTestConfigValues(row);

  if (configValues === null) {
    return undefined;
  }

  return {
    controlVersion: configValues.controlVersion,
    treatmentVersion: configValues.treatmentVersion,
    treatmentPercentage: configValues.treatmentPercentage,
    startedAt: row.ab_test_started_at ?? new Date().toISOString(),
    endAt: row.ab_test_end_at ?? undefined,
  };
};

// ==================== Row Mappers ====================

/**
 * Maps database row to ModelVersion domain object.
 *
 * @param row - Database row from model_versions table
 * @returns ModelVersion domain object
 */
export const mapRowToModelVersion = (row: ModelVersionRow): ModelVersion => ({
  id: row.id,
  name: row.name,
  modelId: row.model_id,
  description: row.description ?? undefined,
  createdAt: row.created_at,
  isBaseline: row.is_baseline,
  metadata: buildModelMetadata(row),
});

/**
 * Maps database row to ModelFeatureFlags domain object.
 *
 * @param row - Database row from model_feature_flags table
 * @returns Feature flags with rollback state
 */
export const mapRowToFeatureFlags = (row: FeatureFlagsRow): FeatureFlagsWithRollback => ({
  defaultModelVersion: row.default_model_version,
  rollbackEnabled: row.rollback_enabled,
  rollbackModelVersion: row.rollback_model_version,
  abTestEnabled: row.ab_test_enabled,
  abTestConfig: buildABTestConfig(row),
  tenantOverrides: row.tenant_overrides ?? undefined,
  rollbackActive: row.rollback_active,
});
