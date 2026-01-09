/**
 * PR Comment Formatter
 *
 * Formats aggregated CI failures into GitHub PR comments.
 * Produces clean, organized markdown output with consolidated failure details
 * and recommended actions.
 */

import {
  UI_EMOJI,
  UI_CONSTANTS,
  ANNOTATION_LEVEL_EMOJI_MAP,
  FORMATTER_DISPLAY_LIMITS,
  deduplicateByKey,
  normalizeTestFailure,
  truncateText,
  normalizeTestFilePath,
  sanitizeTestFailureMessage,
  canonicalizeEvidencePaths,
  extractServiceFromPath,
  GITHUB_COMMENT_DISPLAY,
  FILE_PATH_VALIDATION,
  extractMeaningfulCause,
  summarizeRootCauses,
  isTestFile,
  countUniqueSuites,
  generateTestEvidenceId,
  generateAnnoEvidenceId,
  partitionByFailureType,
  type AggregatedFailures,
  type AnalyzedFailure,
  type CodeAnnotation,
  type RecommendedAction,
} from "@kenchi/shared";
import {
  getPriorityEmoji,
  calculateConfidenceWithUncertainty,
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

const MAX_ASSERTIONS_PER_FILE = 2;
const LOW_SIGNAL_CAUSE_FALLBACK = "_No high-signal root cause detected. See Affected Files._";

// ==================== Pure Helper Functions ====================

const stripEvidencePrefix = (message: string): string =>
  message.replace(FILE_PATH_VALIDATION.EVIDENCE_PREFIX_PATTERN, "");

/**
 * Normalizes annotation/error message for display.
 * Uses extractMeaningfulCause to find meaningful assertion details,
 * filtering out useless content like matcher names and test runner markers.
 */
const normalizeAnnotationMessage = (message: string): string => {
  const stripped = stripEvidencePrefix(message).trim();
  // Use extractMeaningfulCause which filters out useless content
  // It already calls extractAssertionSnippet internally with proper filtering
  const meaningful = extractMeaningfulCause(stripped);
  if (meaningful && meaningful.length > 5) {
    return truncateText(meaningful, GITHUB_COMMENT_DISPLAY.MAX_ANNOTATION_MESSAGE_LENGTH);
  }
  // Return empty string if no meaningful content (better than showing useless content)
  return "";
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
 * Counts unique, displayable file paths from annotations and test failures.
 * Uses the same path validation logic as the Affected Files section.
 */
const countDisplayableFiles = (
  annotations: readonly ConsolidatedAnnotation[],
  testFailures: readonly ConsolidatedTestFailure[]
): number => {
  const uniqueFiles = new Set<string>();

  annotations.forEach((annotation) => {
    const location = extractValidFileLocation(annotation.path, annotation.line);
    if (location) {
      const path = normalizeTestFilePath(location.split(":")[0] ?? annotation.path);
      uniqueFiles.add(path);
    }
  });

  testFailures.forEach((testFailure) => {
    if (!testFailure.file) {
      return;
    }
    const location = extractValidFileLocation(testFailure.file, testFailure.line ?? 0);
    if (location) {
      const path = normalizeTestFilePath(location.split(":")[0] ?? testFailure.file);
      uniqueFiles.add(path);
    }
  });

  return uniqueFiles.size;
};

/**
 * Consolidate test failures across checks using Map-based deduplication.
 * Deduplicates by file:line to show each location once.
 * Keeps the entry with the most informative error (sorted first).
 */
const consolidateTestFailures = (
  testFailures: readonly ConsolidatedTestFailure[]
): ConsolidatedTestFailure[] => {
  const allFailures = [...testFailures];

  // Sort to prioritize entries with meaningful errors
  const sorted = [...allFailures].sort(
    (left, right) => Number(Boolean(right.error)) - Number(Boolean(left.error))
  );

  // Normalize first, then deduplicate by file:line
  const normalized = sorted.map((testFailure) => normalizeTestFailure(testFailure));

  return deduplicateByKey(normalized, (testFailure) => {
    // Deduplicate by file:line to show each location once
    const file = testFailure.file ?? "";
    const line = testFailure.line ?? 0;
    return file ? `${file}:${line}` : testFailure.testName;
  });
};

/**
 * Consolidate annotations across checks using Map-based deduplication.
 * Shows ALL annotations - language agnostic, no path exclusions.
 */
const consolidateAnnotations = (annotations: readonly CodeAnnotation[]): ConsolidatedAnnotation[] =>
  deduplicateByKey(annotations, (annotation) => `${annotation.path}:${annotation.line}`).map(
    (annotation) => ({
      path: annotation.path,
      line: annotation.line,
      message: annotation.message,
      level: annotation.level,
      title: annotation.title,
      suggestedFix: annotation.suggestedFix?.description,
    })
  );

// ==================== Formatting Functions ====================

/**
 * Format a recommended action as markdown
 */
const formatAction = (action: RecommendedAction, index: number): string =>
  `${index + 1}. ${getPriorityEmoji(action.priority)} ${action.description}`;

/**
 * Header configuration for building the header section.
 */
interface HeaderConfig {
  readonly commitSha: string;
  readonly failureCount: number;
  readonly confidence: number;
  readonly uncertainty?: string;
  readonly suiteCount: number;
  readonly fileCount: number;
  readonly prContext: AggregatedFailures["prContext"];
}

/**
 * Build header section with suite/file counts and uncertainty display.
 */
const buildHeader = (headerConfig: HeaderConfig): string[] => {
  const { commitSha, failureCount, confidence, uncertainty, suiteCount, fileCount, prContext } =
    headerConfig;
  const confidencePercent = Math.round(confidence * UI_CONSTANTS.PERCENTAGE_MULTIPLIER);

  // Format confidence with uncertainty note if present
  const confidenceText = uncertainty
    ? `${confidencePercent}% _(${uncertainty})_`
    : `${confidencePercent}%`;

  // Format suite/file counts (only show suite count if we have test failures)
  const statsLine =
    suiteCount > 0
      ? `**Test Suites Failed:** ${suiteCount} | **Affected Files:** ${fileCount}`
      : `**Affected Files:** ${fileCount}`;

  const lines = [
    `## ${UI_EMOJI.robot} KenchiOps CI Failure Analysis`,
    "",
    `**Commit:** \`${commitSha.substring(0, 7)}\``,
    `**Failed Checks:** ${failureCount}`,
    statsLine,
    `**Overall Confidence:** ${confidenceText}`,
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
 * Build clustered root cause section with evidence IDs.
 * Groups causes by service/package for organized display.
 *
 * @param failures - Array of analyzed failures to cluster
 * @returns Array of markdown lines for the root cause section
 */
const buildClusteredRootCauseSection = (failures: readonly AnalyzedFailure[]): string[] => {
  const summary = summarizeRootCauses(failures, {
    maxEntries: FORMATTER_DISPLAY_LIMITS.MAX_ROOT_CAUSES,
  });

  if (summary.totalClusters === 0) {
    return [];
  }

  const lines: string[] = [`### ${UI_EMOJI.search} Root Cause`, ""];

  if (summary.entries.length === 0) {
    lines.push(LOW_SIGNAL_CAUSE_FALLBACK);
    if (summary.lowSignalCount > 0) {
      lines.push(
        `_${summary.lowSignalCount} service${
          summary.lowSignalCount === 1 ? "" : "s"
        } with assertion-only failures. See Affected Files._`
      );
    }
    lines.push("");
    return lines;
  }

  summary.entries.forEach((entry) => {
    const fileLabel = entry.fileCount === 1 ? "file" : "files";
    const evidenceDisplay =
      entry.evidenceIds.length > 0 ? ` [${entry.evidenceIds.slice(0, 3).join(", ")}]` : "";

    lines.push(`**${entry.service}** (${entry.fileCount} ${fileLabel})${evidenceDisplay}`);

    const locationSuffix = entry.location ? ` (${entry.location})` : "";
    if (entry.cause) {
      const truncatedError = truncateText(
        entry.cause,
        GITHUB_COMMENT_DISPLAY.MAX_ANNOTATION_MESSAGE_LENGTH
      );
      lines.push(`  - ${truncatedError}${locationSuffix}`);
      return;
    }

    if (entry.primaryTestName && !isTestFile(entry.primaryTestName)) {
      const testName = truncateText(
        entry.primaryTestName,
        GITHUB_COMMENT_DISPLAY.MAX_TEST_NAME_LENGTH
      );
      lines.push(`  - Test failure in ${testName}${locationSuffix}`);
      return;
    }

    if (entry.location) {
      lines.push(`  - Failures in ${entry.location}`);
      return;
    }

    lines.push("  - See details below");
  });

  if (summary.hiddenCount > 0) {
    lines.push(
      `_...and ${summary.hiddenCount} more service${
        summary.hiddenCount === 1 ? "" : "s"
      } affected._`
    );
  }

  if (summary.lowSignalCount > 0) {
    lines.push(
      `_${summary.lowSignalCount} service${
        summary.lowSignalCount === 1 ? "" : "s"
      } with assertion-only failures. See Affected Files._`
    );
  }

  lines.push("");
  return lines;
};

/**
 * Entry representing an affected file with its display information.
 */
interface AffectedFileEntry {
  readonly path: string;
  readonly location: string | null;
  readonly display: string;
  readonly level: CodeAnnotation["level"];
  readonly title?: string;
  readonly evidenceId?: string;
  readonly isInfra?: boolean;
}

/**
 * Groups entries by file path for deduplication display.
 */
interface GroupedFileEntries {
  readonly file: string;
  readonly entries: readonly AffectedFileEntry[];
}

/**
 * Groups affected file entries by file path.
 * Used to show count when multiple assertions in same file.
 */
const groupEntriesByFile = (entries: readonly AffectedFileEntry[]): GroupedFileEntries[] => {
  const groups = new Map<string, AffectedFileEntry[]>();

  entries.forEach((entry) => {
    const file = entry.path;
    const existing = groups.get(file) ?? [];
    groups.set(file, [...existing, entry]);
  });

  return Array.from(groups.entries()).map(([file, groupedEntries]) => ({
    file,
    entries: groupedEntries,
  }));
};

/**
 * Build consolidated affected files section with evidence IDs, infra separation, and grouping.
 * Combines annotations and test failures into a single unified view.
 * Shows infra issues prominently at top, then groups by service/package.
 *
 * @param annotations - Consolidated annotation entries
 * @param testFailures - Consolidated test failure entries
 * @returns Array of markdown lines for the affected files section
 */
const buildAnnotationsSection = (
  annotations: readonly ConsolidatedAnnotation[],
  testFailures: readonly ConsolidatedTestFailure[] = []
): string[] => {
  // Partition test failures into assertions vs infra/timeout
  const { assertions, timeouts, infra } = partitionByFailureType(testFailures);
  const infraIssues = [...timeouts, ...infra];

  // Build annotation entries with evidence IDs
  const annotationEntries: AffectedFileEntry[] = annotations.map((annotation, annotationIndex) => {
    const message = normalizeAnnotationMessage(annotation.message);
    const fixNote = annotation.suggestedFix
      ? ` Fix: ${normalizeAnnotationMessage(annotation.suggestedFix)}`
      : "";
    return {
      path: normalizeTestFilePath(annotation.path),
      location: extractValidFileLocation(annotation.path, annotation.line),
      display: `${message}${fixNote}`.trim(),
      level: annotation.level,
      title:
        annotation.title && !FILE_PATH_VALIDATION.EVIDENCE_TITLE_PATTERN.test(annotation.title)
          ? annotation.title
          : undefined,
      evidenceId: generateAnnoEvidenceId(annotationIndex),
      isInfra: false,
    };
  });

  // Build assertion test failure entries with evidence IDs
  const assertionEntries: AffectedFileEntry[] = assertions.map((testFailure, testIndex) => {
    const normalizedPath = testFailure.file ? normalizeTestFilePath(testFailure.file) : "";
    const location = testFailure.file
      ? extractValidFileLocation(testFailure.file, testFailure.line ?? 0)
      : null;
    const testName = truncateText(
      testFailure.testName,
      GITHUB_COMMENT_DISPLAY.MAX_TEST_NAME_LENGTH
    );
    const normalizedError = testFailure.error
      ? truncateText(
          sanitizeTestFailureMessage(testFailure.error),
          GITHUB_COMMENT_DISPLAY.MAX_ANNOTATION_MESSAGE_LENGTH
        )
      : "";
    const errorIsMeaningful =
      normalizedError.length > 0 &&
      !normalizedError.toLowerCase().includes(testFailure.testName.toLowerCase().slice(0, 20));
    const testNameIsPath = isTestFile(testFailure.testName);
    const display = errorIsMeaningful
      ? `Test failed: ${normalizedError}`
      : testNameIsPath
        ? "Test failed"
        : `Test failed: ${testName}`;

    return {
      path: normalizedPath,
      location,
      display,
      level: "failure" as CodeAnnotation["level"],
      title: undefined,
      evidenceId: generateTestEvidenceId(testIndex),
      isInfra: false,
    };
  });

  // Build infra issue entries with evidence IDs (continue numbering from assertions)
  const infraEntries: AffectedFileEntry[] = infraIssues.map((testFailure, infraIndex) => {
    const normalizedPath = testFailure.file ? normalizeTestFilePath(testFailure.file) : "";
    const location = testFailure.file
      ? extractValidFileLocation(testFailure.file, testFailure.line ?? 0)
      : null;
    const normalizedError = testFailure.error
      ? truncateText(
          sanitizeTestFailureMessage(testFailure.error),
          GITHUB_COMMENT_DISPLAY.MAX_ANNOTATION_MESSAGE_LENGTH
        )
      : "Infrastructure issue";

    return {
      path: normalizedPath,
      location,
      display: normalizedError,
      level: "failure" as CodeAnnotation["level"],
      title: undefined,
      evidenceId: generateTestEvidenceId(assertions.length + infraIndex),
      isInfra: true,
    };
  });

  const allAssertionEntries = [...annotationEntries, ...assertionEntries].filter(
    (entry) => entry.location && entry.path
  );
  const validInfraEntries = infraEntries.filter((entry) => entry.location && entry.path);

  const totalEntries = allAssertionEntries.length + validInfraEntries.length;
  if (totalEntries === 0) {
    return [];
  }

  const uniqueFileCount = countDisplayableFiles(annotations, testFailures);
  const lines: string[] = [`### ${UI_EMOJI.location} Affected Files (${uniqueFileCount})`, ""];

  // Show infra issues prominently at top
  if (validInfraEntries.length > 0) {
    lines.push(`**${UI_EMOJI.warning} Infrastructure Issues (${validInfraEntries.length})**`);
    validInfraEntries.forEach((entry) => {
      const location = entry.location ? `\`${entry.location}\`` : "";
      const evidenceTag = entry.evidenceId ? ` [${entry.evidenceId}]` : "";
      lines.push(`  - ${UI_EMOJI.warning} ${location} - ${entry.display}${evidenceTag}`);
    });
    lines.push("");
  }

  // Group assertion entries by service, then by file within service
  const serviceGroups = new Map<string, AffectedFileEntry[]>();
  allAssertionEntries.forEach((entry) => {
    const service = extractServiceFromPath(entry.path);
    const existing = serviceGroups.get(service) ?? [];
    serviceGroups.set(service, [...existing, entry]);
  });

  // Format each service group with file grouping
  serviceGroups.forEach((entries, service) => {
    const fileGroups = groupEntriesByFile(entries);
    const fileCount = fileGroups.length === 1 ? "1 file" : `${fileGroups.length} files`;
    lines.push(`**${service}** (${fileCount})`);

    fileGroups.forEach((group) => {
      if (group.entries.length === 1) {
        // Single entry - show normally
        const entry = group.entries[0];
        const icon = ANNOTATION_LEVEL_EMOJI_MAP[entry.level ?? "failure"] ?? UI_EMOJI.info;
        const location = entry.location ? `\`${entry.location}\`` : "";
        const title = entry.title ? `**${entry.title}**: ` : "";
        const evidenceTag = entry.evidenceId ? ` [${entry.evidenceId}]` : "";
        lines.push(`  - ${icon} ${location} - ${title}${entry.display}${evidenceTag}`);
      } else {
        // Multiple entries in same file - group with count
        const firstEntry = group.entries[0];
        const location = firstEntry.location?.split(":")[0] ?? group.file;
        lines.push(`  - ${UI_EMOJI.failure} \`${location}\` (${group.entries.length} assertions)`);
        const displayedEntries = group.entries.slice(0, MAX_ASSERTIONS_PER_FILE);
        displayedEntries.forEach((entry) => {
          const lineNum = entry.location?.includes(":") ? `:${entry.location.split(":")[1]}` : "";
          const evidenceTag = entry.evidenceId ? ` [${entry.evidenceId}]` : "";
          lines.push(`    - ${lineNum} ${entry.display}${evidenceTag}`);
        });
        if (group.entries.length > displayedEntries.length) {
          lines.push(
            `    - _...and ${group.entries.length - displayedEntries.length} more assertions_`
          );
        }
      }
    });
  });

  lines.push("");
  return lines;
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
 * Includes clustered root causes, evidence IDs, and multi-module uncertainty detection.
 *
 * @param aggregation - Aggregated failures for the commit
 * @param feedbackLinks - Optional feedback URLs for user rating
 * @returns Formatted markdown string for the PR comment
 */
export const buildConsolidatedPRComment = (
  aggregation: AggregatedFailures,
  feedbackLinks?: FeedbackLinks
): string => {
  const { failures, commitSha, prContext } = aggregation;

  // Calculate confidence with multi-module uncertainty detection
  const { confidence, uncertainty } = calculateConfidenceWithUncertainty(failures);
  const mergedActions = mergeRecommendedActions(failures);

  // Pre-compute consolidated data (O(n) with Map-based deduplication)
  const rawTestFailures = failures.flatMap((failure) => failure.testFailures ?? []);
  const rawAnnotations = failures.flatMap((failure) => failure.annotations ?? []);
  const { testFailures: canonicalTestFailures, annotations: canonicalAnnotations } =
    canonicalizeEvidencePaths(rawTestFailures, rawAnnotations);
  const testFailures = consolidateTestFailures(canonicalTestFailures);
  const annotations = consolidateAnnotations(canonicalAnnotations);

  // Calculate suite and file counts
  const suiteCount = countUniqueSuites(testFailures);
  const fileCount = countDisplayableFiles(annotations, testFailures);

  // Build all sections (test failures consolidated into Affected Files)
  const lines: string[] = [
    ...buildHeader({
      commitSha,
      failureCount: failures.length,
      confidence,
      uncertainty,
      suiteCount,
      fileCount,
      prContext,
    }),
    "",
    "---",
    ...buildCheckNamesSection(failures),
    ...buildClusteredRootCauseSection(failures),
    ...buildAnnotationsSection(annotations, testFailures),
    ...buildActionsSection(mergedActions),
    ...buildFeedbackSection(feedbackLinks),
    "---",
    "*Generated by KenchiOps DevOps Assistant*",
  ];

  return lines.join("\n");
};
