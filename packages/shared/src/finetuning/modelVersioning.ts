/**
 * Model Versioning and Feature Flags
 *
 * Manages model versions with instant rollback capability.
 * Supports A/B testing and gradual rollouts for fine-tuned models.
 *
 * @module finetuning/modelVersioning
 */

import { createLogger } from "../core/logger.js";
import { config } from "../core/config.js";
import { LLM_DEFAULTS, OPENROUTER_DEFAULTS, MODEL_VERSIONING } from "../constants/index.js";
import type {
  ModelVersion,
  ModelFeatureFlags,
  ModelSelectionResult,
  ModelSelectionContext,
  ModelSelectionHandler,
} from "./types.js";

const logger = createLogger("model-versioning");

// ==================== LLM Model Configuration ====================

/**
 * Gets the configured LLM model based on provider settings.
 * Uses LLM_MODEL, falls back to provider-specific defaults.
 */
const getConfiguredModel = (): string =>
  config.LLM_MODEL ||
  config.OPENAI_MODEL ||
  (config.LLM_PROVIDER === "openrouter" ? OPENROUTER_DEFAULTS.MODEL : LLM_DEFAULTS.MODEL);

// ==================== Default Configuration ====================

const BASE_MODEL_VERSION: ModelVersion = {
  id: MODEL_VERSIONING.BASELINE_VERSION_ID,
  name: MODEL_VERSIONING.BASELINE_VERSION_NAME,
  modelId: getConfiguredModel(),
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
 * Returns the default model selection result.
 * Defined before handlers as it's used as fallback in A/B test handler.
 */
const getDefaultModelResult = (context: ModelSelectionContext): ModelSelectionResult => {
  const version = context.getVersion(context.flags.defaultModelVersion);
  return {
    modelId: version?.modelId ?? getConfiguredModel(),
    versionId: context.flags.defaultModelVersion,
    reason: "default",
    isABTest: false,
  };
};

/** Ordered handlers for model selection (first match wins). */
const MODEL_SELECTION_HANDLERS: readonly ModelSelectionHandler[] = [
  {
    // Rollback (highest priority)
    condition: (context) => context.isInRollback && context.flags.rollbackEnabled,
    getResult: (context) => {
      const version = context.getVersion(context.flags.rollbackModelVersion);
      return {
        modelId: version?.modelId ?? getConfiguredModel(),
        versionId: context.flags.rollbackModelVersion,
        reason: "rollback",
        isABTest: false,
      };
    },
  },
  {
    // Tenant override
    condition: (context) => {
      const versionId = context.flags.tenantOverrides?.[context.tenantId];
      return versionId !== undefined && context.getVersion(versionId) !== undefined;
    },
    getResult: (context) => {
      const versionId = context.flags.tenantOverrides?.[context.tenantId] ?? "";
      const version = context.getVersion(versionId);
      return {
        modelId: version?.modelId ?? getConfiguredModel(),
        versionId,
        reason: "tenant_override",
        isABTest: false,
      };
    },
  },
  {
    // A/B test
    condition: (context) => context.flags.abTestEnabled && context.flags.abTestConfig !== undefined,
    getResult: (context) => {
      const { abTestConfig } = context.flags;
      if (!abTestConfig) {
        return getDefaultModelResult(context);
      }
      const { controlVersion, treatmentVersion, treatmentPercentage } = abTestConfig;
      const group = getABTestGroup(context.tenantId, treatmentPercentage);
      const versionId = group === "treatment" ? treatmentVersion : controlVersion;
      const version = context.getVersion(versionId);
      return {
        modelId: version?.modelId ?? getConfiguredModel(),
        versionId,
        reason: group === "treatment" ? "ab_test_treatment" : "ab_test_control",
        isABTest: true,
        abTestGroup: group,
      };
    },
  },
];

/**
 * Creates the model selection context for handlers.
 */
const createSelectionContext = (tenantId: string): ModelSelectionContext => ({
  tenantId,
  isInRollback,
  flags: currentFlags,
  getVersion: (versionId: string) => modelVersions.get(versionId),
});

/**
 * Selects the appropriate model for a request.
 *
 * @param tenantId - Tenant identifier
 * @returns Model selection result
 */
export const selectModel = (tenantId: string): ModelSelectionResult => {
  const context = createSelectionContext(tenantId);
  const matchedHandler = MODEL_SELECTION_HANDLERS.find((handler) => handler.condition(context));
  return matchedHandler?.getResult(context) ?? getDefaultModelResult(context);
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
