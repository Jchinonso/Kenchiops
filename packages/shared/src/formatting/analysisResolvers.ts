/**
 * Analysis Field Resolvers
 *
 * Centralized resolver functions for extracting and normalizing analysis data.
 * Provides a single source of truth for resolving analysis fields from
 * various sources (direct fields, full_analysis, fallbacks).
 */

import type {
  LLMAnalysisResult,
  LLMCodeAnnotation,
  LLMRecommendedAction,
  LLMDetectedDependencyChange,
  LLMDetectedBuildConfigChange,
} from "../core/types.js";

/**
 * Minimal analysis interface for resolver functions.
 * Compatible with both slack-bot and github-app analysis types.
 */
export interface AnalysisLike {
  readonly identified_cause?: string;
  readonly analysis?: string;
  readonly summary?: string;
  readonly recommended_actions?: ReadonlyArray<{
    readonly priority?: string | number;
    readonly description: string;
    readonly actionType?: string;
    readonly reasoning?: string;
  }>;
  readonly annotations?: ReadonlyArray<{
    readonly path: string;
    readonly startLine: number;
    readonly level: "notice" | "warning" | "failure";
    readonly message: string;
    readonly title?: string;
  }>;
  readonly dependencyChanges?: ReadonlyArray<{
    readonly type: "added" | "removed" | "updated";
    readonly name: string;
    readonly oldVersion?: string;
    readonly newVersion?: string;
  }>;
  readonly detectedDependencyChanges?: readonly LLMDetectedDependencyChange[];
  readonly detectedBuildConfigChanges?: readonly LLMDetectedBuildConfigChange[];
  readonly full_analysis?: LLMAnalysisResult;
}

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
 * Annotation type returned by resolver.
 */
export interface ResolvedAnnotation {
  readonly path: string;
  readonly startLine: number;
  readonly level: "notice" | "warning" | "failure";
  readonly message: string;
  readonly title?: string;
}

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
 * Action type returned by resolver.
 */
export interface ResolvedAction {
  readonly description: string;
  readonly priority?: string | number;
  readonly actionType?: string;
  readonly reasoning?: string;
}

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
 * Dependency change type returned by resolver.
 */
export interface ResolvedDependencyChange {
  readonly name: string;
  readonly type?: "added" | "removed" | "updated";
  readonly changeType?: string;
  readonly oldVersion?: string;
  readonly newVersion?: string;
}

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
  // Prefer AI-extracted dependency changes
  if (analysis.detectedDependencyChanges && analysis.detectedDependencyChanges.length > 0) {
    return analysis.detectedDependencyChanges;
  }

  // Try full_analysis.detectedDependencyChanges
  const aiChanges = analysis.full_analysis?.detectedDependencyChanges;
  if (aiChanges && aiChanges.length > 0) {
    return aiChanges;
  }

  // Fall back to legacy dependencyChanges
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
