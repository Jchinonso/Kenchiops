/**
 * Safety and confidence scoring module.
 * Complete 6-factor confidence scoring algorithm based on CONFIDENCE_SCORING.md.
 *
 * IMPORTANT:
 * - The AI (LLM) is treated as an untrusted helper.
 * - Its outputs must always be validated by deterministic logic before taking any side-effecting action.
 * - Confidence scores are computed deterministically, NOT self-reported by the LLM.
 *
 * @module safety
 */

import type { LLMAnalysisResult, Evidence } from "../core/types.js";
import { calculateConfidenceScore } from "./scoring/confidenceScoring.js";
import { DEFAULT_CONFIDENCE_THRESHOLD, PLACEHOLDER_CONFIDENCE_SCORE } from "../constants/index.js";

// ==================== Type Exports ====================
// All types are centralized in types.ts
export type {
  // Gating types
  GatingDecision,
  ActionGatingResult,
  AlignmentCheck,
  CompletenessCheck,
  ThresholdEntry,
  LLMAnalysisLike,
  EvidenceLike,
  ConfidenceRange,
  // Risk scoring types
  BlastRadius,
  Reversibility,
  DataImpact,
  ActionRiskScore,
  RiskAssessmentRule,
  // Sanitization types
  OutputSanitizationResult,
  CommandValidationResult,
  // Hallucination detection types
  HallucinationCheckResult,
  HallucinationIndicator,
  HallucinationIndicatorType,
  // Prompt injection types
  InjectionDetectionResult,
  InjectionMatch,
  InjectionPatternType,
  InjectionRecommendation,
  // Restriction types
  RestrictionCheckResult,
  ActiveRestriction,
  RestrictionType,
  RestrictionRule,
  ScheduleConfig,
  RestrictionContext,
  // Audit types
  SafetyAuditEntry,
  SafetyRequestContext,
  SafetyEventType,
  AuditSeverity,
  AuditDecision,
  CreateAuditEntryInput,
  AuditQueryOptions,
  AuditStore,
} from "./types.js";

// ==================== Helper Exports ====================
export {
  clampConfidenceScore,
  formatAdjustment,
  formatScore,
  normalizeText,
  containsKeyword,
} from "./helpers.js";

// ==================== Scoring Module ====================
export { calculateConfidenceScore, getBaseScore } from "./scoring/confidenceScoring.js";
export { checkConsistency } from "./scoring/consistency.js";
export {
  assessActionRisk,
  isHighRiskAction,
  isIrreversibleAction,
  getRiskScoreConstants,
  type RiskScoreConstants,
} from "./scoring/riskScoring.js";

// ==================== Validation Module ====================
export { detectUncertainty } from "./validation/uncertaintyDetection.js";
export { calculateEvidenceAlignment, assessCompleteness } from "./validation/evidenceValidation.js";
export { validateAgainstKnowledgeBase } from "./validation/knowledgeValidation.js";
export {
  sanitizeLLMOutput,
  validateCommand,
  hasCodeInjection,
  sanitizeFilePath,
  redactSecrets,
} from "./validation/sanitization.js";
export {
  checkForHallucinations,
  isLikelyHallucinated,
  getHallucinationRiskLevel,
} from "./validation/hallucination.js";

// ==================== Gating Module ====================
export { determineActionGating, determineGatingDecision } from "./gating/actionGating.js";
export {
  detectPromptInjection,
  hasInjectionAttempt,
  shouldBlockInput,
  sanitizeInjectionAttempts,
  getInjectionSeverity,
} from "./gating/promptInjection.js";
export {
  checkRestrictions,
  isActionRestricted,
  activateRestriction,
  deactivateRestriction,
  getManualRestrictions,
  clearAllManualRestrictions,
  addRestrictionRule,
  removeRestrictionRule,
  getRestrictionRules,
  activateIncidentMode,
  activateDeploymentFreeze,
  isInIncidentMode,
} from "./gating/restrictions.js";

// ==================== Audit Module ====================
export {
  recordAuditEntry,
  recordActionProposal,
  recordInjectionDetection,
  recordHallucinationDetection,
  recordRestrictionApplied,
  recordRiskAssessment,
  queryAuditEntries,
  countAuditEntries,
  getRecentAuditEntries,
  getAuditEntriesForRequest,
  getBlockedActions,
  setAuditStore,
  getAuditStore,
  resetAuditStore,
  createInMemoryAuditStore,
} from "./audit/audit.js";

/**
 * Calculate confidence score for a result (backward compatible).
 *
 * @param result - LLM analysis result or any object
 * @returns Confidence score between 0 and 1, or 0 if invalid
 * @deprecated Use calculateConfidenceScore instead
 */
export const confidenceScore = (result: unknown): number => {
  if (!result || typeof result !== "object") {
    return 0;
  }
  return PLACEHOLDER_CONFIDENCE_SCORE;
};

/**
 * Determine if we should act on a result based on confidence threshold (backward compatible).
 *
 * @param result - LLM analysis result
 * @param threshold - Minimum confidence threshold (default: 0.7)
 * @returns True if confidence meets threshold
 * @deprecated Use calculateConfidenceScore and check finalScore directly
 */
export const shouldActOnResult = (
  result: LLMAnalysisResult,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD
): boolean => {
  const minimalEvidence: Evidence = {
    eventId: result.eventId,
    collectedAt: new Date().toISOString(),
  };

  const scoreResult = calculateConfidenceScore(result, minimalEvidence);
  return scoreResult.finalScore >= threshold;
};
