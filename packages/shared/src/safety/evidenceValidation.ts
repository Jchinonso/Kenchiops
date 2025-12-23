/**
 * Evidence validation module for confidence scoring.
 * Validates that LLM analysis aligns with provided evidence and assesses completeness.
 */

import type { LLMAnalysisResult, Evidence } from "../types.js";
import {
  ALIGNMENT_ADJUSTMENTS,
  SIMILARITY_THRESHOLDS,
  MATCHING_CONFIG,
  METRIC_KEYWORDS,
  INVALID_CAUSE_KEYWORDS,
  COMPLETENESS_ADJUSTMENTS,
  MIN_LENGTHS,
  MIN_ACTIONS_FOR_BONUS,
} from "../constants.js";

/**
 * Checks if reasoning contains metric keywords.
 * Uses Array.from() with .some() for Set iteration.
 */
const hasMetricsReference = (reasoning: string): boolean => {
  const normalized = reasoning.toLowerCase();
  return Array.from(METRIC_KEYWORDS).some((keyword) => normalized.includes(keyword));
};

/**
 * Alignment check configuration for data-driven validation.
 */
interface AlignmentCheck {
  readonly condition: (analysis: LLMAnalysisResult, evidence: Evidence) => boolean;
  readonly adjustment: number;
}

/**
 * Alignment checks configuration - data-driven approach.
 */
const ALIGNMENT_CHECKS: readonly AlignmentCheck[] = [
  {
    // Check 1: Does identified cause contain text from error logs?
    condition: (analysis, evidence) => {
      if (!analysis.identifiedCause || !evidence.logs?.length) return false;
      const cause = analysis.identifiedCause.toLowerCase();
      return evidence.logs.some((log) =>
        cause.includes(log.message.toLowerCase().substring(0, MATCHING_CONFIG.LOG_PREFIX_LENGTH))
      );
    },
    adjustment: ALIGNMENT_ADJUSTMENTS.LOG_REFERENCE,
  },
  {
    // Check 2: Does analysis reference specific commits?
    condition: (analysis, evidence) => {
      if (!analysis.reasoning || !evidence.gitHistory?.length) return false;
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
  // Sum adjustments for all passing checks
  const adjustment = ALIGNMENT_CHECKS.reduce(
    (sum, check) => (check.condition(analysis, evidence) ? sum + check.adjustment : sum),
    0
  );

  // If NO alignment checks passed but cause was identified, apply penalty
  const finalAdjustment =
    adjustment === 0 && analysis.identifiedCause
      ? ALIGNMENT_ADJUSTMENTS.NO_ALIGNMENT_PENALTY
      : adjustment;

  // Cap at maximum adjustment
  return Math.min(finalAdjustment, ALIGNMENT_ADJUSTMENTS.MAX);
};

/**
 * Checks if cause is valid (not "unknown" or too short).
 * Uses Array.from() with .some() for Set iteration.
 */
const isValidCause = (cause?: string): boolean => {
  if (!cause || cause.length <= MIN_LENGTHS.CAUSE) {
    return false;
  }

  const normalized = cause.toLowerCase();
  // Return false if any invalid keyword is found
  return !Array.from(INVALID_CAUSE_KEYWORDS).some((keyword) => normalized.includes(keyword));
};

/**
 * Completeness check configuration for data-driven validation.
 */
interface CompletenessCheck {
  readonly condition: (analysis: LLMAnalysisResult) => boolean;
  readonly adjustment: number;
}

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
export const assessCompleteness = (analysis: LLMAnalysisResult): number =>
  COMPLETENESS_CHECKS.reduce(
    (sum, check) => (check.condition(analysis) ? sum + check.adjustment : sum),
    0
  );
