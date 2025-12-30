/**
 * Formatter Utilities
 *
 * Shared utility functions and constants for formatting
 * consolidated CI failure messages.
 */

import {
  UI_EMOJI,
  PRIORITY_EMOJI_MAP,
  PRIORITY_ORDER,
  PRIORITY_ORDER_DEFAULT,
  type AnalyzedFailure,
  type RecommendedAction,
} from "@kenchi/shared";

/**
 * Maximum items to display per section.
 * Increased to show comprehensive context for AI analysis.
 */
export const DISPLAY_LIMITS = {
  annotationsPerCheck: 100,
  totalAnnotations: 150,
  recommendedActions: 10,
  checksToShow: 20,
  slackAnnotationsPerCheck: 50,
  slackMaxChecks: 10,
} as const;

// ==================== Utility Functions ====================

/**
 * Numeric priority to emoji lookup.
 */
const NUMERIC_PRIORITY_EMOJI: ReadonlyArray<{ max: number; emoji: string }> = [
  { max: 1, emoji: UI_EMOJI.priorityCritical },
  { max: 2, emoji: UI_EMOJI.priorityMedium },
] as const;

/**
 * Get priority emoji from priority value.
 */
export const getPriorityEmoji = (priority: string | number): string => {
  if (typeof priority === "number") {
    const matchingThreshold = NUMERIC_PRIORITY_EMOJI.find((threshold) => priority <= threshold.max);
    return matchingThreshold?.emoji ?? UI_EMOJI.priorityLow;
  }
  return PRIORITY_EMOJI_MAP[priority.toLowerCase()] ?? UI_EMOJI.priorityDefault;
};

/**
 * Get numeric priority for sorting.
 */
export const getNumericPriority = (priority: string | number): number =>
  typeof priority === "string"
    ? (PRIORITY_ORDER[priority.toLowerCase()] ?? PRIORITY_ORDER_DEFAULT)
    : priority;

/**
 * Calculate average confidence from failures
 */
export const calculateAverageConfidence = (failures: readonly AnalyzedFailure[]): number => {
  if (failures.length === 0) {
    return 0;
  }
  const sum = failures.reduce((accumulator, failure) => accumulator + failure.confidence, 0);
  return sum / failures.length;
};

/**
 * Confidence percentage thresholds for emoji selection.
 * Using percentage scale (0-100) vs the badge thresholds which use decimal (0-1).
 */
const CONFIDENCE_PERCENT_THRESHOLDS: ReadonlyArray<{ min: number; emoji: string }> = [
  { min: 70, emoji: UI_EMOJI.confidenceHigh },
  { min: 40, emoji: UI_EMOJI.confidenceMedium },
] as const;

/**
 * Get confidence emoji based on percentage.
 */
export const getConfidenceEmoji = (percent: number): string => {
  const matchingThreshold = CONFIDENCE_PERCENT_THRESHOLDS.find(
    (threshold) => percent >= threshold.min
  );
  return matchingThreshold?.emoji ?? UI_EMOJI.confidenceVeryLow;
};

/**
 * Deduplicate and merge recommended actions from all failures.
 * Deduplicates by actionType to avoid showing multiple similar actions.
 */
export const mergeRecommendedActions = (
  failures: readonly AnalyzedFailure[]
): RecommendedAction[] => {
  const actionMap = failures
    .flatMap((failure) => failure.recommendedActions)
    .reduce((deduplicatedMap, currentAction) => {
      // Deduplicate by actionType (or description for actions without type)
      const key = currentAction.actionType ?? currentAction.description.toLowerCase().trim();
      return deduplicatedMap.has(key) ? deduplicatedMap : deduplicatedMap.set(key, currentAction);
    }, new Map<string, RecommendedAction>());

  return Array.from(actionMap.values())
    .sort(
      (firstAction, secondAction) =>
        getNumericPriority(firstAction.priority) - getNumericPriority(secondAction.priority)
    )
    .slice(0, DISPLAY_LIMITS.recommendedActions);
};
