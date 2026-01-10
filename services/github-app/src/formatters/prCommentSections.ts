/**
 * PR Comment Section Builders
 *
 * Functions that build individual sections of the PR comment.
 * Each function returns an array of markdown lines.
 */

import {
  UI_EMOJI,
  ANNOTATION_LEVEL_EMOJI_MAP,
  FORMATTER_DISPLAY_LIMITS,
  truncateText,
  normalizeTestFilePath,
  sanitizeTestFailureMessage,
  extractServiceFromPath,
  GITHUB_COMMENT_DISPLAY,
  FILE_PATH_VALIDATION,
  summarizeRootCauses,
  isTestFile,
  generateTestEvidenceId,
  generateAnnoEvidenceId,
  partitionByFailureType,
  detectFlakyTests,
  formatFlakyTestWarning,
  correlatePRContext,
  buildPRContextSection,
  formatConfidenceWithLabel,
  buildReviewActionText,
  type AggregatedFailures,
  type AnalyzedFailure,
  type RecommendedAction,
} from "@kenchi/shared";
import {
  getPriorityEmoji,
  formatFeedbackLinksContent,
  type FeedbackLinks,
} from "./formatterUtils.js";
import type {
  ConsolidatedTestFailure,
  ConsolidatedAnnotation,
  HeaderConfig,
  AffectedFileEntry,
} from "./prCommentTypes.js";
import {
  normalizeAnnotationMessage,
  extractValidFileLocation,
  countDisplayableFiles,
  groupEntriesByFile,
} from "./prCommentHelpers.js";

// ==================== Constants ====================

const LOW_SIGNAL_CAUSE_FALLBACK = "_No high-signal root cause detected. See Affected Files._";

// ==================== Action Formatter ====================

const formatAction = (action: RecommendedAction, index: number): readonly string[] => {
  const { servicePrefix, title, detail } = buildReviewActionText(
    action.description,
    action.reasoning
  );
  const titleLine = `${index + 1}. **${getPriorityEmoji(action.priority)} ${servicePrefix}${title}**`;
  const detailLine = `   ${detail}`;
  return [titleLine, detailLine];
};

// ==================== Header Section ====================

/**
 * Build header section with suite/file counts and uncertainty display.
 * Voice Guide format: "49% (moderate certainty)"
 */
export const buildHeader = (headerConfig: HeaderConfig): string[] => {
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

  const confidenceText = formatConfidenceWithLabel(confidence);

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
export const buildCheckNamesSection = (failures: readonly AnalyzedFailure[]): string[] =>
  failures.length === 0
    ? []
    : ["", `**Checks:** ${failures.map((failure) => `\`${failure.checkName}\``).join(", ")}`, ""];

// ==================== Infrastructure Section ====================

/**
 * Build Infrastructure Issues section.
 * Voice Guide: Display separately at the TOP, before At a Glance.
 */
export const buildInfrastructureIssuesSection = (
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
 * Build flaky test warning section if flaky tests are detected.
 */
export const buildFlakyWarningSection = (
  testFailures: readonly ConsolidatedTestFailure[]
): string[] => {
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

// ==================== Root Cause Sections ====================

/**
 * Build "At a Glance" section with primary and secondary blockers.
 * Voice Guide: 1-3 bullets, primary + secondary causes.
 * Skipped for COMPACT variant (Voice Guide: COMPACT goes straight to Root Cause).
 */
export const buildAtAGlanceSection = (
  failures: readonly AnalyzedFailure[],
  variant: "COMPACT" | "STANDARD" | "EXPANDED"
): string[] => {
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
 */
export const buildClusteredRootCauseSection = (failures: readonly AnalyzedFailure[]): string[] => {
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

  summary.entries.forEach((entry, entryIndex) => {
    const clusterNumber = entryIndex + 1;
    const clusterLabel =
      entryIndex === 0
        ? `**${clusterNumber}. Primary Root Cause (Fix First)**`
        : `**${clusterNumber}. Secondary Cluster**`;

    lines.push(clusterLabel);
    lines.push(`**Service:** \`${entry.service}\``);

    const issueText = entry.cause
      ? truncateText(entry.cause, GITHUB_COMMENT_DISPLAY.MAX_ANNOTATION_MESSAGE_LENGTH)
      : entry.primaryTestName && !isTestFile(entry.primaryTestName)
        ? `Test failure in ${truncateText(entry.primaryTestName, GITHUB_COMMENT_DISPLAY.MAX_TEST_NAME_LENGTH)}`
        : entry.location
          ? `Failures in ${entry.location}`
          : "See affected files below";

    lines.push(`**Issue:** ${issueText}`);

    if (entry.location || entry.evidenceIds.length > 0) {
      const evidenceTag =
        entry.evidenceIds.length > 0 ? ` [${entry.evidenceIds.slice(0, 3).join(", ")}]` : "";
      const locationDisplay = entry.location ? `\`${entry.location}\`` : "See below";
      lines.push(`**Evidence:** ${locationDisplay}${evidenceTag}`);
    }

    lines.push("");
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

// ==================== Affected Files Section ====================

/**
 * Build consolidated affected files section with evidence IDs.
 */
export const buildAnnotationsSection = (
  annotations: readonly ConsolidatedAnnotation[],
  testFailures: readonly ConsolidatedTestFailure[] = []
): string[] => {
  const { assertions } = partitionByFailureType(testFailures);

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
      level: "failure",
      title: undefined,
      evidenceId: generateTestEvidenceId(testIndex),
      isInfra: false,
    };
  });

  const allAssertionEntries = [...annotationEntries, ...assertionEntries].filter(
    (entry) => entry.location && entry.path
  );
  const unlocatedAssertions = assertions.filter(
    (failure) => !failure.file || !extractValidFileLocation(failure.file, failure.line ?? 0)
  );

  if (allAssertionEntries.length === 0 && unlocatedAssertions.length === 0) {
    return [];
  }

  const uniqueFileCount = countDisplayableFiles(annotations, testFailures);
  const lines: string[] = [`### ${UI_EMOJI.location} Affected Files (${uniqueFileCount})`, ""];

  const serviceGroups = new Map<string, AffectedFileEntry[]>();
  allAssertionEntries.forEach((entry) => {
    const service = extractServiceFromPath(entry.path);
    const existing = serviceGroups.get(service) ?? [];
    serviceGroups.set(service, [...existing, entry]);
  });

  serviceGroups.forEach((entries, service) => {
    const fileGroups = groupEntriesByFile(entries);
    const fileCount = fileGroups.length === 1 ? "1 file" : `${fileGroups.length} files`;
    lines.push(`**${service}** (${fileCount})`);

    fileGroups.forEach((group) => {
      if (group.entries.length === 1) {
        const entry = group.entries[0];
        const icon = ANNOTATION_LEVEL_EMOJI_MAP[entry.level ?? "failure"] ?? UI_EMOJI.info;
        const location = entry.location ? `\`${entry.location}\`` : "";
        const title = entry.title ? `**${entry.title}**: ` : "";
        const evidenceTag = entry.evidenceId ? ` [${entry.evidenceId}]` : "";
        lines.push(`  - ${icon} ${location} - ${title}${entry.display}${evidenceTag}`);
      } else {
        const firstEntry = group.entries[0];
        const location = firstEntry.location?.split(":")[0] ?? group.file;
        lines.push(
          `  - ${UI_EMOJI.failedFile} \`${location}\` (${group.entries.length} assertions)`
        );
        const displayedEntries = group.entries.slice(
          0,
          GITHUB_COMMENT_DISPLAY.MAX_ASSERTIONS_PER_FILE
        );
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

  if (unlocatedAssertions.length > 0) {
    lines.push("");
    lines.push(`**Unlocated Failures (${unlocatedAssertions.length})**`);
    const displayedUnlocated = unlocatedAssertions.slice(0, GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS);
    displayedUnlocated.forEach((failure) => {
      const testName = truncateText(failure.testName, GITHUB_COMMENT_DISPLAY.MAX_TEST_NAME_LENGTH);
      const normalizedError = failure.error
        ? truncateText(
            sanitizeTestFailureMessage(failure.error),
            GITHUB_COMMENT_DISPLAY.MAX_ANNOTATION_MESSAGE_LENGTH
          )
        : "";
      const evidenceIndex = assertions.indexOf(failure);
      const evidenceTag = evidenceIndex >= 0 ? ` [${generateTestEvidenceId(evidenceIndex)}]` : "";
      const display = normalizedError.length > 0 ? `${testName} — ${normalizedError}` : testName;
      lines.push(`  - ${UI_EMOJI.failedFile} ${display}${evidenceTag}`);
    });
    if (unlocatedAssertions.length > displayedUnlocated.length) {
      lines.push(
        `  - _...and ${unlocatedAssertions.length - displayedUnlocated.length} more unlocated failures_`
      );
    }
  }

  lines.push("");
  return lines;
};

// ==================== Actions & Feedback Sections ====================

/**
 * Build recommended actions section
 */
export const buildActionsSection = (actions: readonly RecommendedAction[]): string[] =>
  actions.length === 0
    ? []
    : [
        "---",
        "",
        `## ${UI_EMOJI.tools} Recommended Areas to Review`,
        "",
        ...actions.flatMap((action, index) => {
          const actionLines = formatAction(action, index);
          return index === 0 ? actionLines : ["", ...actionLines];
        }),
        "",
      ];

/**
 * Build feedback section with links
 */
export const buildFeedbackSection = (feedbackLinks?: FeedbackLinks): string[] => {
  if (!feedbackLinks) {
    return [];
  }
  return ["---", "", ...formatFeedbackLinksContent(feedbackLinks), ""];
};

// ==================== Context Sections ====================

/**
 * Build PR context section showing linked issues and correlated changes.
 */
export const buildPRContextCorrelationSection = (
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
 */
export const buildFullReportLinkSection = (
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
