/**
 * Risk Rules Module
 *
 * Database operations for custom risk rules and risk assessment audit trail.
 * Supports user-configurable risk scoring with context awareness.
 *
 * @module database/riskRules
 */

// Types
export type {
  // Environment
  RiskEnvironment,
  // Domain types
  CustomRiskRule,
  RiskAssessmentRecord,
  // Input types
  CreateCustomRiskRuleInput,
  UpdateCustomRiskRuleInput,
  CreateRiskAssessmentInput,
  // Query options
  RiskRulesQueryOptions,
  RiskAssessmentsQueryOptions,
  // Row types (for internal use)
  CustomRiskRuleRow,
  RiskAssessmentRow,
  // Validation types
  RiskRuleValidationRule,
  RiskAssessmentValidationRule,
  // Store interface
  RiskRulesStore,
} from "./types.js";

// Constants
export {
  VALID_ENVIRONMENTS,
  VALID_BLAST_RADIUS,
  VALID_REVERSIBILITY,
  VALID_DATA_IMPACT,
  VALID_RISK_LEVELS,
  RISK_RULE_DEFAULTS,
} from "./types.js";

// Validation functions
export {
  validateCreateRiskRuleInput,
  validateUpdateRiskRuleInput,
  validateRiskAssessmentInput,
  validateRiskRulesQueryOptions,
  validateAssessmentsQueryOptions,
} from "./validation.js";

// Mappers
export {
  mapRowToCustomRiskRule,
  mapRowToRiskAssessment,
  extractFirstRule,
  mapRowsToRules,
  mapRowsToAssessments,
} from "./mappers.js";

// Helpers
export {
  sanitizeForLogging,
  createRuleLogContext,
  matchesActionType,
  matchesEnvironment,
  filterRulesByContext,
  generateRuleId,
  generateAssessmentId,
} from "./helpers.js";

// Repository operations
export {
  // Rules
  createCustomRiskRule,
  getCustomRiskRules,
  getCustomRiskRuleById,
  updateCustomRiskRule,
  deleteCustomRiskRule,
  // Assessments
  recordRiskAssessment,
  queryRiskAssessments,
} from "./repository.js";
