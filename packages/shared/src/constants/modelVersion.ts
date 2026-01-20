/**
 * Model Version Repository Constants
 *
 * SQL queries and configuration for model version operations.
 *
 * @module constants/modelVersion
 */

// ==================== Default Values ====================

/**
 * Default configuration for model version operations.
 */
export const MODEL_VERSION_DEFAULTS = {
  /** Default feature flags ID (singleton). */
  DEFAULT_FLAGS_ID: "default",
  /** Default baseline flag value. */
  DEFAULT_IS_BASELINE: false,
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for model version operations.
 */
export const MODEL_VERSION_QUERIES = {
  INSERT_MODEL_VERSION: `
    INSERT INTO model_versions (
      id, name, model_id, description, created_at, is_baseline,
      training_dataset_id, training_examples_count, parent_model_id,
      accuracy, helpful_rate, recall_at_5, mrr, human_review_score
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `,

  GET_MODEL_VERSION: `
    SELECT * FROM model_versions WHERE id = $1
  `,

  GET_ALL_MODEL_VERSIONS: `
    SELECT * FROM model_versions ORDER BY created_at DESC
  `,

  GET_BASELINE_VERSION: `
    SELECT * FROM model_versions WHERE is_baseline = true LIMIT 1
  `,

  DELETE_MODEL_VERSION: `
    DELETE FROM model_versions WHERE id = $1 AND is_baseline = false
  `,

  UPSERT_FEATURE_FLAGS: `
    INSERT INTO model_feature_flags (
      id, default_model_version, rollback_enabled, rollback_model_version,
      ab_test_enabled, ab_test_control_version, ab_test_treatment_version,
      ab_test_treatment_percentage, ab_test_started_at, ab_test_end_at,
      tenant_overrides, rollback_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (id) DO UPDATE SET
      default_model_version = EXCLUDED.default_model_version,
      rollback_enabled = EXCLUDED.rollback_enabled,
      rollback_model_version = EXCLUDED.rollback_model_version,
      ab_test_enabled = EXCLUDED.ab_test_enabled,
      ab_test_control_version = EXCLUDED.ab_test_control_version,
      ab_test_treatment_version = EXCLUDED.ab_test_treatment_version,
      ab_test_treatment_percentage = EXCLUDED.ab_test_treatment_percentage,
      ab_test_started_at = EXCLUDED.ab_test_started_at,
      ab_test_end_at = EXCLUDED.ab_test_end_at,
      tenant_overrides = EXCLUDED.tenant_overrides,
      rollback_active = EXCLUDED.rollback_active,
      updated_at = NOW()
    RETURNING *
  `,

  GET_FEATURE_FLAGS: `
    SELECT * FROM model_feature_flags WHERE id = $1
  `,

  SET_ROLLBACK_ACTIVE: `
    UPDATE model_feature_flags SET rollback_active = $1, updated_at = NOW() WHERE id = $2
  `,

  UPDATE_TENANT_OVERRIDES: `
    UPDATE model_feature_flags SET tenant_overrides = $1, updated_at = NOW() WHERE id = $2
  `,
} as const;
