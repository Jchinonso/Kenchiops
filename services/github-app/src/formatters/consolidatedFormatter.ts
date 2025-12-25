/**
 * Consolidated Formatter
 *
 * Re-exports consolidated formatting functions and provides
 * GitHub check annotation building functionality.
 *
 * For implementation details, see:
 * - prCommentFormatter.ts - PR comment formatting
 * - slackPayloadFormatter.ts - Slack Block Kit formatting
 * - formatterUtils.ts - Shared utilities
 */

import type { AggregatedFailures } from "../services/aggregation/types.js";
import { calculateAverageConfidence } from "./formatterUtils.js";

// Re-export formatting functions for backward compatibility
export { buildConsolidatedPRComment } from "./prCommentFormatter.js";
export { buildConsolidatedSlackPayload } from "./slackPayloadFormatter.js";

// ==================== GitHub Check Annotations ====================

/**
 * GitHub check annotation format
 */
export interface GitHubCheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "failure" | "warning" | "notice";
  message: string;
  title: string;
}

/**
 * Build consolidated check annotations from all failures.
 * Deduplicates annotations by file:line and limits to 50.
 */
export const buildConsolidatedCheckAnnotations = (
  aggregation: AggregatedFailures
): GitHubCheckAnnotation[] => {
  // Flatten all annotations
  const allAnnotations = aggregation.failures.flatMap((failure) =>
    failure.annotations.map((annotation): GitHubCheckAnnotation => ({
      path: annotation.path,
      start_line: annotation.line,
      end_line: annotation.line,
      annotation_level: annotation.level,
      message: `[${failure.checkName}] ${annotation.message}`,
      title: annotation.title ?? failure.checkName,
    }))
  );

  // Deduplicate using reduce with Set tracking
  const { annotations } = allAnnotations.reduce<{
    seen: Set<string>;
    annotations: GitHubCheckAnnotation[];
  }>(
    (acc, ann) => {
      const key = `${ann.path}:${ann.start_line}`;
      if (acc.seen.has(key) || acc.annotations.length >= 50) {
        return acc;
      }
      acc.seen.add(key);
      acc.annotations.push(ann);
      return acc;
    },
    { seen: new Set(), annotations: [] }
  );

  return annotations;
};

/**
 * Build summary text for GitHub check run
 */
export const buildConsolidatedCheckSummary = (aggregation: AggregatedFailures): string => {
  const { failures } = aggregation;
  const avgConfidence = calculateAverageConfidence(failures);

  const checkList = failures
    .map((f) => `- **${f.checkName}**: ${f.identifiedCause ?? "Analysis in progress"}`)
    .join("\n");

  return [
    `## CI Failure Summary`,
    "",
    `**Failed Checks:** ${failures.length}`,
    `**Overall Confidence:** ${Math.round(avgConfidence * 100)}%`,
    "",
    "### Failed Checks",
    checkList,
  ].join("\n");
};
