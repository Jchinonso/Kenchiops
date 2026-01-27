/**
 * Evidence validation module for confidence scoring.
 * Validates that LLM analysis aligns with provided evidence and assesses completeness.
 *
 * @module safety/validation/evidenceValidation
 */

import type { LLMAnalysisResult, Evidence } from "../../core/types.js";
import {
  ALIGNMENT_ADJUSTMENTS,
  SIMILARITY_THRESHOLDS,
  MATCHING_CONFIG,
  METRIC_KEYWORDS,
  INVALID_CAUSE_KEYWORDS,
  COMPLETENESS_ADJUSTMENTS,
  MIN_LENGTHS,
  MIN_ACTIONS_FOR_BONUS,
} from "../../constants/index.js";
import { INPUT_VALIDATION_LIMITS } from "../../constants/validation.js";
import type { AlignmentCheck, CompletenessCheck } from "../types.js";
import { containsKeyword } from "../helpers.js";

/**
 * Pattern to detect numbers with optional units.
 */
const NUMBER_WITH_UNIT_PATTERN = /\b\d+(?:\.\d+)?(?:ms|s|%|x|mb|gb|kb)?\b/i;

/**
 * Checks if reasoning contains metric keywords AND numeric values.
 */
const hasMetricsReference = (reasoning: string): boolean =>
  containsKeyword(reasoning, METRIC_KEYWORDS) && NUMBER_WITH_UNIT_PATTERN.test(reasoning);

/**
 * Checks if evidence provides surfaces for alignment evaluation.
 * Used to avoid penalizing when alignment cannot be measured.
 */
const hasAlignmentSurfaces = (evidence: Evidence): boolean =>
  Boolean(
    evidence.logs?.length ||
    evidence.gitHistory?.length ||
    evidence.metrics?.summary ||
    evidence.relatedDocs?.length
  );

/**
 * Alignment checks configuration - data-driven approach.
 */
const ALIGNMENT_CHECKS: readonly AlignmentCheck[] = [
  {
    // Check 1: Does identified cause contain text from error logs?
    // Guards against short log messages causing false positives
    condition: (analysis, evidence) => {
      if (!analysis.identifiedCause || !evidence.logs?.length) {
        return false;
      }
      const cause = analysis.identifiedCause.toLowerCase();
      return evidence.logs.some((log) => {
        // Skip short log messages to avoid false positives
        if (log.message.length < MATCHING_CONFIG.MIN_LOG_MESSAGE_LENGTH) {
          return false;
        }
        const prefix = log.message.toLowerCase().substring(0, MATCHING_CONFIG.LOG_PREFIX_LENGTH);
        return cause.includes(prefix);
      });
    },
    adjustment: ALIGNMENT_ADJUSTMENTS.LOG_REFERENCE,
  },
  {
    // Check 2: Does analysis reference specific commits?
    condition: (analysis, evidence) => {
      if (!analysis.reasoning || !evidence.gitHistory?.length) {
        return false;
      }
      const reasoning = analysis.reasoning.toLowerCase();
      return evidence.gitHistory.some((commit) =>
        reasoning.includes(commit.sha.substring(0, MATCHING_CONFIG.COMMIT_PREFIX_LENGTH))
      );
    },
    adjustment: ALIGNMENT_ADJUSTMENTS.COMMIT_REFERENCE,
  },
  {
    // Check 3: Is there a high-similarity past incident?
    condition: (_analysis, evidence) =>
      evidence.relatedDocs?.some(
        (doc) => doc.type === "past_incident" && doc.similarity > SIMILARITY_THRESHOLDS.STRONG
      ) ?? false,
    adjustment: ALIGNMENT_ADJUSTMENTS.HIGH_SIMILARITY_INCIDENT,
  },
  {
    // Check 4: Does analysis mention metrics?
    condition: (analysis, evidence) =>
      !!(
        analysis.reasoning &&
        evidence.metrics?.summary &&
        hasMetricsReference(analysis.reasoning)
      ),
    adjustment: ALIGNMENT_ADJUSTMENTS.METRICS_REFERENCE,
  },
];

/**
 * Calculates evidence alignment adjustment between analysis and provided evidence.
 * Uses data-driven configuration with functional reduce pattern.
 *
 * @param analysis - LLM analysis result
 * @param evidence - Evidence provided to LLM
 * @returns Alignment adjustment (-0.15 to 0.2)
 */
export const calculateEvidenceAlignment = (
  analysis: LLMAnalysisResult,
  evidence: Evidence
): number => {
  // Limit evidence arrays to prevent DoS from very large inputs
  const limitedEvidence: Evidence = {
    ...evidence,
    logs: evidence.logs?.slice(0, INPUT_VALIDATION_LIMITS.MAX_LOGS_TO_CHECK),
    gitHistory: evidence.gitHistory?.slice(0, INPUT_VALIDATION_LIMITS.MAX_COMMITS_TO_CHECK),
    relatedDocs: evidence.relatedDocs?.slice(0, INPUT_VALIDATION_LIMITS.MAX_RELATED_DOCS_TO_CHECK),
  };

  // Sum adjustments for all passing checks
  const adjustment = ALIGNMENT_CHECKS.reduce(
    (sum, check) => (check.condition(analysis, limitedEvidence) ? sum + check.adjustment : sum),
    0
  );

  // Only apply penalty if:
  // 1. No alignment checks passed
  // 2. Cause was identified (so we expected alignment)
  // 3. Evidence has surfaces to measure against (penalty is meaningful)
  const shouldPenalize =
    adjustment === 0 && analysis.identifiedCause && hasAlignmentSurfaces(evidence);

  const finalAdjustment = shouldPenalize ? ALIGNMENT_ADJUSTMENTS.NO_ALIGNMENT_PENALTY : adjustment;

  // Clamp to valid range (both min and max)
  return Math.max(ALIGNMENT_ADJUSTMENTS.MIN, Math.min(finalAdjustment, ALIGNMENT_ADJUSTMENTS.MAX));
};

/**
 * Checks if cause is valid (not "unknown" or too short).
 * Trims whitespace before length check to prevent gaming.
 */
const isValidCause = (cause?: string): boolean => {
  if (!cause) {
    return false;
  }

  const normalized = cause.trim();
  if (normalized.length <= MIN_LENGTHS.CAUSE) {
    return false;
  }

  // Return false if invalid keyword is found
  return !containsKeyword(normalized, INVALID_CAUSE_KEYWORDS);
};

/**
 * Completeness checks configuration - data-driven approach.
 */
const COMPLETENESS_CHECKS: readonly CompletenessCheck[] = [
  {
    // Check if root cause identified (not just "unknown" or empty)
    condition: (analysis) => isValidCause(analysis.identifiedCause),
    adjustment: COMPLETENESS_ADJUSTMENTS.CAUSE_IDENTIFIED,
  },
  {
    // Check if reasoning is substantial
    condition: (analysis) =>
      !!(analysis.reasoning && analysis.reasoning.length > MIN_LENGTHS.REASONING),
    adjustment: COMPLETENESS_ADJUSTMENTS.SUBSTANTIAL_REASONING,
  },
  {
    // Check if multiple actions recommended
    condition: (analysis) =>
      !!(
        analysis.recommendedActions && analysis.recommendedActions.length >= MIN_ACTIONS_FOR_BONUS
      ),
    adjustment: COMPLETENESS_ADJUSTMENTS.MULTIPLE_ACTIONS,
  },
  {
    // Check if impact assessment provided
    condition: (analysis) => !!analysis.impactAssessment,
    adjustment: COMPLETENESS_ADJUSTMENTS.IMPACT_ASSESSMENT,
  },
  {
    // Check if uncertainties are explicitly listed (transparency bonus)
    condition: (analysis) => !!(analysis.uncertainties && analysis.uncertainties.length > 0),
    adjustment: COMPLETENESS_ADJUSTMENTS.UNCERTAINTIES_LISTED,
  },
  {
    // Penalty for minimal analysis
    condition: (analysis) => !analysis.identifiedCause && !analysis.reasoning,
    adjustment: COMPLETENESS_ADJUSTMENTS.MINIMAL_ANALYSIS_PENALTY,
  },
];

/**
 * Assesses completeness of the analysis.
 * Uses data-driven configuration with functional reduce pattern.
 *
 * @param analysis - LLM analysis result
 * @returns Completeness adjustment (-0.15 to 0.13)
 */
export const assessCompleteness = (analysis: LLMAnalysisResult): number => {
  const rawAdjustment = COMPLETENESS_CHECKS.reduce(
    (sum, check) => (check.condition(analysis) ? sum + check.adjustment : sum),
    0
  );

  // Clamp to valid range (both min and max)
  return Math.max(
    COMPLETENESS_ADJUSTMENTS.MIN,
    Math.min(rawAdjustment, COMPLETENESS_ADJUSTMENTS.MAX)
  );
};
