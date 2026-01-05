/**
 * Analysis guardrails for evidence-grounded outputs.
 *
 * Applies conservative adjustments to LLM analysis when the cause or actions
 * are too generic or not backed by evidence snippets.
 */

import type { Evidence, LLMAnalysisResult } from "../core/types.js";
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

  const updatedActions =
    (filteredActions?.length ?? 0) === 0 && highlights.primaryErrorLine
      ? buildFallbackActions(highlights)
      : (filteredActions ?? []);

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
