/**
 * Model Versioning and Feature Flags
 *
 * Manages model versions with instant rollback capability.
 * Supports A/B testing and gradual rollouts for fine-tuned models.
 *
 * @module finetuning/modelVersioning
 */

import { createLogger } from "../core/logger.js";
import { OPENAI_DEFAULTS, MODEL_VERSIONING } from "../constants/index.js";

const logger = createLogger("model-versioning");

// ==================== Types ====================

/**
 * Model version configuration.
 */
export interface ModelVersion {
  readonly id: string;
  readonly name: string;
  readonly modelId: string;
  readonly description?: string;
  readonly createdAt: string;
  readonly isBaseline: boolean;
  readonly metadata?: ModelMetadata;
}

/**
 * Model metadata for tracking provenance.
 */
export interface ModelMetadata {
  readonly trainingDatasetId?: string;
  readonly trainingExamplesCount?: number;
  readonly evaluationMetrics?: EvaluationMetrics;
  readonly parentModelId?: string;
}

/**
 * Model evaluation metrics.
 */
export interface EvaluationMetrics {
  readonly accuracy?: number;
  readonly helpfulRate?: number;
  readonly recallAt5?: number;
  readonly mrr?: number;
  readonly humanReviewScore?: number;
}

/**
 * Feature flag configuration for model selection.
 */
export interface ModelFeatureFlags {
  readonly defaultModelVersion: string;
  readonly rollbackEnabled: boolean;
  readonly rollbackModelVersion: string;
  readonly abTestEnabled: boolean;
  readonly abTestConfig?: ABTestConfig;
  readonly tenantOverrides?: Record<string, string>;
}

/**
 * A/B test configuration.
 */
export interface ABTestConfig {
  readonly controlVersion: string;
  readonly treatmentVersion: string;
  readonly treatmentPercentage: number;
  readonly startedAt: string;
  readonly endAt?: string;
}

/**
 * Model selection result.
 */
export interface ModelSelectionResult {
  readonly modelId: string;
  readonly versionId: string;
  readonly reason: ModelSelectionReason;
  readonly isABTest: boolean;
  readonly abTestGroup?: "control" | "treatment";
}

/**
 * Reason for model selection.
 */
export type ModelSelectionReason =
  | "default"
  | "tenant_override"
  | "ab_test_control"
  | "ab_test_treatment"
  | "rollback";

// ==================== Default Configuration ====================

const BASE_MODEL_VERSION: ModelVersion = {
  id: MODEL_VERSIONING.BASELINE_VERSION_ID,
  name: MODEL_VERSIONING.BASELINE_VERSION_NAME,
  modelId: OPENAI_DEFAULTS.MODEL,
  description: MODEL_VERSIONING.BASELINE_DESCRIPTION,
  createdAt: MODEL_VERSIONING.BASELINE_CREATED_AT,
  isBaseline: true,
};

const DEFAULT_FLAGS: ModelFeatureFlags = {
  defaultModelVersion: BASE_MODEL_VERSION.id,
  rollbackEnabled: true,
  rollbackModelVersion: BASE_MODEL_VERSION.id,
  abTestEnabled: false,
  tenantOverrides: {},
};

// ==================== In-Memory State ====================

// Model version registry (in production, this would be persisted)
const modelVersions: Map<string, ModelVersion> = new Map([
  [BASE_MODEL_VERSION.id, BASE_MODEL_VERSION],
]);

// Current feature flags (in production, this would be configurable)
let currentFlags: ModelFeatureFlags = { ...DEFAULT_FLAGS };

// Rollback state
let isInRollback = false;

// ==================== Model Registry ====================

/**
 * Registers a new model version.
 *
 * @param version - Model version to register
 */
export const registerModelVersion = (version: ModelVersion): void => {
  modelVersions.set(version.id, version);
  logger.info("Registered model version", {
    id: version.id,
    name: version.name,
    modelId: version.modelId,
  });
};

/**
 * Gets a model version by ID.
 *
 * @param versionId - Model version ID
 * @returns Model version or null if not found
 */
export const getModelVersion = (versionId: string): ModelVersion | null =>
  modelVersions.get(versionId) ?? null;

/**
 * Gets all registered model versions.
 *
 * @returns Array of model versions
 */
export const getAllModelVersions = (): readonly ModelVersion[] =>
  Object.freeze([...modelVersions.values()]);

/**
 * Gets the baseline model version.
 *
 * @returns Baseline model version
 */
export const getBaselineModel = (): ModelVersion => BASE_MODEL_VERSION;

// ==================== Feature Flags ====================

/**
 * Updates feature flags configuration.
 *
 * @param flags - Partial flags to update
 */
export const updateFeatureFlags = (flags: Partial<ModelFeatureFlags>): void => {
  currentFlags = { ...currentFlags, ...flags };
  logger.info("Updated model feature flags", {
    defaultVersion: currentFlags.defaultModelVersion,
    rollbackEnabled: currentFlags.rollbackEnabled,
    abTestEnabled: currentFlags.abTestEnabled,
  });
};

/**
 * Gets current feature flags.
 *
 * @returns Current feature flags
 */
export const getFeatureFlags = (): Readonly<ModelFeatureFlags> =>
  Object.freeze({ ...currentFlags });

/**
 * Sets a tenant-specific model override.
 *
 * @param tenantId - Tenant identifier
 * @param versionId - Model version ID to use for this tenant
 */
export const setTenantModelOverride = (tenantId: string, versionId: string): void => {
  const version = modelVersions.get(versionId);
  if (!version) {
    logger.warn("Attempted to set override for non-existent model version", {
      tenantId,
      versionId,
    });
    return;
  }

  currentFlags = {
    ...currentFlags,
    tenantOverrides: {
      ...currentFlags.tenantOverrides,
      [tenantId]: versionId,
    },
  };

  logger.info("Set tenant model override", { tenantId, versionId });
};

/**
 * Removes a tenant-specific model override.
 *
 * @param tenantId - Tenant identifier
 */
export const removeTenantModelOverride = (tenantId: string): void => {
  if (!currentFlags.tenantOverrides?.[tenantId]) {
    return;
  }

  const { [tenantId]: _removed, ...remaining } = currentFlags.tenantOverrides;
  currentFlags = {
    ...currentFlags,
    tenantOverrides: remaining,
  };

  logger.info("Removed tenant model override", { tenantId });
};

// ==================== Rollback ====================

/**
 * Triggers an instant rollback to the base model.
 *
 * @returns True if rollback was triggered, false if already in rollback
 */
export const triggerRollback = (): boolean => {
  if (isInRollback) {
    logger.warn("Rollback already active");
    return false;
  }

  if (!currentFlags.rollbackEnabled) {
    logger.error("Rollback is not enabled in feature flags");
    return false;
  }

  isInRollback = true;
  logger.info("Model rollback triggered", {
    rollbackTo: currentFlags.rollbackModelVersion,
    previousDefault: currentFlags.defaultModelVersion,
  });

  return true;
};

/**
 * Clears the rollback state.
 */
export const clearRollback = (): void => {
  if (!isInRollback) {
    return;
  }

  isInRollback = false;
  logger.info("Model rollback cleared");
};

/**
 * Checks if system is in rollback state.
 *
 * @returns True if in rollback state
 */
export const isRollbackActive = (): boolean => isInRollback;

// ==================== Model Selection ====================

/**
 * Deterministically assigns to A/B test group based on tenant ID.
 */
const getABTestGroup = (tenantId: string, treatmentPercentage: number): "control" | "treatment" => {
  const { HASH_MULTIPLIER, HASH_MODULO } = MODEL_VERSIONING;
  let hash = 0;
  tenantId.split("").forEach((char) => {
    hash = (hash * HASH_MULTIPLIER + char.charCodeAt(0)) % HASH_MODULO;
  });
  return hash < treatmentPercentage ? "treatment" : "control";
};

/**
 * Selects the appropriate model for a request.
 *
 * @param tenantId - Tenant identifier
 * @returns Model selection result
 */
export const selectModel = (tenantId: string): ModelSelectionResult => {
  // Check rollback first (highest priority)
  if (isInRollback && currentFlags.rollbackEnabled) {
    const version = modelVersions.get(currentFlags.rollbackModelVersion);
    return {
      modelId: version?.modelId ?? OPENAI_DEFAULTS.MODEL,
      versionId: currentFlags.rollbackModelVersion,
      reason: "rollback",
      isABTest: false,
    };
  }

  // Check tenant override
  if (currentFlags.tenantOverrides?.[tenantId]) {
    const versionId = currentFlags.tenantOverrides[tenantId];
    const version = modelVersions.get(versionId);
    if (version) {
      return {
        modelId: version.modelId,
        versionId,
        reason: "tenant_override",
        isABTest: false,
      };
    }
  }

  // Check A/B test
  if (currentFlags.abTestEnabled && currentFlags.abTestConfig) {
    const { controlVersion, treatmentVersion, treatmentPercentage } = currentFlags.abTestConfig;
    const group = getABTestGroup(tenantId, treatmentPercentage);
    const versionId = group === "treatment" ? treatmentVersion : controlVersion;
    const version = modelVersions.get(versionId);

    return {
      modelId: version?.modelId ?? OPENAI_DEFAULTS.MODEL,
      versionId,
      reason: group === "treatment" ? "ab_test_treatment" : "ab_test_control",
      isABTest: true,
      abTestGroup: group,
    };
  }

  // Default model
  const version = modelVersions.get(currentFlags.defaultModelVersion);
  return {
    modelId: version?.modelId ?? OPENAI_DEFAULTS.MODEL,
    versionId: currentFlags.defaultModelVersion,
    reason: "default",
    isABTest: false,
  };
};

/**
 * Logs model selection for analytics.
 *
 * @param result - Model selection result
 * @param tenantId - Tenant identifier
 */
export const logModelSelection = (result: ModelSelectionResult, tenantId: string): void => {
  logger.debug("Model selected", {
    tenantId,
    modelId: result.modelId,
    versionId: result.versionId,
    reason: result.reason,
    isABTest: result.isABTest,
    abTestGroup: result.abTestGroup,
  });
};
