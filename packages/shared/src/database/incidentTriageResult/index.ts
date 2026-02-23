/**
 * Incident Triage Result Module
 *
 * Database operations for storing and querying incident triage results.
 *
 * @module database/incidentTriageResult
 */

// Types
export type {
  IncidentTriageResultRow,
  IncidentTriageResultRecord,
  CreateTriageResultInput,
  UpdateTriageEnrichmentInput,
  UpdateTriageAiSummaryInput,
  UpdateTriageDispatchInput,
  TriageSimilarityResult,
  SeverityDistributionEntry,
  SeverityBySourceEntry,
  TriageStats,
} from "./types.js";

// Helpers
export {
  mapRowToTriageResult,
  mapRowToSimilarityResult,
  validateTriageResultId,
} from "./helpers.js";

// Repository operations
export {
  createTriageResult,
  getTriageResultById,
  getTriageResultByAlertId,
  updateTriageEnrichment,
  updateTriageAiSummary,
  updateTriageDispatchResults,
  searchSimilarTriageResults,
  getTriageStats,
  getSeverityDistributionBySource,
} from "./repository.js";
