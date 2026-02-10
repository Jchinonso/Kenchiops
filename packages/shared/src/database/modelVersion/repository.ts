/**
 * Model Version Repository
 *
 * Database operations for model versions and feature flags.
 * Supports model versioning, A/B testing, and rollback.
 *
 * Security: All queries use parameterized statements to prevent SQL injection.
 * Input validation ensures only valid data types are accepted.
 *
 * @module database/modelVersion/repository
 */

import {
  query,
  createLogger,
  getErrorMessage,
  generateEventId,
  MODEL_VERSION_DEFAULTS,
  MODEL_VERSION_QUERIES,
  type ModelVersion,
} from "../common.js";
import type {
  ModelVersionRow,
  FeatureFlagsRow,
  CreateModelVersionInput,
  SaveFeatureFlagsInput,
  FeatureFlagsWithRollback,
} from "./types.js";
import {
  validateCreateModelVersionInput,
  validateId,
  validateSaveFeatureFlagsInput,
  mapRowToModelVersion,
  mapRowToFeatureFlags,
} from "./helpers.js";

const logger = createLogger("model-version-repository");

// ==================== Public API - Model Versions ====================

/**
 * Creates a new model version in the database.
 *
 * @param input - Model version data
 * @returns The created model version
 * @throws ValidationError if input is invalid
 * @throws Error if database operation fails
 */
export const createModelVersion = async (input: CreateModelVersionInput): Promise<ModelVersion> => {
  validateCreateModelVersionInput(input);

  const id = generateEventId();
  const createdAt = new Date().toISOString();
  const metrics = input.metadata?.evaluationMetrics;

  try {
    const result = await query<ModelVersionRow>(MODEL_VERSION_QUERIES.INSERT_MODEL_VERSION, [
      id,
      input.name,
      input.modelId,
      input.description ?? null,
      createdAt,
      input.isBaseline ?? MODEL_VERSION_DEFAULTS.DEFAULT_IS_BASELINE,
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
  } catch (error) {
    logger.error("Failed to create model version", {
      name: input.name,
      modelId: input.modelId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets a model version by ID.
 *
 * @param versionId - Model version ID
 * @returns Model version or null if not found
 * @throws ValidationError if versionId is empty
 * @throws Error if database operation fails
 */
export const getModelVersionById = async (versionId: string): Promise<ModelVersion | null> => {
  validateId(versionId, "versionId");

  try {
    const result = await query<ModelVersionRow>(MODEL_VERSION_QUERIES.GET_MODEL_VERSION, [
      versionId,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToModelVersion(result.rows[0]);
  } catch (error) {
    logger.error("Failed to get model version by ID", {
      versionId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets all model versions.
 *
 * @returns Array of model versions
 * @throws Error if database operation fails
 */
export const getAllModelVersionsFromDB = async (): Promise<readonly ModelVersion[]> => {
  try {
    const result = await query<ModelVersionRow>(MODEL_VERSION_QUERIES.GET_ALL_MODEL_VERSIONS, []);

    return Object.freeze(result.rows.map(mapRowToModelVersion));
  } catch (error) {
    logger.error("Failed to get all model versions", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets the baseline model version.
 *
 * @returns Baseline model version or null if not found
 * @throws Error if database operation fails
 */
export const getBaselineModelFromDB = async (): Promise<ModelVersion | null> => {
  try {
    const result = await query<ModelVersionRow>(MODEL_VERSION_QUERIES.GET_BASELINE_VERSION, []);

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToModelVersion(result.rows[0]);
  } catch (error) {
    logger.error("Failed to get baseline model version", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Deletes a model version (cannot delete baseline).
 *
 * @param versionId - Model version ID to delete
 * @returns True if deleted, false if not found or is baseline
 * @throws ValidationError if versionId is empty
 * @throws Error if database operation fails
 */
export const deleteModelVersion = async (versionId: string): Promise<boolean> => {
  validateId(versionId, "versionId");

  try {
    const result = await query(MODEL_VERSION_QUERIES.DELETE_MODEL_VERSION, [versionId]);

    if (result.rowCount === 0) {
      logger.warn("Model version not deleted (not found or is baseline)", { versionId });
      return false;
    }

    logger.info("Deleted model version", { versionId });
    return true;
  } catch (error) {
    logger.error("Failed to delete model version", {
      versionId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

// ==================== Public API - Feature Flags ====================

/**
 * Saves feature flags to the database.
 *
 * @param input - Feature flags data
 * @returns The saved feature flags
 * @throws ValidationError if input is invalid
 * @throws Error if database operation fails
 */
export const saveFeatureFlags = async (
  input: SaveFeatureFlagsInput
): Promise<FeatureFlagsWithRollback> => {
  validateSaveFeatureFlagsInput(input);

  const { flags, rollbackActive } = input;

  try {
    const result = await query<FeatureFlagsRow>(MODEL_VERSION_QUERIES.UPSERT_FEATURE_FLAGS, [
      MODEL_VERSION_DEFAULTS.DEFAULT_FLAGS_ID,
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
  } catch (error) {
    logger.error("Failed to save feature flags", {
      defaultVersion: flags.defaultModelVersion,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets feature flags from the database.
 *
 * @returns Feature flags or null if not found
 * @throws Error if database operation fails
 */
export const getFeatureFlagsFromDB = async (): Promise<FeatureFlagsWithRollback | null> => {
  try {
    const result = await query<FeatureFlagsRow>(MODEL_VERSION_QUERIES.GET_FEATURE_FLAGS, [
      MODEL_VERSION_DEFAULTS.DEFAULT_FLAGS_ID,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToFeatureFlags(result.rows[0]);
  } catch (error) {
    logger.error("Failed to get feature flags", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Sets the rollback active state.
 *
 * @param active - Whether rollback is active
 * @returns True if updated
 * @throws Error if database operation fails
 */
export const setRollbackActive = async (active: boolean): Promise<boolean> => {
  try {
    await query(MODEL_VERSION_QUERIES.SET_ROLLBACK_ACTIVE, [
      active,
      MODEL_VERSION_DEFAULTS.DEFAULT_FLAGS_ID,
    ]);

    logger.info("Set rollback active state", { active });
    return true;
  } catch (error) {
    logger.error("Failed to set rollback active state", {
      active,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates tenant overrides in the database.
 *
 * @param overrides - Tenant ID to model version ID mapping
 * @returns True if updated
 * @throws Error if database operation fails
 */
export const updateTenantOverrides = async (
  overrides: Record<string, string>
): Promise<boolean> => {
  try {
    await query(MODEL_VERSION_QUERIES.UPDATE_TENANT_OVERRIDES, [
      overrides,
      MODEL_VERSION_DEFAULTS.DEFAULT_FLAGS_ID,
    ]);

    logger.info("Updated tenant overrides", { count: Object.keys(overrides).length });
    return true;
  } catch (error) {
    logger.error("Failed to update tenant overrides", {
      count: Object.keys(overrides).length,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
