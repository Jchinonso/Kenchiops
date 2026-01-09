/**
 * Model Version Repository
 *
 * Database operations for model versions and feature flags.
 * Supports model versioning, A/B testing, and rollback.
 *
 * @module database/modelVersionRepository
 */

import { query } from "./client.js";
import { createLogger } from "../core/logger.js";
import { generateEventId } from "../core/utils.js";
import type {
  ModelVersion,
  ModelMetadata,
  ModelFeatureFlags,
  ABTestConfig,
} from "../finetuning/modelVersioning.js";

const logger = createLogger("model-version-repository");

// ==================== Row Types ====================

interface ModelVersionRow {
  id: string;
  name: string;
  model_id: string;
  description: string | null;
  created_at: string;
  is_baseline: boolean;
  training_dataset_id: string | null;
  training_examples_count: number | null;
  parent_model_id: string | null;
  accuracy: number | null;
  helpful_rate: number | null;
  recall_at_5: number | null;
  mrr: number | null;
  human_review_score: number | null;
}

interface FeatureFlagsRow {
  id: string;
  default_model_version: string;
  rollback_enabled: boolean;
  rollback_model_version: string;
  ab_test_enabled: boolean;
  ab_test_control_version: string | null;
  ab_test_treatment_version: string | null;
  ab_test_treatment_percentage: number | null;
  ab_test_started_at: string | null;
  ab_test_end_at: string | null;
  tenant_overrides: Record<string, string> | null;
  rollback_active: boolean;
  updated_at: string;
}

// ==================== SQL Queries ====================

const MODEL_VERSION_QUERIES = {
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

/** Default feature flags ID (singleton). */
const DEFAULT_FLAGS_ID = "default";

// ==================== Mappers ====================

/**
 * Maps database row to ModelVersion.
 */
const mapRowToModelVersion = (row: ModelVersionRow): ModelVersion => {
  const metadata: ModelMetadata | undefined =
    row.training_dataset_id || row.training_examples_count || row.parent_model_id || row.accuracy
      ? {
          trainingDatasetId: row.training_dataset_id ?? undefined,
          trainingExamplesCount: row.training_examples_count ?? undefined,
          parentModelId: row.parent_model_id ?? undefined,
          evaluationMetrics:
            row.accuracy || row.helpful_rate || row.recall_at_5 || row.mrr || row.human_review_score
              ? {
                  accuracy: row.accuracy ?? undefined,
                  helpfulRate: row.helpful_rate ?? undefined,
                  recallAt5: row.recall_at_5 ?? undefined,
                  mrr: row.mrr ?? undefined,
                  humanReviewScore: row.human_review_score ?? undefined,
                }
              : undefined,
        }
      : undefined;

  return {
    id: row.id,
    name: row.name,
    modelId: row.model_id,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    isBaseline: row.is_baseline,
    metadata,
  };
};

/**
 * Maps database row to ModelFeatureFlags.
 */
const mapRowToFeatureFlags = (
  row: FeatureFlagsRow
): ModelFeatureFlags & { rollbackActive: boolean } => {
  const abTestConfig: ABTestConfig | undefined =
    row.ab_test_enabled &&
    row.ab_test_control_version &&
    row.ab_test_treatment_version &&
    row.ab_test_treatment_percentage !== null
      ? {
          controlVersion: row.ab_test_control_version,
          treatmentVersion: row.ab_test_treatment_version,
          treatmentPercentage: row.ab_test_treatment_percentage,
          startedAt: row.ab_test_started_at ?? new Date().toISOString(),
          endAt: row.ab_test_end_at ?? undefined,
        }
      : undefined;

  return {
    defaultModelVersion: row.default_model_version,
    rollbackEnabled: row.rollback_enabled,
    rollbackModelVersion: row.rollback_model_version,
    abTestEnabled: row.ab_test_enabled,
    abTestConfig,
    tenantOverrides: row.tenant_overrides ?? undefined,
    rollbackActive: row.rollback_active,
  };
};

// ==================== Public API - Model Versions ====================

/**
 * Input for creating a model version.
 */
export interface CreateModelVersionInput {
  readonly name: string;
  readonly modelId: string;
  readonly description?: string;
  readonly isBaseline?: boolean;
  readonly metadata?: ModelMetadata;
}

/**
 * Creates a new model version in the database.
 *
 * @param input - Model version data
 * @returns The created model version
 */
export const createModelVersion = async (input: CreateModelVersionInput): Promise<ModelVersion> => {
  const id = generateEventId();
  const createdAt = new Date().toISOString();
  const metrics = input.metadata?.evaluationMetrics;

  const result = await query<ModelVersionRow>(MODEL_VERSION_QUERIES.INSERT_MODEL_VERSION, [
    id,
    input.name,
    input.modelId,
    input.description ?? null,
    createdAt,
    input.isBaseline ?? false,
    input.metadata?.trainingDatasetId ?? null,
    input.metadata?.trainingExamplesCount ?? null,
    input.metadata?.parentModelId ?? null,
    metrics?.accuracy ?? null,
    metrics?.helpfulRate ?? null,
    metrics?.recallAt5 ?? null,
    metrics?.mrr ?? null,
    metrics?.humanReviewScore ?? null,
  ]);

  logger.info("Created model version", {
    id,
    name: input.name,
    modelId: input.modelId,
  });

  return mapRowToModelVersion(result.rows[0]);
};

/**
 * Gets a model version by ID.
 *
 * @param versionId - Model version ID
 * @returns Model version or null if not found
 */
export const getModelVersionById = async (versionId: string): Promise<ModelVersion | null> => {
  const result = await query<ModelVersionRow>(MODEL_VERSION_QUERIES.GET_MODEL_VERSION, [versionId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToModelVersion(result.rows[0]);
};

/**
 * Gets all model versions.
 *
 * @returns Array of model versions
 */
export const getAllModelVersionsFromDB = async (): Promise<readonly ModelVersion[]> => {
  const result = await query<ModelVersionRow>(MODEL_VERSION_QUERIES.GET_ALL_MODEL_VERSIONS, []);

  return Object.freeze(result.rows.map(mapRowToModelVersion));
};

/**
 * Gets the baseline model version.
 *
 * @returns Baseline model version or null if not found
 */
export const getBaselineModelFromDB = async (): Promise<ModelVersion | null> => {
  const result = await query<ModelVersionRow>(MODEL_VERSION_QUERIES.GET_BASELINE_VERSION, []);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToModelVersion(result.rows[0]);
};

/**
 * Deletes a model version (cannot delete baseline).
 *
 * @param versionId - Model version ID to delete
 * @returns True if deleted, false if not found or is baseline
 */
export const deleteModelVersion = async (versionId: string): Promise<boolean> => {
  const result = await query(MODEL_VERSION_QUERIES.DELETE_MODEL_VERSION, [versionId]);

  if (result.rowCount === 0) {
    logger.warn("Model version not deleted (not found or is baseline)", { versionId });
    return false;
  }

  logger.info("Deleted model version", { versionId });
  return true;
};

// ==================== Public API - Feature Flags ====================

/**
 * Input for saving feature flags.
 */
export interface SaveFeatureFlagsInput {
  readonly flags: ModelFeatureFlags;
  readonly rollbackActive: boolean;
}

/**
 * Saves feature flags to the database.
 *
 * @param input - Feature flags data
 * @returns The saved feature flags
 */
export const saveFeatureFlags = async (
  input: SaveFeatureFlagsInput
): Promise<ModelFeatureFlags & { rollbackActive: boolean }> => {
  const { flags, rollbackActive } = input;

  const result = await query<FeatureFlagsRow>(MODEL_VERSION_QUERIES.UPSERT_FEATURE_FLAGS, [
    DEFAULT_FLAGS_ID,
    flags.defaultModelVersion,
    flags.rollbackEnabled,
    flags.rollbackModelVersion,
    flags.abTestEnabled,
    flags.abTestConfig?.controlVersion ?? null,
    flags.abTestConfig?.treatmentVersion ?? null,
    flags.abTestConfig?.treatmentPercentage ?? null,
    flags.abTestConfig?.startedAt ?? null,
    flags.abTestConfig?.endAt ?? null,
    flags.tenantOverrides ?? null,
    rollbackActive,
  ]);

  logger.info("Saved feature flags", {
    defaultVersion: flags.defaultModelVersion,
    rollbackEnabled: flags.rollbackEnabled,
    abTestEnabled: flags.abTestEnabled,
    rollbackActive,
  });

  return mapRowToFeatureFlags(result.rows[0]);
};

/**
 * Gets feature flags from the database.
 *
 * @returns Feature flags or null if not found
 */
export const getFeatureFlagsFromDB = async (): Promise<
  (ModelFeatureFlags & { rollbackActive: boolean }) | null
> => {
  const result = await query<FeatureFlagsRow>(MODEL_VERSION_QUERIES.GET_FEATURE_FLAGS, [
    DEFAULT_FLAGS_ID,
  ]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToFeatureFlags(result.rows[0]);
};

/**
 * Sets the rollback active state.
 *
 * @param active - Whether rollback is active
 * @returns True if updated
 */
export const setRollbackActive = async (active: boolean): Promise<boolean> => {
  await query(MODEL_VERSION_QUERIES.SET_ROLLBACK_ACTIVE, [active, DEFAULT_FLAGS_ID]);

  logger.info("Set rollback active state", { active });
  return true;
};

/**
 * Updates tenant overrides in the database.
 *
 * @param overrides - Tenant ID to model version ID mapping
 * @returns True if updated
 */
export const updateTenantOverrides = async (
  overrides: Record<string, string>
): Promise<boolean> => {
  await query(MODEL_VERSION_QUERIES.UPDATE_TENANT_OVERRIDES, [overrides, DEFAULT_FLAGS_ID]);

  logger.info("Updated tenant overrides", { count: Object.keys(overrides).length });
  return true;
};
