/**
 * Action Risk Scoring Module
 *
 * Provides granular risk assessment for proposed actions beyond simple safety levels.
 * Considers blast radius, reversibility, and data impact.
 * Supports context-aware scoring with environment, incident mode, and custom rules.
 *
 * @module safety/scoring/riskScoring
 */

// Type exports
export type {
  ActionRiskAssessment,
  RiskScoreConstants,
  CategorizedRule,
  RuleMatchResult,
  // Context types
  RiskAssessmentContext,
  ResolvedRiskContext,
  ContextualActionRiskAssessment,
  ApprovalRequirements,
} from "./types.js";

// Main assessment function (basic - no context)
export { assessActionRisk } from "./scoring.js";

// Contextual assessment function
export { assessActionRiskWithContext, isActionBlocked } from "./contextualScoring.js";

// Context helpers
export {
  isCurrentlyOffHours,
  isInIncidentMode,
  setIncidentMode,
  resolveContext,
} from "./contextualScoring.js";

// Helper functions (accept ActionRiskAssessment)
export { isHighRisk, requiresManualRollback } from "./scoring.js";

// Helper functions (accept ActionProposal)
export {
  isHighRiskAction,
  actionRequiresManualRollback,
  isIrreversibleAction, // deprecated alias
} from "./scoring.js";

// Constants export
export { getRiskScoreConstants } from "./scoring.js";

// Rule matching (for testing)
export { findRiskRule } from "./rules.js";

// Store management
export {
  getRiskRulesStore,
  setRiskRulesStore,
  resetRiskRulesStore,
  createInMemoryRiskRulesStore,
  InMemoryRiskRulesStore,
} from "./store.js";

// Re-export store types
export type {
  RiskRulesStore,
  CustomRiskRule,
  RiskAssessmentRecord,
  CreateCustomRiskRuleInput,
  UpdateCustomRiskRuleInput,
  CreateRiskAssessmentInput,
  RiskRulesQueryOptions,
  RiskAssessmentsQueryOptions,
  RiskEnvironment,
} from "./store.js";
