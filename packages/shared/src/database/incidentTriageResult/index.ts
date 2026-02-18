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
} from "./types.js";

// Helpers
export { mapRowToTriageResult, validateTriageResultId } from "./helpers.js";

// Repository operations
export { createTriageResult, getTriageResultById, getTriageResultByAlertId } from "./repository.js";
