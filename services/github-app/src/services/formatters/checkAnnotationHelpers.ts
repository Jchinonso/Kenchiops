/**
 * Check Annotation Helpers
 *
 * Builds GitHub check annotations from aggregated CI failures.
 */

import { GITHUB_COMMENT_DISPLAY, type AggregatedFailures } from "@kenchi/shared";
import type { CheckAnnotation } from "../githubService.js";

/**
 * Build check annotations from aggregated failures.
 */
export const buildConsolidatedCheckAnnotations = (
  aggregation: AggregatedFailures
): CheckAnnotation[] =>
  aggregation.failures.flatMap((failure) =>
    (failure.annotations ?? [])
      .filter((annotation) => annotation.path && annotation.line)
      .map((annotation) => ({
        path: annotation.path,
        start_line: annotation.line,
        end_line: annotation.line,
        annotation_level:
          annotation.level === "failure"
            ? ("failure" as const)
            : annotation.level === "warning"
              ? ("warning" as const)
              : ("notice" as const),
        message: annotation.message,
        title: annotation.title,
      }))
  );

/**
 * Build check summary from aggregated failures.
 */
export const buildConsolidatedCheckSummary = (aggregation: AggregatedFailures): string => {
  const failureCount = aggregation.failures.length;
  const causes = aggregation.failures
    .map((failure) => failure.identifiedCause ?? failure.analysis)
    .filter((cause): cause is string => Boolean(cause))
    .slice(0, GITHUB_COMMENT_DISPLAY.MAX_ACTIONS);

  const causeLines = causes.map((cause) => `- ${cause}`);

  return [`Analyzed ${failureCount} failed check(s).`, "", "**Root Causes:**", ...causeLines].join(
    "\n"
  );
};
