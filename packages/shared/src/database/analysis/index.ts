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
  AnalysisEventRow,
  AnalysisCountRow,
  CreateAnalysisValidationRule,
} from "./types.js";

// Helpers (includes validation and mappers)
export {
  ANALYSIS_ID_PREFIX,
  validateId,
  validateLimit,
  validateCreateInput,
  mapRowToAnalysis,
  extractFirstAnalysisRow,
} from "./helpers.js";

// Repository operations
export {
  createAnalysis,
  getAnalysisById,
  getAnalysisByEventId,
  getAnalysesByModelVersion,
  countAnalysesByModelVersion,
  getAnalysesByTenant,
  countAnalysesByTenant,
  getAnalysesByEventIds,
} from "./repository.js";
