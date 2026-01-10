/* eslint-disable max-lines */
/**
 * PR Comment Formatter
 *
 * Formats aggregated CI failures into GitHub PR comments.
 * Produces clean, organized markdown output with consolidated failure details
 * and recommended actions.
 *
 * Note: This file exceeds the 500-line limit due to the comprehensive Voice Guide
 * formatting requirements. The formatter handles multiple sections (header, checks,
 * infrastructure, flaky warnings, at-a-glance, root cause, affected files, actions,
 * PR context, feedback) each requiring dedicated helper functions.
 */

import {
  UI_EMOJI,
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
  detectFlakyTests,
  formatFlakyTestWarning,
  selectMessageVariant,
  correlatePRContext,
  buildPRContextSection,
  formatConfidenceWithLabel,
  clusterFailuresByService,
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
  readonly serviceCount: number;
  readonly prContext: AggregatedFailures["prContext"];
}

/**
 * Build header section with suite/file counts and uncertainty display.
 * Voice Guide format: "49% (moderate certainty)"
 */
const buildHeader = (headerConfig: HeaderConfig): string[] => {
  const {
    commitSha,
    failureCount,
    confidence,
    uncertainty,
    suiteCount,
    fileCount,
    serviceCount,
    prContext,
  } = headerConfig;

  // Voice Guide: Format confidence with label phrase (e.g., "72% (high certainty)")
  const confidenceText = formatConfidenceWithLabel(confidence);

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
    `**Services Affected:** ${serviceCount}`,
    `**Overall Confidence:** ${confidenceText}`,
  ];

  // Add uncertainty note if present (separate from confidence label)
  if (uncertainty) {
    lines.push(`_Note: ${uncertainty}_`);
  }

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
 * Build Infrastructure Issues section.
 * Voice Guide: Display separately at the TOP, before At a Glance.
 */
const buildInfrastructureIssuesSection = (
  testFailures: readonly ConsolidatedTestFailure[]
): string[] => {
  if (testFailures.length === 0) {
    return [];
  }

  const { timeouts, infra } = partitionByFailureType(testFailures);
  const infraIssues = [...timeouts, ...infra];

  if (infraIssues.length === 0) {
    return [];
  }

  const lines: string[] = [
    "",
    `> ${UI_EMOJI.infraWarning} **Infrastructure Issues (${infraIssues.length})**`,
  ];

  infraIssues.forEach((issue, issueIndex) => {
    const file = issue.file ? `\`${issue.file}\`` : "Unknown location";
    const error = issue.error
      ? truncateText(issue.error, GITHUB_COMMENT_DISPLAY.MAX_ANNOTATION_MESSAGE_LENGTH)
      : "Infrastructure issue";
    const evidenceId = generateTestEvidenceId(issueIndex);
    lines.push(`> - ${file} - ${error} [${evidenceId}]`);
  });

  lines.push("");
  return lines;
};

/**
 * Build "At a Glance" section with primary and secondary blockers.
 * Voice Guide: 1-3 bullets, primary + secondary causes.
 * Skipped for COMPACT variant (Voice Guide: COMPACT goes straight to Root Cause).
 *
 * @param failures - Array of analyzed failures
 * @param variant - Message variant ("COMPACT" | "STANDARD" | "EXPANDED")
 * @returns Array of markdown lines or empty array for COMPACT
 */
const buildAtAGlanceSection = (
  failures: readonly AnalyzedFailure[],
  variant: "COMPACT" | "STANDARD" | "EXPANDED"
): string[] => {
  // Voice Guide: COMPACT variant skips At a Glance, goes straight to Root Cause
  if (variant === "COMPACT" || failures.length === 0) {
    return [];
  }

  const summary = summarizeRootCauses(failures, { maxEntries: 3 });
  if (summary.totalClusters === 0) {
    return [];
  }

  const lines: string[] = ["", `### ${UI_EMOJI.search} What Failed (At a Glance)`, ""];

  summary.entries.forEach((entry, entryIndex) => {
    const label = entryIndex === 0 ? "**Primary:**" : "**Secondary:**";
    const causeText = entry.cause
      ? truncateText(entry.cause, GITHUB_COMMENT_DISPLAY.MAX_ANNOTATION_MESSAGE_LENGTH)
      : `${entry.service} failures`;
    lines.push(`- ${label} ${causeText}`);
  });

  lines.push("");
  return lines;
};

/**
 * Build clustered root cause section with Voice Guide numbered labels.
 * Voice Guide format:
 *   *1. Primary Root Cause (Fix First)*
 *   **Service:** `slack-bot`
 *   **Issue:** Jest fake timers not enabled
 *   **Evidence:** `actionHandler.test.ts:101` [test#1]
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

  // Voice Guide: Use numbered labels with explicit field names
  summary.entries.forEach((entry, entryIndex) => {
    const clusterNumber = entryIndex + 1;
    const clusterLabel =
      entryIndex === 0
        ? `**${clusterNumber}. Primary Root Cause (Fix First)**`
        : `**${clusterNumber}. Secondary Cluster**`;

    lines.push(clusterLabel);
    lines.push(`**Service:** \`${entry.service}\``);

    // Build issue description from cause or test name
    const issueText = entry.cause
      ? truncateText(entry.cause, GITHUB_COMMENT_DISPLAY.MAX_ANNOTATION_MESSAGE_LENGTH)
      : entry.primaryTestName && !isTestFile(entry.primaryTestName)
        ? `Test failure in ${truncateText(entry.primaryTestName, GITHUB_COMMENT_DISPLAY.MAX_TEST_NAME_LENGTH)}`
        : entry.location
          ? `Failures in ${entry.location}`
          : "See affected files below";

    lines.push(`**Issue:** ${issueText}`);

    // Evidence with location and evidence ID
    if (entry.location || entry.evidenceIds.length > 0) {
      const evidenceTag =
        entry.evidenceIds.length > 0 ? ` [${entry.evidenceIds.slice(0, 3).join(", ")}]` : "";
      const locationDisplay = entry.location ? `\`${entry.location}\`` : "See below";
      lines.push(`**Evidence:** ${locationDisplay}${evidenceTag}`);
    }

    lines.push(""); // Blank line between clusters
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
  // Partition test failures - only assertions shown here (infra displayed separately)
  const { assertions } = partitionByFailureType(testFailures);

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

  // Infrastructure issues are displayed in a separate top-level section
  // (buildInfrastructureIssuesSection) per Voice Guide requirements, not in Affected Files

  const allAssertionEntries = [...annotationEntries, ...assertionEntries].filter(
    (entry) => entry.location && entry.path
  );

  if (allAssertionEntries.length === 0) {
    return [];
  }

  const uniqueFileCount = countDisplayableFiles(annotations, testFailures);
  const lines: string[] = [`### ${UI_EMOJI.location} Affected Files (${uniqueFileCount})`, ""];

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
        lines.push(
          `  - ${UI_EMOJI.failedFile} \`${location}\` (${group.entries.length} assertions)`
        );
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

/**
 * Build flaky test warning section if flaky tests are detected.
 * Shows a prominent warning when tests show signs of intermittent failure patterns.
 */
const buildFlakyWarningSection = (testFailures: readonly ConsolidatedTestFailure[]): string[] => {
  if (testFailures.length === 0) {
    return [];
  }

  const flakyResult = detectFlakyTests(
    testFailures.map((failure) => ({
      testName: failure.testName,
      file: failure.file,
      error: failure.error,
    }))
  );

  if (!flakyResult.hasFlakyTests) {
    return [];
  }

  const warningMessage = formatFlakyTestWarning(flakyResult);
  if (!warningMessage) {
    return [];
  }

  return ["", warningMessage, ""];
};

/**
 * Build PR context section showing linked issues and correlated changes.
 * Only shows when meaningful correlation exists between changes and failures.
 */
const buildPRContextCorrelationSection = (
  prContext: AggregatedFailures["prContext"],
  failingTestFiles: readonly string[]
): string[] => {
  if (!prContext) {
    return [];
  }

  const correlation = correlatePRContext(
    prContext.commitMessage,
    prContext.changedFiles,
    failingTestFiles
  );

  if (!correlation.hasCorrelation) {
    return [];
  }

  const contextLines = buildPRContextSection(
    correlation.linkedIssues,
    correlation.correlatedFailures
  );
  if (contextLines.length === 0) {
    return [];
  }

  return ["", `## ${UI_EMOJI.link} PR Context`, "", ...contextLines, ""];
};

/**
 * Build "View Full Report" link for expanded variant.
 * Links to the GitHub commit checks page for comprehensive details.
 */
const buildFullReportLinkSection = (
  repository: AggregatedFailures["repository"],
  commitSha: string,
  showLink: boolean
): string[] => {
  if (!showLink) {
    return [];
  }

  const checksUrl = `https://github.com/${repository.fullName}/commit/${commitSha}/checks`;
  return [
    "",
    `> ${UI_EMOJI.link} [View Full Report on GitHub](${checksUrl}) — Complete logs and annotations`,
    "",
  ];
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
  const { failures, commitSha, prContext, repository } = aggregation;

  // Phase 5: Select message variant based on failure complexity
  const variantResult = selectMessageVariant(
    failures.map((failure) => {
      const firstTestPath = failure.testFailures?.[0]?.file;
      const service = firstTestPath ? extractServiceFromPath(firstTestPath) : undefined;
      return { checkName: failure.checkName, service };
    })
  );

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

  // Calculate suite, file, and service counts
  const suiteCount = countUniqueSuites(testFailures);
  const fileCount = countDisplayableFiles(annotations, testFailures);
  const serviceClusters = clusterFailuresByService(failures);
  const serviceCount = serviceClusters.size;

  // Extract failing test file paths for PR context correlation
  const failingTestFiles = testFailures
    .map((failure) => failure.file)
    .filter((file): file is string => Boolean(file));

  // Build all sections (test failures consolidated into Affected Files)
  const lines: string[] = [
    ...buildHeader({
      commitSha,
      failureCount: failures.length,
      confidence,
      uncertainty,
      suiteCount,
      fileCount,
      serviceCount,
      prContext,
    }),
    "",
    "---",
    ...buildCheckNamesSection(failures),
    ...buildInfrastructureIssuesSection(testFailures),
    ...buildFlakyWarningSection(testFailures),
    ...buildPRContextCorrelationSection(prContext, failingTestFiles),
    ...buildAtAGlanceSection(failures, variantResult.variant),
    ...buildClusteredRootCauseSection(failures),
    ...buildAnnotationsSection(annotations, testFailures),
    ...buildActionsSection(mergedActions),
    ...buildFullReportLinkSection(repository, commitSha, variantResult.showFullReportLink),
    ...buildFeedbackSection(feedbackLinks),
    "---",
    "*Generated by KenchiOps DevOps Assistant*",
  ];

  return lines.join("\n");
};
