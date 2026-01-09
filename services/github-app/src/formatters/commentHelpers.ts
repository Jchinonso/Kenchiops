/**
 * GitHub Comment Helper Functions
 *
 * Helper functions and item formatters for GitHub PR comment generation.
 */

import {
  UI_EMOJI,
  DEPENDENCY_EMOJI_MAP,
  CONFIDENCE_BADGE_THRESHOLDS,
  GITHUB_COMMENT_DISPLAY,
  truncateText,
  type CIAnnotation,
  type CITestFailure,
  type LLMRecommendedAction,
} from "@kenchi/shared";
import type {
  AnalysisData,
  DetectedBuildConfigChange,
  DetectedDependencyChange,
  RecommendedAction,
} from "./commentTypes.js";
import { getPriorityEmoji } from "./formatterUtils.js";

// ==================== Helper Functions ====================

/**
 * Filters annotations to only include failure-level annotations.
 */
export const getFailureAnnotations = (annotations?: readonly CIAnnotation[]): CIAnnotation[] =>
  annotations?.filter((annotation) => annotation.level === "failure") ?? [];

/**
 * Gets the appropriate emoji for a dependency change type.
 */
export const getDependencyEmoji = (type: string): string =>
  DEPENDENCY_EMOJI_MAP[type] ?? UI_EMOJI.depUpdated;

/**
 * Gets the confidence badge emoji based on confidence score.
 */
export const getConfidenceBadge = (confidence: number): string =>
  CONFIDENCE_BADGE_THRESHOLDS.find((threshold) => confidence >= threshold.min)?.emoji ??
  UI_EMOJI.confidenceVeryLow;

/**
 * Resolves annotations from analysis data, preferring direct annotations
 * over AI-extracted code annotations.
 */
export const resolveAnnotations = (analysis: AnalysisData): CIAnnotation[] => {
  if (analysis.annotations && analysis.annotations.length > 0) {
    return [...analysis.annotations];
  }

  const aiAnnotations = analysis.full_analysis?.codeAnnotations ?? [];
  return aiAnnotations.map((annotation) => ({
    path: annotation.path,
    startLine: annotation.line,
    level: annotation.level,
    message: annotation.message,
  }));
};

// ==================== Item Formatters ====================

/**
 * Formats a single test failure for display.
 */
export const formatTestFailure = (failure: CITestFailure): string => {
  const showLocation = failure.file && failure.file !== failure.testName;
  const location = showLocation ? ` in \`${failure.file}\`` : "";
  return `- ${UI_EMOJI.failure} \`${truncateText(failure.testName, GITHUB_COMMENT_DISPLAY.MAX_TEST_NAME_LENGTH)}\`${location}`;
};

/**
 * Formats a single annotation for display.
 */
export const formatAnnotation = (annotation: CIAnnotation): string => {
  const hasPath = annotation.path !== "unknown" && annotation.path.length > 0;
  const hasLine = annotation.startLine > 0;
  const location = hasPath
    ? hasLine
      ? `\`${annotation.path}:${annotation.startLine}\``
      : `\`${annotation.path}\``
    : "";
  const separator = location ? " — " : "";

  return `- ${UI_EMOJI.location} ${location}${separator}${truncateText(annotation.message, GITHUB_COMMENT_DISPLAY.MAX_ANNOTATION_MESSAGE_LENGTH)}`;
};

/** Emoji mapping for build config change types using UI_EMOJI */
export const BUILD_CONFIG_CHANGE_EMOJI_MAP: Record<
  DetectedBuildConfigChange["changeType"],
  string
> = {
  added: UI_EMOJI.depAdded,
  modified: UI_EMOJI.commit,
  deleted: UI_EMOJI.depRemoved,
} as const;

/**
 * Formats a dependency change for display.
 */
export const formatDependencyChange = (
  dependencyChange:
    | DetectedDependencyChange
    | NonNullable<AnalysisData["dependencyChanges"]>[number]
): string => {
  const icon = getDependencyEmoji(dependencyChange.type);
  const version =
    dependencyChange.oldVersion && dependencyChange.newVersion
      ? ` (${dependencyChange.oldVersion} → ${dependencyChange.newVersion})`
      : dependencyChange.newVersion
        ? ` (${dependencyChange.newVersion})`
        : "";
  const ecosystem =
    "ecosystem" in dependencyChange && dependencyChange.ecosystem
      ? ` [${dependencyChange.ecosystem}]`
      : "";
  return `- ${icon} \`${dependencyChange.name}\`${version}${ecosystem}`;
};

/**
 * Formats a build config change for display.
 */
export const formatBuildConfigChange = (change: DetectedBuildConfigChange): string => {
  const icon = BUILD_CONFIG_CHANGE_EMOJI_MAP[change.changeType];
  return `- ${icon} \`${change.file}\` — ${change.summary}`;
};

/**
 * Formats a recommended action for display.
 * Handles both RecommendedAction and LLMRecommendedAction types.
 */
export const formatAction = (
  action: RecommendedAction | LLMRecommendedAction,
  index: number
): string => `${index + 1}. ${getPriorityEmoji(action.priority ?? "medium")} ${action.description}`;

/**
 * Formats an error message with truncation.
 */
export const formatError = (errorMessage: string): string =>
  truncateText(errorMessage, GITHUB_COMMENT_DISPLAY.MAX_ERROR_LINE_LENGTH);

/**
 * Formats an impact message with warning emoji.
 */
export const formatImpact = (impactMessage: string): string =>
  `- ${UI_EMOJI.warning} ${impactMessage}`;
