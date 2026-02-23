/**
 * Investigation Module
 *
 * Database operations for storing and querying diagnostic investigations.
 *
 * @module database/investigations
 */

// Types
export type {
  InvestigationRow,
  InvestigationRecord,
  CreateInvestigationInput,
  UpdateInvestigationIntentInput,
  ListInvestigationFilters,
  PaginatedInvestigations,
} from "./types.js";

// Helpers (includes validation and mappers)
export {
  mapRowToInvestigation,
  validateCreateInvestigationInput,
  validateInvestigationId,
} from "./helpers.js";

// Repository operations
export {
  createInvestigation,
  getInvestigationById,
  listInvestigations,
  updateInvestigationStatus,
  updateInvestigationIntent,
  updateInvestigationEvidence,
  updateInvestigationCorrelation,
  updateInvestigationDiagnosis,
  updateInvestigationError,
} from "./repository.js";
