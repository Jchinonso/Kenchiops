/**
 * Analysis guardrails for evidence-grounded outputs.
 *
 * Applies conservative adjustments to LLM analysis when the cause or actions
 * are too generic or not backed by evidence snippets.
 */

import type { Evidence, LLMAnalysisResult, LLMRecommendedAction } from "../core/types.js";
import { extractEvidenceHighlights } from "./analysisGuardrailsEvidence.js";
import {
  buildEvidenceBasedCause,
  buildFallbackActions,
  buildReasoningFromCause,
  buildSummaryFromCause,
  downgradeConfidence,
  filterActionsByEvidence,
  isGenericCause,
  mergeUncertainties,
} from "./analysisGuardrailsActions.js";

/**
 * Deduplicates actions by description similarity, keeping originals first.
 * Limits to max 5 actions total.
 */
const deduplicateActions = (actions: LLMRecommendedAction[]): LLMRecommendedAction[] => {
  const seen = new Set<string>();
  return actions
    .filter((action) => {
      // Normalize description for comparison (first 50 chars, lowercase)
      const key = action.description.toLowerCase().slice(0, 50);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 5);
};

export const applyEvidenceGuardrails = (
  analysis: LLMAnalysisResult,
  evidence: Evidence
): LLMAnalysisResult => {
  if (!analysis.identifiedCause && !analysis.recommendedActions?.length) {
    return analysis;
  }

  const highlights = extractEvidenceHighlights(evidence);
  const evidenceText = highlights.evidenceText.toLowerCase();
  const cause = analysis.identifiedCause?.trim() ?? "";
  const shouldReplaceCause =
    Boolean(highlights.primaryErrorLine) && (cause.length === 0 || isGenericCause(cause));

  const updatedCause = shouldReplaceCause
    ? (buildEvidenceBasedCause(highlights) ?? analysis.identifiedCause)
    : analysis.identifiedCause;

  const filteredActions =
    analysis.recommendedActions && evidenceText.length > 0
      ? filterActionsByEvidence(analysis.recommendedActions, evidenceText, highlights)
      : (analysis.recommendedActions ?? []);

  // Determine if we need to augment actions with fallbacks
  const testFailureCount =
    highlights.testFailures.length + (highlights.secondaryTestFailures?.length ?? 0);
  const hasInsufficientActions =
    filteredActions.length < Math.min(3, Math.max(1, Math.ceil(testFailureCount / 3)));
  const shouldAugmentActions =
    hasInsufficientActions && highlights.primaryErrorLine && testFailureCount > 1;

  // Build final actions: replace if empty, augment if insufficient, or use filtered
  const fallbackActions = buildFallbackActions(highlights);
  const updatedActions =
    filteredActions.length === 0
      ? fallbackActions
      : shouldAugmentActions
        ? deduplicateActions([...filteredActions, ...fallbackActions])
        : filteredActions;

  const updatedCategory = highlights.detectedCategory ?? analysis.category;
  const updatedPhase = highlights.detectedPhase ?? analysis.phase;
  const updatedSummary = updatedCause ? buildSummaryFromCause(updatedCause) : analysis.summary;
  const updatedReasoning = updatedCause
    ? buildReasoningFromCause(updatedCause, updatedCategory, updatedPhase)
    : analysis.reasoning;
  const updatedNextSteps = updatedActions.map((action) => action.description);
  const updatedUncertainties = mergeUncertainties(
    analysis.uncertainties,
    highlights.secondaryFindings
  );
  const shouldLowerConfidence = shouldReplaceCause || (filteredActions?.length ?? 0) === 0;
  const confidenceAdjustment = shouldLowerConfidence
    ? downgradeConfidence(analysis.confidence)
    : analysis.confidence;

  return {
    ...analysis,
    identifiedCause: updatedCause,
    summary: updatedSummary,
    reasoning: updatedReasoning,
    recommendedActions: updatedActions,
    nextSteps: updatedNextSteps,
    confidence: confidenceAdjustment,
    category: updatedCategory,
    phase: updatedPhase,
    uncertainties: updatedUncertainties,
  };
};
