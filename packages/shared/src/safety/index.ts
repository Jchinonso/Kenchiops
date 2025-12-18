/**
 * Safety and confidence scoring module.
 * Complete 6-factor confidence scoring algorithm based on CONFIDENCE_SCORING.md.
 *
 * IMPORTANT:
 * - The AI (LLM) is treated as an untrusted helper.
 * - Its outputs must always be validated by deterministic logic before taking any side-effecting action.
 * - Confidence scores are computed deterministically, NOT self-reported by the LLM.
 */

// Main exports
export { calculateConfidenceScore } from './confidenceScoring.js';
export { determineActionGating } from './actionGating.js';

// Re-exports for internal use (if needed by other safety modules)
export { detectUncertainty } from './uncertaintyDetection.js';
export { calculateEvidenceAlignment, assessCompleteness } from './evidenceValidation.js';
export { validateAgainstKnowledgeBase } from './knowledgeValidation.js';
export { checkConsistency } from './consistency.js';

// Backward compatibility functions
import type { LLMAnalysisResult, Evidence } from '../types.js';
import { calculateConfidenceScore } from './confidenceScoring.js';

/**
 * Default confidence threshold for action decisions.
 */
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Calculate confidence score for a result (backward compatible).
 * 
 * @param result - LLM analysis result or any object
 * @returns Confidence score between 0 and 1, or 0 if invalid
 */
export const confidenceScore = (result: unknown): number => {
  if (!result || typeof result !== 'object') {
    return 0;
  }
  // TODO: Implement proper validation and scoring
  return 0.5;
};

/**
 * Determine if we should act on a result based on confidence threshold (backward compatible).
 * 
 * @param result - LLM analysis result
 * @param threshold - Minimum confidence threshold (default: 0.7)
 * @returns True if confidence meets threshold
 */
export const shouldActOnResult = (
  result: LLMAnalysisResult,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD
): boolean => {
  // Use minimal evidence for backward compatibility
  const minimalEvidence: Evidence = {
    eventId: result.eventId,
    collectedAt: new Date().toISOString(),
  };
  
  const scoreResult = calculateConfidenceScore(result, minimalEvidence);
  return scoreResult.finalScore >= threshold;
};
