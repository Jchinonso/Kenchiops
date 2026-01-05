/**
 * PR Comment Formatter
 *
 * Formats aggregated CI failures into GitHub PR comments.
 * Produces clean, organized markdown output with consolidated failure details
 * and recommended actions.
 */

import {
  UI_EMOJI,
  ANNOTATION_LEVEL_EMOJI_MAP,
  deduplicateByKey,
  normalizeTestFailure,
  truncateText,
  GITHUB_COMMENT_DISPLAY,
  FILE_PATH_VALIDATION,
  type AggregatedFailures,
  type AnalyzedFailure,
  type CodeAnnotation,
  type RecommendedAction,
} from "@kenchi/shared";
import {
  getPriorityEmoji,
  calculateAverageConfidence,
  mergeRecommendedActions,
  formatFeedbackLinksContent,
  type FeedbackLinks,
} from "./formatterUtils.js";

// ==================== Types ====================

interface ConsolidatedTestFailure {
  readonly testName: string;
  readonly file?: string;
  readonly line?: number;
  readonly error?: string;
}

interface ConsolidatedAnnotation {
  readonly path: string;
  readonly line: number;
  readonly message: string;
  readonly level: CodeAnnotation["level"];
  readonly title?: string;
  readonly suggestedFix?: string;
}

// ==================== Pure Helper Functions ====================

const stripEvidencePrefix = (message: string): string =>
  message.replace(FILE_PATH_VALIDATION.EVIDENCE_PREFIX_PATTERN, "");

const normalizeAnnotationMessage = (message: string): string => {
  const trimmed = stripEvidencePrefix(message).trim();
  const firstLine = trimmed.split("\n").find((line) => line.trim().length > 0) ?? "";
  return truncateText(firstLine.trim(), GITHUB_COMMENT_DISPLAY.MAX_ANNOTATION_MESSAGE_LENGTH);
};

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
 * Consolidate test failures across checks using Map-based deduplication.
 * Normalizes test identifiers to extract file paths from test names.
 */
const consolidateTestFailures = (failures: readonly AnalyzedFailure[]): ConsolidatedTestFailure[] =>
  deduplicateByKey(
    [...failures.flatMap((failure) => failure.testFailures ?? [])].sort(
      (left, right) => Number(Boolean(right.error)) - Number(Boolean(left.error))
    ),
    (testFailure) => `${testFailure.testName}|${testFailure.file ?? ""}`
  ).map((testFailure) => normalizeTestFailure(testFailure));

/**
 * Consolidate annotations across checks using Map-based deduplication.
 * Shows ALL annotations - language agnostic, no path exclusions.
 */
const consolidateAnnotations = (failures: readonly AnalyzedFailure[]): ConsolidatedAnnotation[] =>
  deduplicateByKey(
    failures.flatMap((failure) => failure.annotations),
    (annotation) => `${annotation.path}:${annotation.line}`
  ).map((annotation) => ({
    path: annotation.path,
    line: annotation.line,
    message: annotation.message,
    level: annotation.level,
    title: annotation.title,
    suggestedFix: annotation.suggestedFix?.description,
  }));

/**
 * Extract unique root causes from failures
 */
const extractUniqueCauses = (failures: readonly AnalyzedFailure[]): string[] =>
  deduplicateByKey(
    failures.map((failure) => failure.identifiedCause ?? failure.analysis ?? "").filter(Boolean),
    (cause) => cause
  );

// ==================== Formatting Functions ====================

/**
 * Format a recommended action as markdown
 */
const formatAction = (action: RecommendedAction, index: number): string =>
  `${index + 1}. ${getPriorityEmoji(action.priority)} ${action.description}`;

/**
 * Build header section
 */
const buildHeader = (
  commitSha: string,
  failureCount: number,
  avgConfidence: number,
  prContext: AggregatedFailures["prContext"]
): string[] => {
  const lines = [
    `## ${UI_EMOJI.robot} KenchiOps CI Failure Analysis`,
    "",
    `**Commit:** \`${commitSha.substring(0, 7)}\``,
    `**Failed Checks:** ${failureCount}`,
    `**Overall Confidence:** ${Math.round(avgConfidence * 100)}%`,
  ];

  if (prContext) {
    lines.push(`**Branch:** \`${prContext.branch}\` → \`${prContext.baseBranch}\``);
  }

  return lines;
};

/**
 * Build check names section
 */
const buildCheckNamesSection = (failures: readonly AnalyzedFailure[]): string[] =>
  failures.length === 0
    ? []
    : ["", `**Checks:** ${failures.map((failure) => `\`${failure.checkName}\``).join(", ")}`, ""];

/**
 * Build root cause section with unique causes
 */
const buildRootCauseSection = (causes: readonly string[]): string[] => {
  if (causes.length === 0) {
    return [];
  }

  const causeText =
    causes.length === 1
      ? causes[0]
      : causes.map((cause, index) => `${index + 1}. ${cause}`).join("\n");

  return [`### ${UI_EMOJI.search} Root Cause`, "", causeText, ""];
};

/**
 * Build consolidated affected files section
 * Combines annotations and test failures into a single unified view
 */
const buildAnnotationsSection = (
  annotations: readonly ConsolidatedAnnotation[],
  testFailures: readonly ConsolidatedTestFailure[] = []
): string[] => {
  // Combine annotations and test failures into unified entries
  // Show fix if available, otherwise show error message
  const annotationEntries = annotations.map((annotation) => {
    const message = normalizeAnnotationMessage(annotation.message);
    const fixNote = annotation.suggestedFix
      ? ` Fix: ${normalizeAnnotationMessage(annotation.suggestedFix)}`
      : "";
    return {
      location: extractValidFileLocation(annotation.path, annotation.line),
      display: `${message}${fixNote}`.trim(),
      level: annotation.level,
      title:
        annotation.title && !FILE_PATH_VALIDATION.EVIDENCE_TITLE_PATTERN.test(annotation.title)
          ? annotation.title
          : undefined,
    };
  });

  // Test failures are pre-normalized via normalizeTestFailure() at consolidation
  // Apply same file path validation to prevent error text in location
  const testFailureEntries = testFailures.map((testFailure) => {
    const location = testFailure.file
      ? extractValidFileLocation(testFailure.file, testFailure.line ?? 0)
      : null;
    const testName = truncateText(
      testFailure.testName,
      GITHUB_COMMENT_DISPLAY.MAX_TEST_NAME_LENGTH
    );
    const normalizedError = testFailure.error ? normalizeAnnotationMessage(testFailure.error) : "";
    const isPathOnly = testFailure.file && testFailure.file === testFailure.testName;
    const isGenericName = testFailure.testName.trim().toLowerCase() === "test failed";
    const display =
      normalizedError && (isPathOnly || isGenericName)
        ? `Test failed: ${normalizedError}`
        : `Test failed: ${testName}`;

    return {
      location,
      display,
      level: "failure" as CodeAnnotation["level"],
      title: undefined as string | undefined,
    };
  });

  const allEntries = [...annotationEntries, ...testFailureEntries].filter(
    (entry) => entry.location
  );

  if (allEntries.length === 0) {
    return [];
  }

  // Build lines showing all affected files with fix/error details
  const allLines = allEntries.map((entry) => {
    const icon = ANNOTATION_LEVEL_EMOJI_MAP[entry.level ?? "failure"] ?? UI_EMOJI.info;
    const location = entry.location ? `\`${entry.location}\` - ` : "";
    const title = entry.title ? `**${entry.title}**: ` : "";
    return `  - ${icon} ${location}${title}${entry.display}`;
  });

  return [`### ${UI_EMOJI.location} Affected Files (${allLines.length})`, "", ...allLines, ""];
};

/**
 * Build recommended actions section
 */
const buildActionsSection = (actions: readonly RecommendedAction[]): string[] =>
  actions.length === 0
    ? []
    : ["---", "", `## ${UI_EMOJI.tools} Recommended Actions`, "", ...actions.map(formatAction), ""];

const buildFeedbackSection = (feedbackLinks?: FeedbackLinks): string[] => {
  if (!feedbackLinks) {
    return [];
  }

  return ["---", "", ...formatFeedbackLinksContent(feedbackLinks), ""];
};

// ==================== Public API ====================

/**
 * Build consolidated PR comment body from aggregated failures.
 * Creates a comprehensive markdown summary with deduplicated failure details.
 */
export const buildConsolidatedPRComment = (
  aggregation: AggregatedFailures,
  feedbackLinks?: FeedbackLinks
): string => {
  const { failures, commitSha, prContext } = aggregation;
  const avgConfidence = calculateAverageConfidence(failures);
  const mergedActions = mergeRecommendedActions(failures);

  // Pre-compute consolidated data (O(n) with Map-based deduplication)
  const testFailures = consolidateTestFailures(failures);
  const annotations = consolidateAnnotations(failures);
  const causes = extractUniqueCauses(failures);

  // Build all sections (test failures consolidated into Affected Files)
  const lines: string[] = [
    ...buildHeader(commitSha, failures.length, avgConfidence, prContext),
    "",
    "---",
    ...buildCheckNamesSection(failures),
    ...buildRootCauseSection(causes),
    ...buildAnnotationsSection(annotations, testFailures),
    ...buildActionsSection(mergedActions),
    ...buildFeedbackSection(feedbackLinks),
    "---",
    "*Generated by KenchiOps DevOps Assistant*",
  ];

  return lines.join("\n");
};
