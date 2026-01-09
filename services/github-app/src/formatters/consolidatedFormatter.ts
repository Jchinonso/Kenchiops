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

import {
  createLogger,
  getErrorMessage,
  GITHUB_ANNOTATION_LIMITS,
  EXCLUDED_PATH_PATTERNS,
  shouldExcludePath,
  sanitizeTestFailureMessage,
  type AggregatedFailures,
  type TestFailureInfo,
} from "@kenchi/shared";
import { calculateAverageConfidence } from "./formatterUtils.js";

const logger = createLogger("github-app");

// Re-export formatting functions for backward compatibility
export { buildConsolidatedPRComment } from "./prCommentFormatter.js";
export { buildConsolidatedSlackPayload } from "./slackPayloadFormatter.js";

// ==================== Helper Functions ====================

/**
 * Check if file path is valid for annotation.
 * Allows test files; excludes vendor/build artifacts and absolute paths.
 *
 * @param path - File path to validate
 * @returns True if path is valid for annotation
 */
const isValidAnnotationPath = (path: string): boolean => {
  if (!path || path.startsWith("/")) {
    return false;
  }

  // Filter out EXCLUDED_PATH_PATTERNS but allow test files
  // Create filtered patterns that exclude .test. and .spec. (we want test files for annotations)
  const annotationExcludedPatterns = EXCLUDED_PATH_PATTERNS.filter(
    (pattern) => pattern !== ".test." && pattern !== ".spec."
  );

  return !shouldExcludePath(path, annotationExcludedPatterns);
};

/**
 * Truncate text to maximum length with ellipsis.
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 */
const truncateText = (text: string, maxLength: number): string =>
  text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;

/**
 * Convert test failure to GitHub check annotation.
 * Returns null if the test failure doesn't have valid file:line or fails validation.
 *
 * @param testFailure - Test failure info from log parsing
 * @param checkName - Name of the check run
 * @returns GitHub check annotation or null
 */
const convertTestFailureToAnnotation = (
  testFailure: TestFailureInfo,
  checkName: string
): GitHubCheckAnnotation | null => {
  try {
    // Must have both file and valid line number
    if (!testFailure.file || testFailure.line === undefined || testFailure.line < 1) {
      return null;
    }

    // Validate file path
    const normalizedPath = testFailure.file.trim();
    if (!isValidAnnotationPath(normalizedPath)) {
      return null;
    }

    // Validate line number (must be positive integer within reasonable bounds)
    const lineNumber = Math.floor(testFailure.line);
    if (lineNumber < 1 || lineNumber > GITHUB_ANNOTATION_LIMITS.MAX_LINE_NUMBER) {
      return null;
    }

    // Build error message
    const errorMessage = testFailure.error
      ? sanitizeTestFailureMessage(testFailure.error)
      : `Test failed: ${testFailure.testName}`;

    return {
      path: normalizedPath,
      start_line: lineNumber,
      end_line: lineNumber,
      annotation_level: "failure" as const,
      message: `[${checkName}] ${errorMessage}`,
      title: truncateText(
        testFailure.testName || checkName,
        GITHUB_ANNOTATION_LIMITS.MAX_TITLE_LENGTH
      ),
      source: "test",
    };
  } catch (error) {
    logger.warn("Failed to convert test failure to annotation", {
      file: testFailure.file,
      error: getErrorMessage(error),
    });
    return null;
  }
};

// ==================== GitHub Check Annotations ====================

/**
 * GitHub check annotation format with source tracking for prioritization
 */
export interface GitHubCheckAnnotation {
  readonly path: string;
  readonly start_line: number;
  readonly end_line: number;
  readonly annotation_level: "failure" | "warning" | "notice";
  readonly message: string;
  readonly title: string;
  /** Source of annotation for prioritization (AI annotations > test failures) */
  readonly source?: "ai" | "test";
}

/**
 * Deduplicate annotations by file:line, respecting priority order.
 * AI annotations are processed first (higher priority), then test failures.
 * Uses reduce for functional iteration.
 *
 * @param aiAnnotations - AI-generated annotations (higher priority)
 * @param testFailureAnnotations - Test failure annotations (lower priority)
 * @returns Deduplicated annotations limited to MAX_PER_CHECK_RUN
 */
const deduplicateAnnotations = (
  aiAnnotations: readonly GitHubCheckAnnotation[],
  testFailureAnnotations: readonly GitHubCheckAnnotation[]
): GitHubCheckAnnotation[] => {
  const maxAnnotations = GITHUB_ANNOTATION_LIMITS.MAX_PER_CHECK_RUN;

  // Combine with AI annotations first (higher priority)
  const allAnnotations = [...aiAnnotations, ...testFailureAnnotations];

  // Deduplicate using reduce with Set tracking
  const { annotations } = allAnnotations.reduce<{
    seen: Set<string>;
    annotations: GitHubCheckAnnotation[];
  }>(
    (state, currentAnnotation) => {
      const key = `${currentAnnotation.path}:${currentAnnotation.start_line}`;
      if (state.seen.has(key) || state.annotations.length >= maxAnnotations) {
        return state;
      }
      state.seen.add(key);
      state.annotations.push(currentAnnotation);
      return state;
    },
    { seen: new Set(), annotations: [] }
  );

  return annotations;
};

/**
 * Build consolidated check annotations from all failures.
 * Includes both AI-generated annotations and test failures with file:line.
 * Prioritizes AI annotations over test failures.
 * Deduplicates by file:line and limits to MAX_PER_CHECK_RUN (50).
 */
export const buildConsolidatedCheckAnnotations = (
  aggregation: AggregatedFailures
): GitHubCheckAnnotation[] => {
  // 1. Collect AI-generated annotations (higher priority)
  const aiAnnotations = aggregation.failures.flatMap((failure) =>
    failure.annotations.map(
      (annotation): GitHubCheckAnnotation => ({
        path: annotation.path,
        start_line: annotation.line,
        end_line: annotation.line,
        annotation_level: annotation.level,
        message: `[${failure.checkName}] ${annotation.message}`,
        title: annotation.title ?? failure.checkName,
        source: "ai",
      })
    )
  );

  // 2. Convert test failures with file:line to annotations (lower priority)
  const testFailureAnnotations = aggregation.failures.flatMap((failure) =>
    (failure.testFailures ?? [])
      .map((testFailure) => convertTestFailureToAnnotation(testFailure, failure.checkName))
      .filter((annotation): annotation is GitHubCheckAnnotation => annotation !== null)
  );

  // 3. Deduplicate and prioritize (AI annotations first, then test failures)
  const annotations = deduplicateAnnotations(aiAnnotations, testFailureAnnotations);

  logger.debug("Built consolidated check annotations", {
    aiAnnotationCount: aiAnnotations.length,
    testFailureAnnotationCount: testFailureAnnotations.length,
    totalAnnotations: annotations.length,
  });

  return annotations;
};

/**
 * Build summary text for GitHub check run
 */
export const buildConsolidatedCheckSummary = (aggregation: AggregatedFailures): string => {
  const { failures } = aggregation;
  const avgConfidence = calculateAverageConfidence(failures);

  const checkList = failures
    .map(
      (failure) =>
        `- **${failure.checkName}**: ${failure.identifiedCause ?? "Analysis in progress"}`
    )
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
