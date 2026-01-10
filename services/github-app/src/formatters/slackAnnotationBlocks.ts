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
  extractMeaningfulCause,
  sanitizeTestFailureMessage,
  generateTestEvidenceId,
  generateAnnoEvidenceId,
  partitionByFailureType,
  countUniqueFiles,
  detectFlakyTests,
  formatFlakyTestWarning,
  truncateText,
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
 * Normalizes annotation/error message for display.
 * Uses extractMeaningfulCause to find meaningful assertion details,
 * filtering out useless content like matcher names and test runner markers.
 */
const normalizeAnnotationMessage = (message: string): string => {
  const stripped = message.replace(FILE_PATH_VALIDATION.EVIDENCE_PREFIX_PATTERN, "").trim();
  // Use extractMeaningfulCause which filters out useless content
  // It already calls extractAssertionSnippet internally with proper filtering
  const meaningful = extractMeaningfulCause(stripped);
  if (meaningful && meaningful.length > 5) {
    return truncateDisplay(meaningful, 60);
  }
  // Return empty string if no meaningful content (better than showing useless content)
  return "";
};

/**
 * Formats a test failure entry with evidence ID.
 * Test failures should be pre-normalized via normalizeTestFailure() at consolidation.
 * Validates file paths to prevent error text from appearing in location.
 */
const formatTestFailureEntry = (
  testFailure: ConsolidatedTestFailure,
  index: number
): string | null => {
  const location = testFailure.file
    ? extractValidFileLocation(testFailure.file, testFailure.line ?? 0)
    : null;
  if (!location) {
    return null;
  }

  const normalizedError = testFailure.error ? sanitizeTestFailureMessage(testFailure.error) : "";
  // Only show entry if we have meaningful error content
  if (normalizedError.length === 0) {
    return null;
  }
  const evidenceId = generateTestEvidenceId(index);
  return `   ${UI_EMOJI.list} \`${location}\` — ${normalizedError} [${evidenceId}]`;
};

/**
 * Formats an annotation entry with evidence ID.
 */
const formatAnnotationEntryWithId = (
  annotation: ConsolidatedAnnotation,
  index: number
): string | null => {
  const location = extractValidFileLocation(annotation.path, annotation.line);
  if (!location) {
    return null;
  }

  // Build compact display: error first, then fix if present
  const errorSummary = normalizeAnnotationMessage(annotation.message);
  const fixNote = annotation.suggestedFix
    ? ` _(Fix: ${normalizeAnnotationMessage(annotation.suggestedFix)})_`
    : "";
  const evidenceId = generateAnnoEvidenceId(index);

  return `   ${UI_EMOJI.list} \`${location}\` — ${errorSummary}${fixNote} [${evidenceId}]`;
};

/**
 * Groups test failures by file path for compact display.
 */
interface GroupedFileEntry {
  readonly file: string;
  readonly failures: readonly ConsolidatedTestFailure[];
}

/**
 * Groups test failures by file for more compact display.
 * Filters out entries without valid file paths.
 */
const groupTestFailuresByFile = (
  testFailures: readonly ConsolidatedTestFailure[]
): GroupedFileEntry[] => {
  const groups = new Map<string, ConsolidatedTestFailure[]>();

  testFailures.forEach((testFailure) => {
    // Skip failures without valid file paths - don't group as "unknown"
    const { file } = testFailure;
    if (!file || file === "unknown" || !extractValidFileLocation(file, testFailure.line ?? 0)) {
      return;
    }
    const existing = groups.get(file) ?? [];
    groups.set(file, [...existing, testFailure]);
  });

  return Array.from(groups.entries()).map(([file, failures]) => ({ file, failures }));
};

/**
 * Formats a grouped file entry showing count if multiple assertions.
 */
const formatGroupedFileEntry = (group: GroupedFileEntry, startIndex: number): readonly string[] => {
  const { file, failures } = group;

  // If only one failure, format normally
  if (failures.length === 1) {
    const formatted = formatTestFailureEntry(failures[0], startIndex);
    return formatted ? [formatted] : [];
  }

  // Multiple failures in same file - show file header with count, then individual errors
  const lines: string[] = [];
  const basePath = file;
  const displayedFailures = failures.slice(0, GITHUB_COMMENT_DISPLAY.MAX_ASSERTIONS_PER_FILE);

  // Show file with assertion count
  lines.push(`   ${UI_EMOJI.list} \`${basePath}\` (${failures.length} assertions)`);

  // Show individual assertions (indented) - only show meaningful errors
  displayedFailures.forEach((failure, failureIndex) => {
    const normalizedError = failure.error ? sanitizeTestFailureMessage(failure.error) : "";
    // Skip entries without meaningful error content - don't show "assertion failed"
    if (normalizedError.length === 0) {
      return;
    }
    const lineNum = failure.line ? `:${failure.line}` : "";
    const evidenceId = generateTestEvidenceId(startIndex + failureIndex);
    lines.push(`      - ${lineNum} ${normalizedError} [${evidenceId}]`);
  });

  if (failures.length > displayedFailures.length) {
    lines.push(`      - _...and ${failures.length - displayedFailures.length} more assertions_`);
  }

  return lines;
};

// ==================== Block Builders ====================

/**
 * Build consolidated affected files block for assertion failures and annotations.
 * Combines annotations and test failures into a single unified view.
 * Groups same-file entries and adds evidence IDs.
 * Note: Infrastructure issues are displayed in a separate top-level block.
 */
export const buildAnnotationsBlock = (
  annotations: readonly ConsolidatedAnnotation[],
  testFailures: readonly ConsolidatedTestFailure[] = []
): SlackTextBlock | null => {
  const displayLimit = DISPLAY_LIMITS.slackAnnotationsPerCheck;

  // Partition test failures - only show assertion failures here
  // Infrastructure issues are displayed in a separate buildInfrastructureIssuesBlock
  const { assertions } = partitionByFailureType(testFailures);

  // Format annotation entries with evidence IDs
  const formattedAnnotations = annotations
    .map((annotation, annotationIndex) => formatAnnotationEntryWithId(annotation, annotationIndex))
    .filter((line): line is string => Boolean(line));

  // Group assertion failures by file for compact display
  const groupedAssertions = groupTestFailuresByFile(assertions);
  const assertionLines: string[] = [];
  let testIndex = 0;
  groupedAssertions.forEach((group) => {
    const formatted = formatGroupedFileEntry(group, testIndex);
    assertionLines.push(...formatted);
    testIndex += group.failures.length;
  });

  const unlocatedAssertions = assertions.filter(
    (failure) => !failure.file || !extractValidFileLocation(failure.file, failure.line ?? 0)
  );
  const unlocatedLines = unlocatedAssertions.map((failure) => {
    const testName = truncateText(
      failure.testName,
      FORMATTER_DISPLAY_LIMITS.SLACK_TEST_NAME_LENGTH
    );
    const normalizedError = failure.error ? sanitizeTestFailureMessage(failure.error) : "";
    const display =
      normalizedError.length > 0 ? `${testName} — ${normalizedError}` : testName || "Test failed";
    const evidenceIndex = assertions.indexOf(failure);
    const evidenceTag = evidenceIndex >= 0 ? ` [${generateTestEvidenceId(evidenceIndex)}]` : "";
    return `   ${UI_EMOJI.failedFile} ${display}${evidenceTag}`;
  });

  const totalDisplayLines =
    formattedAnnotations.length + assertionLines.length + unlocatedLines.length;
  const validAnnotations = annotations.filter((annotation) =>
    Boolean(extractValidFileLocation(annotation.path, annotation.line))
  );
  // Only count assertion failures for file count (infra shown separately)
  const validAssertions = assertions.filter(
    (failure) => failure.file && extractValidFileLocation(failure.file, failure.line ?? 0)
  );
  const uniqueFileCount = countUniqueFiles(validAssertions, validAnnotations);
  if (totalDisplayLines === 0) {
    return null;
  }

  // Build sections: annotations first, then assertion failures
  const sections: string[] = [];

  // Format annotation entries (prioritize these)
  const annotationSlots = Math.min(formattedAnnotations.length, displayLimit);
  if (annotationSlots > 0) {
    sections.push(...formattedAnnotations.slice(0, annotationSlots));
  }

  // Calculate remaining slots for assertion failures
  const remainingSlots = Math.max(0, displayLimit - annotationSlots);
  if (remainingSlots > 0 && assertionLines.length > 0) {
    sections.push(...assertionLines.slice(0, remainingSlots));
  }

  const remainingAfterAssertions = Math.max(
    0,
    remainingSlots - Math.min(assertionLines.length, remainingSlots)
  );
  if (remainingAfterAssertions > 0 && unlocatedLines.length > 0) {
    sections.push(...unlocatedLines.slice(0, remainingAfterAssertions));
  }

  // Calculate overflow
  const displayedCount =
    annotationSlots +
    Math.min(assertionLines.length, remainingSlots) +
    Math.min(unlocatedLines.length, remainingAfterAssertions);
  const overflowCount = totalDisplayLines - displayedCount;
  const moreText = overflowCount > 0 ? `\n   _...and ${overflowCount} more_` : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${UI_EMOJI.location} *Affected Files (${uniqueFileCount}):*\n${sections.join(
          "\n"
        )}${moreText}`,
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

/**
 * Build infrastructure issues block as a separate top-level section.
 * Voice Guide requires infra issues to appear BEFORE At a Glance section.
 *
 * @param testFailures - Array of test failures to partition
 * @returns Infrastructure issues block or null if no infra issues
 */
export const buildInfrastructureIssuesBlock = (
  testFailures: readonly ConsolidatedTestFailure[]
): SlackTextBlock | null => {
  if (testFailures.length === 0) {
    return null;
  }

  // Partition test failures to extract infrastructure issues
  const { timeouts, infra } = partitionByFailureType(testFailures);
  const infraIssues = [...timeouts, ...infra];

  if (infraIssues.length === 0) {
    return null;
  }

  const displayLimit = DISPLAY_LIMITS.slackAnnotationsPerCheck;
  const displayedIssues = infraIssues.slice(0, displayLimit);

  // Format infra issues with warning icon and evidence IDs
  const infraLines = displayedIssues
    .map((failure, failureIndex) => {
      const location = failure.file
        ? extractValidFileLocation(failure.file, failure.line ?? 0)
        : null;
      const locationDisplay = location ? `\`${location}\`` : "Unknown location";
      const normalizedError = failure.error
        ? sanitizeTestFailureMessage(failure.error)
        : "Infrastructure issue";
      const evidenceId = generateTestEvidenceId(failureIndex);
      return `   ${UI_EMOJI.warning} ${locationDisplay} — ${normalizedError} [${evidenceId}]`;
    })
    .filter((line): line is string => Boolean(line));

  if (infraLines.length === 0) {
    return null;
  }

  const overflowCount = infraIssues.length - displayedIssues.length;
  const moreText =
    overflowCount > 0 ? `\n   _...and ${overflowCount} more infrastructure issues_` : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${UI_EMOJI.infraWarning} *Infrastructure Issues (${infraIssues.length}):*\n${infraLines.join("\n")}${moreText}`,
      },
    ],
  };
};

/**
 * Build flaky test warning block if flaky tests are detected.
 * Shows a prominent warning when tests show signs of intermittent failure patterns.
 *
 * @param testFailures - Array of test failures to check
 * @returns Warning block or null if no flaky tests detected
 */
export const buildFlakyTestWarningBlock = (
  testFailures: readonly ConsolidatedTestFailure[]
): SlackTextBlock | null => {
  if (testFailures.length === 0) {
    return null;
  }

  // Convert to format expected by detectFlakyTests
  const flakyResult = detectFlakyTests(
    testFailures.map((failure) => ({
      testName: failure.testName ?? failure.file ?? "unknown",
      file: failure.file,
      error: failure.error,
    }))
  );

  if (!flakyResult.hasFlakyTests) {
    return null;
  }

  const warningMessage = formatFlakyTestWarning(flakyResult);
  if (!warningMessage) {
    return null;
  }

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: warningMessage,
      },
    ],
  };
};
