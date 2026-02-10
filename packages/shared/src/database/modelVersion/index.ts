/**
 * Model Version Module
 *
 * Database operations for model versions and feature flags.
 *
 * @module database/modelVersion
 */

// Types
export type {
  ModelVersionRow,
  FeatureFlagsRow,
  CreateModelVersionInput,
  SaveFeatureFlagsInput,
  FeatureFlagsWithRollback,
} from "./types.js";

// Helpers (includes row mappers and validation)
export {
  // Row mappers
  mapRowToModelVersion,
  mapRowToFeatureFlags,
  // Validation
  validateCreateModelVersionInput,
  validateId,
  validateSaveFeatureFlagsInput,
} from "./helpers.js";

// Repository operations
export {
  createModelVersion,
  getModelVersionById,
  getAllModelVersionsFromDB,
  getBaselineModelFromDB,
  deleteModelVersion,
  saveFeatureFlags,
  getFeatureFlagsFromDB,
  setRollbackActive,
  updateTenantOverrides,
} from "./repository.js";
