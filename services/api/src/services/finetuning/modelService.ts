/**
 * Model Version Service
 *
 * Manages model versions, activation, rollback, and A/B testing.
 *
 * @module services/finetuning/modelService
 */

import {
  createLogger,
  getErrorMessage,
  getAllModelVersions,
  getBaselineModel,
  selectModel,
  triggerRollback,
  updateFeatureFlags,
  getModelVersionById,
  getAllModelVersionsFromDB,
  saveFeatureFlags,
  getFeatureFlagsFromDB,
  setRollbackActive,
  SERVICE_NAMES,
  type ModelVersion,
  type ModelSelectionResult,
} from "@kenchi/shared";
import type { ABTestOptions } from "../../types/fineTuningTypes.js";

const logger = createLogger(SERVICE_NAMES.API);

// ==================== Public API ====================

/**
 * Gets all model versions.
 *
 * @returns Array of model versions
 */
export const getModelVersions = async (): Promise<readonly ModelVersion[]> => {
  try {
    // Try database first
    const dbVersions = await getAllModelVersionsFromDB();
    if (dbVersions.length > 0) {
      return dbVersions;
    }
    // Fall back to in-memory
    return getAllModelVersions();
  } catch (error) {
    logger.warn("Failed to get model versions from DB, using in-memory", {
      error: getErrorMessage(error),
    });
    return getAllModelVersions();
  }
};

/**
 * Gets the active model for a tenant.
 *
 * @param tenantId - Optional tenant ID (defaults to empty string for global selection)
 * @returns Model selection result
 */
export const getActiveModel = async (tenantId?: string): Promise<ModelSelectionResult> =>
  selectModel(tenantId ?? "");

/**
 * Activates a model version as the default.
 *
 * @param versionId - Version ID to activate
 * @returns True if activation succeeded
 */
export const activateModel = async (versionId: string): Promise<boolean> => {
  try {
    const version = await getModelVersionById(versionId);
    if (!version) {
      logger.error("Model version not found", { versionId });
      return false;
    }

    // Update feature flags to use this model
    const currentFlags = await getFeatureFlagsFromDB();
    const baselineModel = await getBaselineModel();

    await saveFeatureFlags({
      flags: {
        defaultModelVersion: versionId,
        rollbackEnabled: true,
        rollbackModelVersion: baselineModel?.id ?? "base_v1",
        abTestEnabled: currentFlags?.abTestEnabled ?? false,
        abTestConfig: currentFlags?.abTestConfig,
        tenantOverrides: currentFlags?.tenantOverrides,
      },
      rollbackActive: false,
    });

    // Also update in-memory flags
    updateFeatureFlags({
      defaultModelVersion: versionId,
      rollbackEnabled: true,
      rollbackModelVersion: baselineModel?.id ?? "base_v1",
    });

    logger.info("Model version activated", { versionId });
    return true;
  } catch (error) {
    logger.error("Failed to activate model", {
      versionId,
      error: getErrorMessage(error),
    });
    return false;
  }
};

/**
 * Rolls back to baseline model.
 *
 * @returns True if rollback succeeded
 */
export const rollbackToBaseline = async (): Promise<boolean> => {
  try {
    // Trigger in-memory rollback
    triggerRollback();

    // Persist to database
    await setRollbackActive(true);

    logger.info("Rolled back to baseline model");
    return true;
  } catch (error) {
    logger.error("Failed to rollback", {
      error: getErrorMessage(error),
    });
    return false;
  }
};

/**
 * Configures A/B test between model versions.
 *
 * @param options - A/B test configuration
 * @returns True if configuration succeeded
 */
export const configureABTest = async (options: ABTestOptions): Promise<boolean> => {
  try {
    const currentFlags = await getFeatureFlagsFromDB();
    const baselineModel = await getBaselineModel();

    await saveFeatureFlags({
      flags: {
        defaultModelVersion: currentFlags?.defaultModelVersion ?? "base_v1",
        rollbackEnabled: true,
        rollbackModelVersion: baselineModel?.id ?? "base_v1",
        abTestEnabled: true,
        abTestConfig: {
          controlVersion: options.controlVersion,
          treatmentVersion: options.treatmentVersion,
          treatmentPercentage: options.treatmentPercentage,
          startedAt: new Date().toISOString(),
        },
        tenantOverrides: currentFlags?.tenantOverrides,
      },
      rollbackActive: false,
    });

    // Also update in-memory flags
    updateFeatureFlags({
      abTestEnabled: true,
      abTestConfig: {
        controlVersion: options.controlVersion,
        treatmentVersion: options.treatmentVersion,
        treatmentPercentage: options.treatmentPercentage,
        startedAt: new Date().toISOString(),
      },
    });

    logger.info("A/B test configured", { ...options });
    return true;
  } catch (error) {
    logger.error("Failed to configure A/B test", {
      error: getErrorMessage(error),
    });
    return false;
  }
};
