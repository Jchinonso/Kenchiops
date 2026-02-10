/**
 * Analysis Field Resolvers
 *
 * Centralized resolver functions for extracting and normalizing analysis data.
 * Provides a single source of truth for resolving analysis fields from
 * various sources (direct fields, full_analysis, fallbacks).
 *
 * @module formatting/analysis/resolvers
 */

import type {
  LLMCodeAnnotation,
  LLMRecommendedAction,
  LLMDetectedBuildConfigChange,
} from "../../core/types.js";

import type {
  AnalysisLike,
  ResolvedAnnotation,
  ResolvedAction,
  ResolvedDependencyChange,
} from "./types.js";

// ==================== Resolver Functions ====================

/**
 * Resolves the identified cause from analysis data.
 * Prioritizes direct identified_cause, then full_analysis.identifiedCause,
 * then analysis summary, then falls back to default message.
 *
 * @param analysis - The analysis data to resolve from
 * @returns Resolved cause string
 */
export const resolveIdentifiedCause = (analysis: AnalysisLike): string =>
  analysis.identified_cause ??
  analysis.full_analysis?.identifiedCause ??
  analysis.analysis ??
  analysis.summary ??
  "No critical issues detected.";

/**
 * Resolves annotations from analysis data.
 * Prioritizes direct annotations, then converts from full_analysis.codeAnnotations.
 *
 * @param analysis - The analysis data to resolve from
 * @returns Array of resolved annotations
 */
export const resolveAnnotations = (analysis: AnalysisLike): readonly ResolvedAnnotation[] => {
  if (analysis.annotations && analysis.annotations.length > 0) {
    return analysis.annotations;
  }

  const aiAnnotations = analysis.full_analysis?.codeAnnotations ?? [];
  return aiAnnotations.map((annotation: LLMCodeAnnotation) => ({
    path: annotation.path,
    startLine: annotation.line,
    level: annotation.level,
    message: annotation.message,
    title: annotation.title,
  }));
};

/**
 * Resolves recommended actions from analysis data.
 * Prioritizes direct recommended_actions, then full_analysis.recommendedActions.
 *
 * @param analysis - The analysis data to resolve from
 * @returns Array of resolved actions
 */
export const resolveRecommendedActions = (analysis: AnalysisLike): readonly ResolvedAction[] => {
  if (analysis.recommended_actions && analysis.recommended_actions.length > 0) {
    return analysis.recommended_actions;
  }

  const aiActions = analysis.full_analysis?.recommendedActions ?? [];
  return aiActions.map((action: LLMRecommendedAction) => ({
    description: action.description,
    priority: action.priority,
    actionType: action.actionType,
    reasoning: action.reasoning,
  }));
};

/**
 * Resolves dependency changes from analysis data.
 * Prioritizes AI-extracted detectedDependencyChanges, then full_analysis,
 * then legacy dependencyChanges.
 *
 * @param analysis - The analysis data to resolve from
 * @returns Array of resolved dependency changes
 */
export const resolveDependencyChanges = (
  analysis: AnalysisLike
): readonly ResolvedDependencyChange[] => {
  if (analysis.detectedDependencyChanges && analysis.detectedDependencyChanges.length > 0) {
    return analysis.detectedDependencyChanges;
  }

  const aiChanges = analysis.full_analysis?.detectedDependencyChanges;
  if (aiChanges && aiChanges.length > 0) {
    return aiChanges;
  }

  return analysis.dependencyChanges ?? [];
};

/**
 * Resolves build config changes from analysis data.
 * Prioritizes direct detectedBuildConfigChanges, then full_analysis.
 *
 * @param analysis - The analysis data to resolve from
 * @returns Array of resolved build config changes
 */
export const resolveBuildConfigChanges = (
  analysis: AnalysisLike
): readonly LLMDetectedBuildConfigChange[] => {
  if (analysis.detectedBuildConfigChanges && analysis.detectedBuildConfigChanges.length > 0) {
    return analysis.detectedBuildConfigChanges;
  }

  const aiChanges = analysis.full_analysis?.detectedBuildConfigChanges;
  if (aiChanges && aiChanges.length > 0) {
    return aiChanges;
  }

  return [];
};
