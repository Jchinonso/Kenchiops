/**
 * Main confidence scoring module.
 * Calculates 6-factor confidence scores for LLM analysis results.
 */

import type {
  LLMAnalysisResult,
  Evidence,
  ConfidenceScoreResult,
} from '../types.js';
import { detectUncertainty } from './uncertaintyDetection.js';
import { calculateEvidenceAlignment, assessCompleteness } from './evidenceValidation.js';
import { validateAgainstKnowledgeBase } from './knowledgeValidation.js';
import { checkConsistency } from './consistency.js';
import { determineGatingDecision } from './actionGating.js';
import { clampConfidenceScore } from './confidenceUtils.js';
import { BASE_CONFIDENCE_SCORES } from '../constants.js';

/**
 * LLM confidence level to base score mapping.
 */
const CONFIDENCE_LEVEL_MAP: Readonly<Map<string, number>> = new Map([
  ['very_high', BASE_CONFIDENCE_SCORES.VERY_HIGH],
  ['high', BASE_CONFIDENCE_SCORES.HIGH],
  ['medium', BASE_CONFIDENCE_SCORES.MEDIUM],
  ['low', BASE_CONFIDENCE_SCORES.LOW],
  ['very_low', BASE_CONFIDENCE_SCORES.VERY_LOW],
]);

/**
 * Determines base score from LLM's stated confidence level.
 * 
 * @param llmConfidence - LLM's stated confidence level
 * @returns Base score (0-1)
 */
export const getBaseScore = (llmConfidence?: string): number => {
  if (!llmConfidence) {
    return BASE_CONFIDENCE_SCORES.DEFAULT;
  }
  
  return CONFIDENCE_LEVEL_MAP.get(llmConfidence) ?? BASE_CONFIDENCE_SCORES.DEFAULT;
};

/**
 * Formats adjustment value for reasoning output.
 */
const formatAdjustment = (value: number, label: string): string => {
  if (value === 0) return '';
  
  const sign = value > 0 ? '+' : '';
  return `${label}: ${sign}${value.toFixed(2)}`;
};

/**
 * Calculates confidence score for an LLM analysis result using a 6-factor heuristic algorithm.
 *
 * Factors:
 * 1. Base Score - LLM's stated confidence level
 * 2. Uncertainty Detection - Hedging language penalties
 * 3. Evidence Alignment - Does analysis match provided evidence?
 * 4. Completeness - Is the analysis thorough?
 * 5. Knowledge Base Validation - Does it match past incidents?
 * 6. Consistency - Do actions address the identified cause?
 *
 * @param analysis - LLM analysis result
 * @param evidence - Evidence that was provided to LLM
 * @returns Confidence score result with breakdown and reasoning
 */
export const calculateConfidenceScore = (
  analysis: LLMAnalysisResult,
  evidence: Evidence
): ConfidenceScoreResult => {
  // 1. Base score from LLM's stated confidence
  const baseScore = getBaseScore(analysis.confidence);

  // 2. Detect uncertainty in text
  const analysisText = [
    analysis.summary,
    analysis.reasoning,
    analysis.identifiedCause,
  ]
    .filter(Boolean)
    .join(' ');
  
  const uncertaintyAdjustment = detectUncertainty(analysisText);

  // 3. Check evidence alignment
  const evidenceAlignment = calculateEvidenceAlignment(analysis, evidence);

  // 4. Assess completeness
  const completeness = assessCompleteness(analysis);

  // 5. Validate against knowledge base
  const knowledgeBaseValidation = validateAgainstKnowledgeBase(
    analysis,
    evidence
  );

  // 6. Check consistency
  const consistency = checkConsistency(analysis);

  // 7. Compute final score
  const rawScore =
    baseScore +
    uncertaintyAdjustment +
    evidenceAlignment +
    completeness +
    knowledgeBaseValidation +
    consistency;

  // Clamp to [0, 1] with robust validation
  const finalScore = clampConfidenceScore(rawScore);

  // Generate reasoning
  const reasoning: string[] = [
    `Base score: ${baseScore.toFixed(2)} (from LLM confidence: ${analysis.confidence || 'medium'})`,
    formatAdjustment(uncertaintyAdjustment, 'Uncertainty adjustment'),
    formatAdjustment(evidenceAlignment, 'Evidence alignment'),
    formatAdjustment(completeness, 'Completeness'),
    formatAdjustment(knowledgeBaseValidation, 'Knowledge base validation'),
    formatAdjustment(consistency, 'Consistency'),
  ].filter(Boolean);

  reasoning.push(`Final confidence score: ${finalScore.toFixed(2)}`);

  // Determine action gating decision
  const gatingDecision = determineGatingDecision(finalScore);

  return {
    finalScore,
    breakdown: {
      baseScore,
      uncertaintyAdjustment,
      evidenceAlignment,
      completeness,
      knowledgeBaseValidation,
      consistency,
    },
    reasoning,
    gatingDecision,
  };
};