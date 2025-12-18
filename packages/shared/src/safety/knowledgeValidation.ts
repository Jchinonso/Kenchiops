/**
 * Knowledge base validation module for confidence scoring.
 * Validates analysis against past incidents in the knowledge base.
 */

import type { LLMAnalysisResult, Evidence } from '../types.js';

/**
 * Similarity thresholds for validation adjustments.
 */
const SIMILARITY_THRESHOLDS = {
  STRONG: 0.85,
  MODERATE: 0.7,
} as const;

/**
 * Knowledge base validation adjustments based on similarity and reference.
 */
const VALIDATION_ADJUSTMENTS = {
  STRONG: 0.1,
  MODERATE: 0.05,
  NONE: 0,
} as const;

/**
 * Finds the best matching incident by similarity.
 */
const findBestMatch = (
  relatedIncidents: Evidence['relatedDocs']
): { similarity: number; id: string } => {
  if (!relatedIncidents?.length) {
    return { similarity: 0, id: '' };
  }

  return relatedIncidents.reduce(
    (max, doc) => (doc.similarity > max.similarity ? doc : max),
    { similarity: 0, id: '' }
  );
};

/**
 * Checks if analysis references the incident.
 */
const referencesIncident = (
  analysis: LLMAnalysisResult,
  incidentId: string
): boolean => {
  if (!incidentId) {
    return false;
  }

  const normalizedId = incidentId.toLowerCase();
  const reasoning = analysis.reasoning?.toLowerCase() || '';

  return (
    reasoning.includes(normalizedId) ||
    analysis.relatedIncidents?.includes(incidentId) ||
    false
  );
};

/**
 * Validates analysis against past incidents in the knowledge base.
 * 
 * @param analysis - LLM analysis result
 * @param evidence - Evidence containing related documents
 * @returns Knowledge base validation adjustment (0 to 0.1)
 */
export const validateAgainstKnowledgeBase = (
  analysis: LLMAnalysisResult,
  evidence: Evidence
): number => {
  const relatedIncidents =
    evidence.relatedDocs?.filter((doc) => doc.type === 'past_incident') || [];

  if (relatedIncidents.length === 0) {
    return VALIDATION_ADJUSTMENTS.NONE; // No penalty for novel issues
  }

  // Find highest similarity incident
  const bestMatch = findBestMatch(relatedIncidents);

  // Check if LLM references this incident
  const hasReference = referencesIncident(analysis, bestMatch.id);

  if (
    bestMatch.similarity > SIMILARITY_THRESHOLDS.STRONG &&
    hasReference
  ) {
    return VALIDATION_ADJUSTMENTS.STRONG;
  }
  
  if (bestMatch.similarity > SIMILARITY_THRESHOLDS.MODERATE) {
    return VALIDATION_ADJUSTMENTS.MODERATE;
  }

  return VALIDATION_ADJUSTMENTS.NONE;
};

/**
 * Factor 5: Checks consistency between cause and recommended actions.
 */