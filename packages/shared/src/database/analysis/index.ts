/**
 * Analysis Module
 *
 * Database operations for storing and retrieving analyses.
 *
 * @module database/analysis
 */

// Types
export type {
  CreateAnalysisInput,
  AnalysisRecord,
  AnalysisRow,
  AnalysisCountRow,
  CreateAnalysisValidationRule,
} from "./types.js";

// Helpers (includes validation, mappers, and serialization)
export {
  ANALYSIS_ID_PREFIX,
  validateId,
  validateLimit,
  validateCreateInput,
  mapRowToAnalysis,
  extractFirstAnalysisRow,
  serializeOptionalJson,
  serializeRequiredJson,
} from "./helpers.js";

// Repository operations
export {
  createAnalysis,
  getAnalysisById,
  getAnalysisByEventId,
  getAnalysesByModelVersion,
  countAnalysesByModelVersion,
} from "./repository.js";
