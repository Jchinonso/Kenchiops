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

const MAX_ASSERTIONS_PER_FILE = 2;

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
  const displayedFailures = failures.slice(0, MAX_ASSERTIONS_PER_FILE);

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
 * Build consolidated affected files block with infra/assertion separation.
 * Combines annotations and test failures into a single unified view.
 * Groups same-file entries, adds evidence IDs, and separates infra issues.
 */
export const buildAnnotationsBlock = (
  annotations: readonly ConsolidatedAnnotation[],
  testFailures: readonly ConsolidatedTestFailure[] = []
): SlackTextBlock | null => {
  const displayLimit = DISPLAY_LIMITS.slackAnnotationsPerCheck;

  // Phase 8: Partition test failures into assertions vs infra/timeouts
  const { assertions, timeouts, infra } = partitionByFailureType(testFailures);
  const infraIssues = [...timeouts, ...infra];

  // Format annotation entries with evidence IDs
  const formattedAnnotations = annotations
    .map((annotation, annotationIndex) => formatAnnotationEntryWithId(annotation, annotationIndex))
    .filter((line): line is string => Boolean(line));

  // Phase 7: Group assertion failures by file
  const groupedAssertions = groupTestFailuresByFile(assertions);
  const assertionLines: string[] = [];
  let testIndex = 0;
  groupedAssertions.forEach((group) => {
    const formatted = formatGroupedFileEntry(group, testIndex);
    assertionLines.push(...formatted);
    testIndex += group.failures.length;
  });

  // Format infra issues separately (with special icon)
  const infraLines = infraIssues
    .map((failure, failureIndex) => {
      const location = failure.file
        ? extractValidFileLocation(failure.file, failure.line ?? 0)
        : null;
      if (!location) {
        return null;
      }
      const normalizedError = failure.error
        ? sanitizeTestFailureMessage(failure.error)
        : "Infrastructure issue";
      const evidenceId = generateTestEvidenceId(testIndex + failureIndex);
      return `   ${UI_EMOJI.warning} \`${location}\` — ${normalizedError} [${evidenceId}]`;
    })
    .filter((line): line is string => Boolean(line));

  const totalDisplayLines = formattedAnnotations.length + assertionLines.length + infraLines.length;
  const validAnnotations = annotations.filter((annotation) =>
    Boolean(extractValidFileLocation(annotation.path, annotation.line))
  );
  const validTestFailures = testFailures.filter(
    (failure) => failure.file && extractValidFileLocation(failure.file, failure.line ?? 0)
  );
  const uniqueFileCount = countUniqueFiles(validTestFailures, validAnnotations);
  if (totalDisplayLines === 0) {
    return null;
  }

  // Build sections: infra first (if any), then annotations, then test failures
  const sections: string[] = [];

  // Show infra issues prominently at top
  if (infraLines.length > 0) {
    sections.push(`*${UI_EMOJI.warning} Infrastructure Issues (${infraLines.length}):*`);
    sections.push(...infraLines.slice(0, Math.min(displayLimit, infraLines.length)));
    if (infraLines.length > displayLimit) {
      sections.push(`   _...and ${infraLines.length - displayLimit} more infra issues_`);
    }
    sections.push(""); // Empty line separator
  }

  // Calculate remaining slots after infra
  const infraUsed = Math.min(infraLines.length, displayLimit);
  const remainingAfterInfra = Math.max(0, displayLimit - infraUsed);

  // Format annotation entries (prioritize these)
  const annotationSlots = Math.min(formattedAnnotations.length, remainingAfterInfra);
  if (annotationSlots > 0) {
    sections.push(...formattedAnnotations.slice(0, annotationSlots));
  }

  // Calculate remaining slots for test failures
  const remainingSlots = Math.max(0, remainingAfterInfra - annotationSlots);
  if (remainingSlots > 0 && assertionLines.length > 0) {
    sections.push(...assertionLines.slice(0, remainingSlots));
  }

  // Calculate overflow
  const displayedCount =
    infraUsed + annotationSlots + Math.min(assertionLines.length, remainingSlots);
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
