/**
 * Confidence scoring module.
 * Calculates 6-factor confidence scores for LLM analysis results.
 *
 * @module safety/scoring/confidenceScoring
 */

// Main scoring function
export { calculateConfidenceScore } from "./scoring.js";

// Base score determination
export { getBaseScore } from "./baseScore.js";

// Factor processing
export { boundFactors, computeWeightedFactors, sumWeightedFactors } from "./factors.js";

// Reasoning formatting
export {
  computeImpactRange,
  formatWeightedContribution,
  formatWeightedAdjustmentReasoning,
} from "./reasoning.js";

// Helpers (selective exports for testing)
export {
  sanitizeForLog,
  safeNumber,
  clamp,
  isBlank,
  buildAnalysisText,
  isEmptyAnalysis,
  toFactorValues,
} from "./helpers.js";
