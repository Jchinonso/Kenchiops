/**
 * Main confidence scoring calculation.
 * Orchestrates the 6-factor scoring algorithm.
 *
 * @module safety/scoring/confidenceScoring/scoring
 */

import type { LLMAnalysisResult, Evidence, ConfidenceScoreResult } from "../../../core/types.js";
import type { RawFactors } from "../../types.js";
import { detectUncertainty } from "../../validation/uncertaintyDetection.js";
import {
  calculateEvidenceAlignment,
  assessCompleteness,
} from "../../validation/evidenceValidation.js";
import { validateAgainstKnowledgeBase } from "../../validation/knowledgeValidation.js";
import { checkConsistency } from "../consistency/index.js";
import { determineGatingDecision } from "../../gating/actionGating.js";
import { clampConfidenceScore, formatScore } from "../../helpers.js";
import {
  SCORING_VERSION,
  EMPTY_ANALYSIS_MAX_SCORE,
  MAX_WEIGHTED_ADJUSTMENT,
} from "../../../constants/index.js";
import { createLogger } from "../../../core/logger.js";

// Import validation to ensure config is validated at module load
import "./validation.js";

// Import helpers
import {
  sanitizeForLog,
  safeNumber,
  buildAnalysisText,
  isEmptyAnalysis,
  toFactorValues,
} from "./helpers.js";

// Import base score
import { getBaseScore } from "./baseScore.js";

// Import factor processing
import { boundFactors, computeWeightedFactors, sumWeightedFactors } from "./factors.js";

// Import reasoning formatting
import { formatWeightedContribution, formatWeightedAdjustmentReasoning } from "./reasoning.js";

const logger = createLogger("confidence-scoring");

// ==================== Main Scoring Function ====================

/**
 * Calculates confidence score for an LLM analysis result using a 6-factor heuristic algorithm.
 *
 * Factors (with weights - these multiply the bounded factor value):
 * 1. Base Score - LLM's stated confidence level
 * 2. Uncertainty (weight: 0.15) - Hedging language penalties
 * 3. Evidence Alignment (weight: 0.30) - Does analysis match provided evidence?
 * 4. Completeness (weight: 0.15) - Is the analysis thorough?
 * 5. Knowledge Base Validation (weight: 0.25) - Does it match past incidents?
 * 6. Consistency (weight: 0.15) - Do actions address the identified cause?
 *
 * Safety features:
 * - NaN/Infinity from factor functions converted to 0 (fail-safe)
 * - Each factor is clamped to defined bounds (mis-implementation resistant)
 * - Weighted sum is clamped as additional guard rail
 * - Empty analysis caps score at 0.3 (not actionable)
 * - Unknown confidence values are logged (sanitized) for upstream bug detection
 * - Scoring version included for audit traceability
 * - Full breakdown with raw/bounded/weighted values for debugging
 *
 * @param analysis - LLM analysis result
 * @param evidence - Evidence that was provided to LLM
 * @returns Confidence score result with comprehensive breakdown
 */
export const calculateConfidenceScore = (
  analysis: LLMAnalysisResult,
  evidence: Evidence
): ConfidenceScoreResult => {
  // 1. Base score from LLM's stated confidence
  const baseScoreResult = getBaseScore(analysis.confidence);
  const baseScore = baseScoreResult.score;

  // 2. Collect raw factor outputs (may contain NaN/Infinity from buggy factors)
  const analysisText = buildAnalysisText(analysis);
  const raw: RawFactors = {
    uncertainty: detectUncertainty(analysisText),
    evidenceAlignment: calculateEvidenceAlignment(analysis, evidence),
    completeness: assessCompleteness(analysis),
    knowledgeBaseValidation: validateAgainstKnowledgeBase(analysis, evidence),
    consistency: checkConsistency(analysis),
  };

  // Log non-finite values (indicates bug in factor function)
  const invalidFactors = Object.entries(raw).filter(([, value]) => !Number.isFinite(value));
  if (invalidFactors.length > 0) {
    logger.warn("Non-finite factor value(s) encountered; using neutral fallback", {
      factors: invalidFactors.map(([name, value]) => ({ name, value: sanitizeForLog(value) })),
      eventId: sanitizeForLog(evidence.eventId),
      scoringVersion: SCORING_VERSION,
    });
  }

  // 3. Clamp factors to bounds (also handles NaN/Infinity)
  const bounded = boundFactors(raw);

  // 4. Compute weighted contributions
  const weighted = computeWeightedFactors(bounded);

  // 5. Sum and clamp weighted adjustment (guard rail)
  // Use safeNumber first so NaN detection works (NaN comparisons are always false)
  const rawWeightedSum = safeNumber(sumWeightedFactors(weighted), 0);
  const weightedAdjustment = Math.max(
    MAX_WEIGHTED_ADJUSTMENT.min,
    Math.min(MAX_WEIGHTED_ADJUSTMENT.max, rawWeightedSum)
  );

  // Log when clamping occurs (often indicates bounds/weights mis-tuning)
  if (
    rawWeightedSum < MAX_WEIGHTED_ADJUSTMENT.min ||
    rawWeightedSum > MAX_WEIGHTED_ADJUSTMENT.max
  ) {
    logger.debug("Weighted adjustment clamped", {
      rawWeightedSum,
      weightedAdjustment,
      boundsMin: MAX_WEIGHTED_ADJUSTMENT.min,
      boundsMax: MAX_WEIGHTED_ADJUSTMENT.max,
      scoringVersion: SCORING_VERSION,
    });
  }

  // 6. Compute scores at each stage
  const rawScore = baseScore + weightedAdjustment;
  const emptyAnalysisCapped = isEmptyAnalysis(analysis);
  const cappedScore = emptyAnalysisCapped ? Math.min(rawScore, EMPTY_ANALYSIS_MAX_SCORE) : rawScore;
  const finalScore = clampConfidenceScore(cappedScore);

  // 7. Generate reasoning showing weighted contributions
  const reasoning: string[] = [
    baseScoreResult.reasoning,
    formatWeightedContribution("uncertainty", bounded.uncertainty, weighted.uncertainty),
    formatWeightedContribution(
      "evidenceAlignment",
      bounded.evidenceAlignment,
      weighted.evidenceAlignment
    ),
    formatWeightedContribution("completeness", bounded.completeness, weighted.completeness),
    formatWeightedContribution(
      "knowledgeBaseValidation",
      bounded.knowledgeBaseValidation,
      weighted.knowledgeBaseValidation
    ),
    formatWeightedContribution("consistency", bounded.consistency, weighted.consistency),
    formatWeightedAdjustmentReasoning(rawWeightedSum, weightedAdjustment),
    `Raw score: ${rawScore.toFixed(3)} (base + weighted adjustment)`,
  ];

  if (emptyAnalysisCapped) {
    reasoning.push(
      `Empty analysis cap: capped at ${formatScore(EMPTY_ANALYSIS_MAX_SCORE)} (no summary, cause, or actions)`
    );
  }

  reasoning.push(`Final confidence score: ${formatScore(finalScore)} [${SCORING_VERSION}]`);

  // 8. Determine action gating decision
  const gatingDecision = determineGatingDecision(finalScore);

  // 9. Build comprehensive breakdown for debugging
  return {
    finalScore,
    breakdown: {
      baseScore,
      raw: toFactorValues(raw),
      bounded: toFactorValues(bounded),
      weighted: toFactorValues(weighted),
      totals: {
        weightedAdjustment,
        rawScore,
        cappedScore,
        finalScore,
      },
    },
    reasoning,
    gatingDecision,
    scoringVersion: SCORING_VERSION,
  };
};
