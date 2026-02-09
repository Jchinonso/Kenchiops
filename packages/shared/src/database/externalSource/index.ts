/**
 * External Source Module
 *
 * Database operations for external knowledge sources.
 *
 * @module database/externalSource
 */

// Types
export type {
  ExternalSourceRow,
  ExternalSource,
  CreateExternalSourceInput,
  UpdateExternalSourceInput,
  CreateInputValidationRule,
  ExternalSourceType,
  TechStackTag,
} from "./types.js";

// Helpers (includes row mappers and validation)
export {
  // Row mappers
  mapRowToExternalSource,
  // Validation
  validateNonEmptyString,
  validateMinimumNumber,
  validateCreateInput,
  // Constants
  DEFAULT_SYNC_LIMIT,
  MIN_QUERY_LIMIT,
  MIN_DOC_COUNT,
  MIN_ERROR_COUNT,
  DEFAULT_COUNT,
} from "./helpers.js";

// Repository operations
export {
  createExternalSource,
  getExternalSourceById,
  getExternalSourcesByTenant,
  getEnabledExternalSources,
  getExternalSourcesByType,
  getSourcesDueForSync,
  updateExternalSource,
  updateSyncStatus,
  deleteExternalSource,
  deleteExternalSourcesByTenant,
  getExternalSourceCount,
} from "./repository.js";
