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
 * Uses direct Set iteration instead of Array.from() for efficiency.
 */
const hasMetricsReference = (reasoning: string): boolean => {
  const normalized = reasoning.toLowerCase();
  for (const keyword of METRIC_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return true;
    }
  }
  return false;
};

/**
 * Calculates evidence alignment adjustment between analysis and provided evidence.
 *
 * @param analysis - LLM analysis result
 * @param evidence - Evidence provided to LLM
 * @returns Alignment adjustment (-0.15 to 0.2)
 */
export const calculateEvidenceAlignment = (
  analysis: LLMAnalysisResult,
  evidence: Evidence
): number => {
  let adjustment = 0;

  // Check 1: Does identified cause contain text from error logs?
  if (analysis.identifiedCause && evidence.logs?.length) {
    const cause = analysis.identifiedCause.toLowerCase();
    const hasLogReference = evidence.logs.some((log) =>
      cause.includes(log.message.toLowerCase().substring(0, MATCHING_CONFIG.LOG_PREFIX_LENGTH))
    );
    if (hasLogReference) {
      adjustment += ALIGNMENT_ADJUSTMENTS.LOG_REFERENCE;
    }
  }

  // Check 2: Does analysis reference specific commits?
  if (analysis.reasoning && evidence.gitHistory?.length) {
    const reasoning = analysis.reasoning.toLowerCase();
    const hasCommitReference = evidence.gitHistory.some((commit) =>
      reasoning.includes(commit.sha.substring(0, MATCHING_CONFIG.COMMIT_PREFIX_LENGTH))
    );
    if (hasCommitReference) {
      adjustment += ALIGNMENT_ADJUSTMENTS.COMMIT_REFERENCE;
    }
  }

  // Check 3: Is there a high-similarity past incident?
  if (evidence.relatedDocs?.length) {
    const highSimilarityIncident = evidence.relatedDocs.some(
      (doc) => doc.type === "past_incident" && doc.similarity > SIMILARITY_THRESHOLDS.STRONG
    );
    if (highSimilarityIncident) {
      adjustment += ALIGNMENT_ADJUSTMENTS.HIGH_SIMILARITY_INCIDENT;
    }
  }

  // Check 4: Does analysis mention metrics?
  if (analysis.reasoning && evidence.metrics?.summary) {
    if (hasMetricsReference(analysis.reasoning)) {
      adjustment += ALIGNMENT_ADJUSTMENTS.METRICS_REFERENCE;
    }
  }

  // If NO alignment checks passed but cause was identified, apply penalty
  if (adjustment === 0 && analysis.identifiedCause) {
    adjustment = ALIGNMENT_ADJUSTMENTS.NO_ALIGNMENT_PENALTY;
  }

  // Cap at maximum adjustment
  return Math.min(adjustment, ALIGNMENT_ADJUSTMENTS.MAX);
};

/**
 * Checks if cause is valid (not "unknown" or too short).
 * Uses direct Set iteration instead of Array.from() for efficiency.
 */
const isValidCause = (cause?: string): boolean => {
  if (!cause || cause.length <= MIN_LENGTHS.CAUSE) {
    return false;
  }

  const normalized = cause.toLowerCase();
  for (const keyword of INVALID_CAUSE_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return false;
    }
  }
  return true;
};

/**
 * Assesses completeness of the analysis.
 *
 * @param analysis - LLM analysis result
 * @returns Completeness adjustment (-0.15 to 0.13)
 */
export const assessCompleteness = (analysis: LLMAnalysisResult): number => {
  let adjustment = 0;

  // Check if root cause identified (not just "unknown" or empty)
  if (isValidCause(analysis.identifiedCause)) {
    adjustment += COMPLETENESS_ADJUSTMENTS.CAUSE_IDENTIFIED;
  }

  // Check if reasoning is substantial
  if (analysis.reasoning && analysis.reasoning.length > MIN_LENGTHS.REASONING) {
    adjustment += COMPLETENESS_ADJUSTMENTS.SUBSTANTIAL_REASONING;
  }

  // Check if multiple actions recommended
  if (analysis.recommendedActions && analysis.recommendedActions.length >= MIN_ACTIONS_FOR_BONUS) {
    adjustment += COMPLETENESS_ADJUSTMENTS.MULTIPLE_ACTIONS;
  }

  // Check if impact assessment provided
  if (analysis.impactAssessment) {
    adjustment += COMPLETENESS_ADJUSTMENTS.IMPACT_ASSESSMENT;
  }

  // Check if uncertainties are explicitly listed (transparency bonus)
  if (analysis.uncertainties && analysis.uncertainties.length > 0) {
    adjustment += COMPLETENESS_ADJUSTMENTS.UNCERTAINTIES_LISTED;
  }

  // Penalty for minimal analysis
  if (!analysis.identifiedCause && !analysis.reasoning) {
    adjustment += COMPLETENESS_ADJUSTMENTS.MINIMAL_ANALYSIS_PENALTY;
  }

  return adjustment;
};
