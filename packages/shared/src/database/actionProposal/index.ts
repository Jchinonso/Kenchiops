/**
 * Action Proposal Module
 *
 * Database operations for action proposal status tracking.
 *
 * @module database/actionProposal
 */

// Types
export type {
  ActionProposalStatus,
  UpdateActionStatusInput,
  ActionProposalRecord,
  ActionApprovalStats,
  ActionProposalRow,
  ActionStatsRow,
} from "./types.js";

// Helpers (includes row mappers and validation)
export {
  // Row mappers
  mapRowToActionProposal,
  mapRowToApprovalStats,
  // Validation
  validateId,
  validateStatus,
  validateWindowMinutes,
  // Helpers
  calculateRate,
  serializeExecutionResult,
  extractFirstRow,
} from "./helpers.js";

// Repository operations
export {
  updateActionProposalStatus,
  getActionProposalById,
  getActionProposalsByAnalysis,
  getActionApprovalStats,
} from "./repository.js";
