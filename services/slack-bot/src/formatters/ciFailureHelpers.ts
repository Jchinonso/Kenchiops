/**
 * CI Failure Helper Functions
 *
 * Resolver functions for extracting and normalizing analysis data.
 */

import { PRIORITY_EMOJI, PRIORITY_NUMERIC_MAP } from "@kenchi/shared";
import type { CIFailureAnalysis, CIAnnotation } from "../types/slackTypes.js";

// ==================== Type Aliases ====================

/** Dependency change from analysis (AI-extracted or legacy) */
export type CIDependencyChange =
  | NonNullable<CIFailureAnalysis["detectedDependencyChanges"]>[number]
  | NonNullable<CIFailureAnalysis["dependencyChanges"]>[number];

/** Build config change from analysis (AI-extracted) */
export type CIBuildConfigChange = NonNullable<
  CIFailureAnalysis["detectedBuildConfigChanges"]
>[number];

/** Recommended action from CI failure analysis */
export type CIRecommendedAction = NonNullable<CIFailureAnalysis["recommended_actions"]>[number];

// ==================== Priority Functions ====================

/**
 * Gets priority emoji for action priority.
 *
 * @param priority - Priority level (critical, high, medium, low) or numeric (1=critical, 2=high, 3=medium, 4=low)
 * @returns Emoji string for the priority level
 */
export const getPriorityEmoji = (priority: string | number): string => {
  // Handle numeric priorities using centralized mapping
  if (typeof priority === "number") {
    const priorityKey =
      PRIORITY_NUMERIC_MAP[priority as keyof typeof PRIORITY_NUMERIC_MAP] || "low";
    return PRIORITY_EMOJI[priorityKey];
  }
  const priorityLower = priority.toLowerCase() as keyof typeof PRIORITY_EMOJI;
  return PRIORITY_EMOJI[priorityLower] || PRIORITY_EMOJI.low;
};

// ==================== Resolver Functions ====================

/**
 * Resolves annotations from analysis, preferring direct annotations over AI-extracted.
 */
export const resolveAnnotations = (analysis: CIFailureAnalysis): readonly CIAnnotation[] => {
  if (analysis.annotations && analysis.annotations.length > 0) {
    return analysis.annotations;
  }

  const aiAnnotations = analysis.full_analysis?.codeAnnotations ?? [];
  return aiAnnotations.map((annotation) => ({
    path: annotation.path,
    startLine: annotation.line,
    level: annotation.level,
    message: annotation.message,
    title: annotation.title,
    suggestedFix: annotation.suggestedFix,
  }));
};

/**
 * Resolves dependency changes from analysis, preferring AI-extracted over legacy.
 */
export const resolveDependencyChanges = (
  analysis: CIFailureAnalysis
): readonly CIDependencyChange[] => {
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
 * Resolves build config changes from analysis.
 */
export const resolveBuildConfigChanges = (
  analysis: CIFailureAnalysis
): readonly CIBuildConfigChange[] => {
  if (analysis.detectedBuildConfigChanges && analysis.detectedBuildConfigChanges.length > 0) {
    return analysis.detectedBuildConfigChanges;
  }

  const aiChanges = analysis.full_analysis?.detectedBuildConfigChanges;
  if (aiChanges && aiChanges.length > 0) {
    return aiChanges;
  }

  return [];
};

/**
 * Resolves recommended actions from analysis.
 */
export const resolveRecommendedActions = (
  analysis: CIFailureAnalysis
): readonly CIRecommendedAction[] => {
  if (analysis.recommended_actions && analysis.recommended_actions.length > 0) {
    return analysis.recommended_actions;
  }

  return (
    analysis.full_analysis?.recommendedActions?.map((action) => ({
      description: action.description,
      priority: action.priority,
      actionType: action.actionType,
      reasoning: action.reasoning,
    })) ?? []
  );
};
