/**
 * Enriched Section Builders
 *
 * Builds PR comment sections for dependency changes, build config changes,
 * confidence badges, and prioritized recommended actions.
 */

import {
  GITHUB_COMMENT_DISPLAY,
  UI_EMOJI,
  DEPENDENCY_EMOJI_MAP,
  PRIORITY_EMOJI_MAP,
  CONFIDENCE_BADGE_THRESHOLDS,
  type LLMDetectedDependencyChange,
  type LLMDetectedBuildConfigChange,
} from "@kenchi/shared";
import type { RecommendedActionInput } from "./prCommentTypes.js";

// ==================== Confidence Badge ====================

/**
 * Get a confidence badge string from a numeric confidence value.
 * Uses shared threshold constants for consistent display.
 */
export const getConfidenceBadge = (confidence: number): string => {
  const match = CONFIDENCE_BADGE_THRESHOLDS.find((threshold) => confidence >= threshold.min);
  const emoji = match?.emoji ?? UI_EMOJI.confidenceVeryLow;
  const label =
    confidence >= 0.85
      ? "High"
      : confidence >= 0.7
        ? "Medium"
        : confidence >= 0.5
          ? "Low"
          : "Very Low";
  return `${emoji} ${label} (${Math.round(confidence * 100)}%)`;
};

// ==================== Dependency Changes ====================

/**
 * Build the dependency changes section as a collapsible table.
 */
export const buildDependencyChangesSection = (
  changes: readonly LLMDetectedDependencyChange[]
): string[] => {
  if (changes.length === 0) {
    return [];
  }

  const rows = changes.map((change) => {
    const emoji = DEPENDENCY_EMOJI_MAP[change.type] ?? UI_EMOJI.depUpdated;
    const typeName = `${change.type.charAt(0).toUpperCase()}${change.type.slice(1)}`;
    const oldVersion = change.oldVersion ?? "—";
    const newVersion = change.newVersion ?? "—";
    const ecosystem = change.ecosystem ?? "—";
    return `| ${change.name} | ${emoji} ${typeName} | ${oldVersion} | ${newVersion} | ${ecosystem} |`;
  });

  return [
    `<details><summary>${UI_EMOJI.package} <strong>Dependency Changes</strong> (${changes.length} detected)</summary>`,
    "",
    "| Package | Change | Old | New | Ecosystem |",
    "| :--- | :--- | :--- | :--- | :--- |",
    ...rows,
    "",
    "</details>",
    "",
  ];
};

// ==================== Build Config Changes ====================

/**
 * Build the build config changes section as a collapsible list.
 */
export const buildBuildConfigChangesSection = (
  changes: readonly LLMDetectedBuildConfigChange[]
): string[] => {
  if (changes.length === 0) {
    return [];
  }

  const items = changes.map((change) => {
    const changeType = change.changeType ?? "modified";
    return `- **${change.file}** (${changeType}): ${change.summary}`;
  });

  return [
    `<details><summary>${UI_EMOJI.workflow} <strong>Build Config Changes</strong> (${changes.length} detected)</summary>`,
    "",
    ...items,
    "",
    "</details>",
    "",
  ];
};

// ==================== Prioritized Actions ====================

/**
 * Format a single action with priority badge.
 */
export const formatPrioritizedAction = (action: RecommendedActionInput): string => {
  const priorityKey = String(action.priority).toLowerCase();
  const emoji = PRIORITY_EMOJI_MAP[priorityKey] ?? UI_EMOJI.priorityDefault;
  const label = `${priorityKey.charAt(0).toUpperCase()}${priorityKey.slice(1)}`;
  return `- [ ] ${emoji} **${label}:** ${action.description}`;
};

/**
 * Build prioritized actions list from recommended actions.
 * Returns formatted lines with priority badges, or empty array if no actions.
 */
export const buildPrioritizedActions = (
  recommendedActions: readonly RecommendedActionInput[]
): string[] => {
  if (recommendedActions.length === 0) {
    return [];
  }

  return recommendedActions
    .slice(0, GITHUB_COMMENT_DISPLAY.MAX_ACTIONS)
    .map(formatPrioritizedAction);
};
