/**
 * Slack Annotation Block Builders
 *
 * Builds blocks for displaying annotations and test failures in Slack messages.
 */

import {
  UI_EMOJI,
  GITHUB_COMMENT_DISPLAY,
  FILE_PATH_VALIDATION,
  FORMATTER_DISPLAY_LIMITS,
  type AnalyzedFailure,
} from "@kenchi/shared";
import { DISPLAY_LIMITS } from "./formatterUtils.js";
import type {
  SlackTextBlock,
  ConsolidatedAnnotation,
  ConsolidatedTestFailure,
} from "./slackBlockTypes.js";

// ==================== Helper Functions ====================

/**
 * Truncates a display string to max length with ellipsis.
 */
const truncateDisplay = (
  text: string,
  maxLength: number = FORMATTER_DISPLAY_LIMITS.SLACK_MAX_LINE_CHARS
): string => (text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`);

/**
 * Extracts and validates file location from annotation path and line.
 * Returns null if the path doesn't look like a valid file path.
 * Handles cases where error text is accidentally included in the path field.
 *
 * @param path - Raw path string from annotation
 * @param line - Line number from annotation
 * @returns Formatted location string (e.g., "src/index.ts:42") or null if invalid
 */
const extractValidFileLocation = (path: string, line: number): string | null => {
  if (!path || path === "unknown" || path.length > GITHUB_COMMENT_DISPLAY.MAX_FILE_PATH_LENGTH) {
    return null;
  }

  const trimmedPath = path.trim();

  // Try to extract file:line pattern from the path itself (handles embedded line numbers)
  const embeddedMatch = trimmedPath.match(FILE_PATH_VALIDATION.LOCATION_PATTERN);
  if (embeddedMatch) {
    const extractedPath = embeddedMatch[1];
    const extractedLine = parseInt(embeddedMatch[2], 10);
    if (FILE_PATH_VALIDATION.VALID_PATH_PATTERN.test(extractedPath)) {
      return `${extractedPath}:${extractedLine}`;
    }
  }

  // Validate the path looks like a real file path (not error text)
  if (!FILE_PATH_VALIDATION.VALID_PATH_PATTERN.test(trimmedPath)) {
    return null;
  }

  // Return path with line if valid
  return line > 0 ? `${trimmedPath}:${line}` : trimmedPath;
};

/**
 * Normalizes annotation message for display
 */
const normalizeAnnotationMessage = (message: string): string => {
  const stripped = message.replace(FILE_PATH_VALIDATION.EVIDENCE_PREFIX_PATTERN, "").trim();
  const lines = stripped.split("\n").map((messageLine) => messageLine.trim());
  const firstLine =
    lines.find((messageLine) => messageLine.length > 0 && !/^TEST_ERROR_/i.test(messageLine)) ?? "";
  return truncateDisplay(firstLine, 60);
};

/**
 * Formats an annotation entry showing error and fix compactly.
 * Shows: `path:line` - error (Fix: short fix)
 * Returns null if no valid file location.
 */
const formatAnnotationEntry = (annotation: ConsolidatedAnnotation): string | null => {
  const location = extractValidFileLocation(annotation.path, annotation.line);
  if (!location) {
    return null;
  }

  // Build compact display: error first, then fix if present
  const errorSummary = normalizeAnnotationMessage(annotation.message);
  const fixNote = annotation.suggestedFix
    ? ` _(Fix: ${normalizeAnnotationMessage(annotation.suggestedFix)})_`
    : "";

  return `   ${UI_EMOJI.list} \`${location}\` — ${errorSummary}${fixNote}`;
};

/**
 * Formats a test failure entry.
 * Test failures should be pre-normalized via normalizeTestFailure() at consolidation.
 * Validates file paths to prevent error text from appearing in location.
 */
const formatTestFailureEntry = (testFailure: ConsolidatedTestFailure): string | null => {
  const location = testFailure.file
    ? extractValidFileLocation(testFailure.file, testFailure.line ?? 0)
    : null;
  if (!location) {
    return null;
  }

  const truncatedTestName = truncateDisplay(testFailure.testName, 50);
  const normalizedError = testFailure.error ? normalizeAnnotationMessage(testFailure.error) : "";
  const isPathOnly = testFailure.file && testFailure.file === testFailure.testName;
  const isGenericName = testFailure.testName.trim().toLowerCase() === "test failed";
  const display =
    normalizedError && (isPathOnly || isGenericName)
      ? `Test failed: ${normalizedError}`
      : `Test failed: ${truncatedTestName}`;
  return `   ${UI_EMOJI.list} \`${location}\` — ${display}`;
};

// ==================== Block Builders ====================

/**
 * Build consolidated affected files block
 * Combines annotations and test failures into a single unified view.
 * Applies display limits and shows "...and N more" for overflow.
 */
export const buildAnnotationsBlock = (
  annotations: readonly ConsolidatedAnnotation[],
  testFailures: readonly ConsolidatedTestFailure[] = []
): SlackTextBlock | null => {
  const displayLimit = DISPLAY_LIMITS.slackAnnotationsPerCheck;

  const formattedAnnotations = annotations
    .map((annotation) => formatAnnotationEntry(annotation))
    .filter((line): line is string => Boolean(line));

  const formattedTestFailures = testFailures
    .map((testFailure) => formatTestFailureEntry(testFailure))
    .filter((line): line is string => Boolean(line));

  const totalCount = formattedAnnotations.length + formattedTestFailures.length;
  if (totalCount === 0) {
    return null;
  }

  // Format annotation entries (prioritize these first)
  const annotationLines = formattedAnnotations.slice(0, displayLimit);

  // Calculate remaining slots for test failures
  const remainingSlots = Math.max(0, displayLimit - annotationLines.length);
  const testFailureLines = formattedTestFailures.slice(0, remainingSlots);

  const displayedLines = [...annotationLines, ...testFailureLines];
  const displayedCount = displayedLines.length;
  const overflowCount = totalCount - displayedCount;

  const moreText = overflowCount > 0 ? `\n   _...and ${overflowCount} more_` : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${UI_EMOJI.location} *Affected Files (${totalCount}):*\n${displayedLines.join("\n")}${moreText}`,
      },
    ],
  };
};

/**
 * Build check names list block with truncation.
 * Shows first N checks that fit within character limit.
 */
export const buildCheckNamesBlock = (failures: readonly AnalyzedFailure[]): SlackTextBlock => {
  const displayLimit = DISPLAY_LIMITS.slackMaxChecks;
  const displayedFailures = failures.slice(0, displayLimit);

  // Build check names string with character limit
  const checkNames = displayedFailures.map((failure) => `\`${failure.checkName}\``);

  // Truncate if total string exceeds limit
  const fullText = checkNames.join(", ");
  const overflowCount = failures.length - displayedFailures.length;
  const moreText = overflowCount > 0 ? `, _+${overflowCount} more_` : "";

  const truncatedText =
    fullText.length > FORMATTER_DISPLAY_LIMITS.SLACK_CHECK_NAMES_MAX_CHARS
      ? `${fullText.slice(0, FORMATTER_DISPLAY_LIMITS.SLACK_CHECK_NAMES_MAX_CHARS)}...${moreText}`
      : `${fullText}${moreText}`;

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Checks:* ${truncatedText}`,
    },
  };
};
