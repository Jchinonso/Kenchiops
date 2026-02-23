/**
 * PR Comment Formatter
 *
 * Builds consolidated PR comments from aggregated CI failures.
 * Uses section builders for clean composition.
 */

import {
  SHORT_COMMIT_SHA_LENGTH,
  GITHUB_COMMENT_DISPLAY,
  UI_EMOJI,
  type AggregatedFailures,
  type TestFailureInfo,
  type ParsedTestSummary,
  type LLMChangeCorrelation,
} from "@kenchi/shared";
import {
  type FeedbackLinks,
  type LintErrorForDisplay,
  type LintErrorWithFile,
} from "./prCommentTypes.js";
import {
  extractAssertionDiff,
  categorizeFailures,
  generateErrorBreakdownVisual,
  generateConsolidatedActions,
} from "./testFailureHelpers.js";
import {
  getConfidenceBadge,
  buildDependencyChangesSection,
  buildBuildConfigChangesSection,
  buildPrioritizedActions,
} from "./enrichedSectionBuilders.js";

/**
 * Compute display names for file paths, disambiguating when multiple files share the same basename.
 * For unique basenames: `repository.ts`
 * For collisions: `analysis/repository.ts`, `incidentAlert/repository.ts`
 */
const computeDisplayNames = (filePaths: readonly string[]): ReadonlyMap<string, string> => {
  const basenameCounts = new Map<string, number>();
  filePaths.forEach((filePath) => {
    const basename = filePath.split("/").pop() ?? filePath;
    basenameCounts.set(basename, (basenameCounts.get(basename) ?? 0) + 1);
  });

  return new Map(
    filePaths.map((filePath) => {
      const parts = filePath.split("/");
      const basename = parts.pop() ?? filePath;
      const hasDuplicate = (basenameCounts.get(basename) ?? 0) > 1;
      // For duplicates, include the parent directory for disambiguation
      const displayName =
        hasDuplicate && parts.length > 0 ? `${parts[parts.length - 1]}/${basename}` : basename;
      return [filePath, displayName] as const;
    })
  );
};

/**
 * Build the header section of the PR comment.
 * Includes commit info, PR context, and workflow timing when available.
 */
export const buildHeaderSection = (aggregation: AggregatedFailures): string[] => {
  const shortSha = aggregation.commitSha.substring(0, SHORT_COMMIT_SHA_LENGTH);
  const lines: string[] = [
    `## ${UI_EMOJI.failure} CI Failure Analysis`,
    "",
    `| ${UI_EMOJI.info} **Commit** | ${UI_EMOJI.warning} **Failed Checks** |`,
    "| :--- | :--- |",
    `| \`${shortSha}\` | ${aggregation.failures.length} |`,
    "",
  ];

  const { prContext } = aggregation;
  const { workflowContext } = aggregation;

  if (prContext ?? workflowContext) {
    const contextParts: string[] = [];

    if (prContext) {
      contextParts.push(
        `${UI_EMOJI.branch} **Branch:** \`${prContext.branch}\` → \`${prContext.baseBranch}\``
      );
      contextParts.push(`${UI_EMOJI.user} **Author:** ${prContext.author}`);
      if (prContext.labels.length > 0) {
        const labelBadges = prContext.labels.map((label) => `\`${label}\``).join(" ");
        contextParts.push(`${UI_EMOJI.target} **Labels:** ${labelBadges}`);
      }
    }

    if (workflowContext) {
      contextParts.push(`${UI_EMOJI.workflow} **Workflow:** ${workflowContext.name}`);
      if (workflowContext.duration) {
        contextParts.push(`${UI_EMOJI.timer} **Duration:** ${workflowContext.duration}`);
      }
    }

    lines.push(
      `<details open><summary>${UI_EMOJI.details} <strong>Context</strong></summary>`,
      "",
      ...contextParts,
      "",
      "</details>",
      ""
    );
  }

  return lines;
};

/**
 * Build summary line for test failures.
 * Uses deterministic parsedTestSummary count when available, falls back to LLM array length.
 */
export const buildTestFailureSummary = (
  testFailures: readonly TestFailureInfo[],
  parsedTestSummary?: ParsedTestSummary | null
): string => {
  const uniqueFiles = [
    ...new Set(
      testFailures
        .map((testFailure) => testFailure.file)
        .filter((file): file is string => Boolean(file))
    ),
  ];
  const unknownFileCount = testFailures.filter((testFailure) => !testFailure.file).length;
  const fileCount = uniqueFiles.length;
  const testCount = parsedTestSummary?.failed ?? testFailures.length;
  const unknownSuffix = unknownFileCount > 0 ? ` (+${unknownFileCount} in unknown files)` : "";

  if (fileCount > 0) {
    const fileList = uniqueFiles
      .slice(0, GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS)
      .map((filePath) => `\`${filePath.split("/").pop()}\``)
      .join(", ");
    const moreFiles =
      fileCount > GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS
        ? ` and ${fileCount - GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS} more`
        : "";
    return `> ${testCount} test${testCount > 1 ? "s" : ""} failed in ${fileCount} file${fileCount > 1 ? "s" : ""}: ${fileList}${moreFiles}${unknownSuffix}`;
  }
  return `> ${testCount} test${testCount > 1 ? "s" : ""} failed${unknownSuffix}`;
};

/**
 * Build assertion diff lines for a single test failure.
 * Prioritizes LLM-extracted expected/actual values, then falls back to regex extraction.
 */
export const buildAssertionDiffLines = (testFailure: TestFailureInfo): string[] => {
  const hasLLMExpected = testFailure.expected !== undefined && testFailure.expected !== null;
  const hasLLMActual = testFailure.actual !== undefined && testFailure.actual !== null;

  if (hasLLMExpected || hasLLMActual) {
    const lines: string[] = [];
    if (hasLLMExpected) {
      const expected = String(testFailure.expected).substring(
        0,
        GITHUB_COMMENT_DISPLAY.MAX_ERROR_LINE_LENGTH
      );
      lines.push(`  Expected: ${expected}`);
    }
    if (hasLLMActual) {
      const actual = String(testFailure.actual).substring(
        0,
        GITHUB_COMMENT_DISPLAY.MAX_ERROR_LINE_LENGTH
      );
      lines.push(`  Received: ${actual}`);
    }
    return lines;
  }

  if (testFailure.error && testFailure.error !== "Test failed (see logs for details)") {
    const diff = extractAssertionDiff(testFailure.error);
    if (diff) {
      const lines: string[] = [];
      if (diff.expected) {
        lines.push(`  Expected: ${diff.expected}`);
      }
      if (diff.received) {
        lines.push(`  Received: ${diff.received}`);
      }
      return lines;
    }
    const errorLine = testFailure.error.split("\n")[0].trim();
    if (errorLine && errorLine.length > 0) {
      return [`  Error: ${errorLine.substring(0, GITHUB_COMMENT_DISPLAY.MAX_ERROR_LINE_LENGTH)}`];
    }
  }

  return [];
};

export const buildTestFileGroup = (
  filePath: string,
  fileFailures: readonly TestFailureInfo[],
  correlations?: readonly LLMChangeCorrelation[],
  displayName?: string
): string[] => {
  const fileName = displayName ?? filePath.split("/").pop() ?? filePath;
  const failureLines = fileFailures.flatMap((testFailure) => {
    const lineRef = testFailure.line ? `:${testFailure.line}` : "";
    const crossRef = correlations
      ? buildCrossReferenceLine(testFailure.testName, correlations)
      : [];
    return [
      `${UI_EMOJI.failure} ${testFailure.testName}${lineRef}`,
      ...buildAssertionDiffLines(testFailure),
      ...crossRef,
    ];
  });

  return [
    `<details><summary><strong>${fileName}</strong> (${fileFailures.length} failure${fileFailures.length > 1 ? "s" : ""})</summary>`,
    "",
    "```",
    ...failureLines,
    "```",
    "</details>",
    "",
  ];
};

export const buildTestFailuresSection = (
  testFailures: readonly TestFailureInfo[],
  testCommand?: string,
  parsedTestSummary?: ParsedTestSummary | null,
  correlations?: readonly LLMChangeCorrelation[]
): string[] => {
  if (testFailures.length === 0) {
    return [];
  }

  const headlineCount = parsedTestSummary?.failed ?? testFailures.length;
  const shownCount = testFailures.length;
  // When deterministic summary found more failures than the LLM extracted,
  // clarify the discrepancy so users aren't confused by the numbers
  const headlineSuffix = headlineCount > shownCount ? ` (${shownCount} shown in detail)` : "";

  const failuresByFile = new Map<string, TestFailureInfo[]>();
  testFailures.forEach((testFailure) => {
    const fileKey = testFailure.file ?? "Unknown file";
    const existing = failuresByFile.get(fileKey) ?? [];
    failuresByFile.set(fileKey, [...existing, testFailure]);
  });

  const displayNames = computeDisplayNames([...failuresByFile.keys()]);
  const fileGroupLines = [...failuresByFile.entries()].flatMap(([filePath, fileFailures]) =>
    buildTestFileGroup(filePath, fileFailures, correlations, displayNames.get(filePath))
  );

  const breakdown = categorizeFailures(testFailures);
  const rawBreakdownLines = generateErrorBreakdownVisual(breakdown);
  // When headline count differs from analyzed count, clarify in the breakdown header
  const breakdownLines =
    headlineCount > shownCount && rawBreakdownLines.length > 0
      ? [`**Error Breakdown** (of ${shownCount} analyzed):`, ...rawBreakdownLines.slice(1)]
      : rawBreakdownLines;

  const testCommandSection = testCommand
    ? [
        `<details><summary>${UI_EMOJI.info} <strong>Run failing tests locally</strong></summary>`,
        "",
        "```bash",
        testCommand,
        "```",
        "</details>",
        "",
      ]
    : [];

  return [
    `${UI_EMOJI.new} **New failures introduced in this PR**`,
    "",
    `**${UI_EMOJI.warning} ${headlineCount} Test Failure${headlineCount > 1 ? "s" : ""}${headlineSuffix}:**`,
    "",
    ...fileGroupLines,
    ...(breakdownLines.length > 0 ? [...breakdownLines, ""] : []),
    ...testCommandSection,
  ];
};

export const buildLintFileGroup = (
  filePath: string,
  fileErrors: readonly LintErrorForDisplay[],
  displayName?: string
): string[] => {
  const fileName = displayName ?? filePath.split("/").pop() ?? filePath;
  const errorLines = fileErrors.flatMap((lintError) => {
    const location = lintError.line
      ? lintError.column
        ? `${lintError.line}:${lintError.column}`
        : `${lintError.line}`
      : null;
    const symbol = lintError.symbol ? ` \`${lintError.symbol}\`` : "";
    const lines = [
      `${UI_EMOJI.failure} [${lintError.code}] ${lintError.message}${symbol}`,
      `   -> ${filePath}${location ? `:${location}` : ""}`,
    ];
    if (lintError.suggestion) {
      lines.push(`   ${UI_EMOJI.suggestion} ${lintError.suggestion}`);
    }
    return lines;
  });

  return [
    `<details open><summary><strong>${fileName}</strong> (${fileErrors.length} error${fileErrors.length > 1 ? "s" : ""})</summary>`,
    "",
    "```",
    ...errorLines,
    "```",
    "</details>",
    "",
  ];
};

export const buildLintErrorsSection = (lintErrors: readonly LintErrorWithFile[]): string[] => {
  if (lintErrors.length === 0) {
    return [];
  }

  const errorsByFile = new Map<string, LintErrorForDisplay[]>();
  lintErrors.forEach((lintError) => {
    const fileKey = lintError.file ?? "Unknown file";
    const existing = errorsByFile.get(fileKey) ?? [];
    errorsByFile.set(fileKey, [...existing, lintError]);
  });

  const displayNames = computeDisplayNames([...errorsByFile.keys()]);
  const fileGroupLines = [...errorsByFile.entries()].flatMap(([filePath, fileErrors]) =>
    buildLintFileGroup(filePath, fileErrors, displayNames.get(filePath))
  );

  return [
    `**${UI_EMOJI.warning} ${lintErrors.length} Lint/Compile Error${lintErrors.length > 1 ? "s" : ""}:**`,
    "",
    ...fileGroupLines,
  ];
};

// ==================== Change Correlation Display ====================

const capitalizeCorrelation = (level: LLMChangeCorrelation["correlation"]): string =>
  level === "none" ? "—" : `${level.charAt(0).toUpperCase()}${level.slice(1)}`;

const formatCorrelationTests = (failingTests: readonly string[]): string =>
  failingTests.length > 0
    ? failingTests
        .slice(0, GITHUB_COMMENT_DISPLAY.MAX_CORRELATION_TESTS)
        .map((test) => `\`${test}\``)
        .join(", ") +
      (failingTests.length > GITHUB_COMMENT_DISPLAY.MAX_CORRELATION_TESTS
        ? ` +${failingTests.length - GITHUB_COMMENT_DISPLAY.MAX_CORRELATION_TESTS} more`
        : "")
    : "*(none)*";

const buildCorrelationRow = (correlation: LLMChangeCorrelation): string => {
  const fileName = correlation.changedFile.split("/").pop() ?? correlation.changedFile;
  const lineRef = correlation.changedLine ? `:${correlation.changedLine}` : "";
  return `| \`${correlation.changedFunction}()\` | \`${fileName}${lineRef}\` | ${formatCorrelationTests(correlation.failingTests)} | ${capitalizeCorrelation(correlation.correlation)} |`;
};

export const buildChangeCorrelationSection = (
  correlations: readonly LLMChangeCorrelation[]
): string[] => {
  if (correlations.length === 0) {
    return [];
  }

  const maxRows = GITHUB_COMMENT_DISPLAY.MAX_CORRELATION_ROWS;
  const displayCorrelations = correlations.slice(0, maxRows);
  const moreCount = correlations.length > maxRows ? correlations.length - maxRows : 0;

  const tableRows = displayCorrelations.map(buildCorrelationRow);
  const moreLine = moreCount > 0 ? [`\n*...and ${moreCount} more changed functions*`] : [];

  return [
    `<details><summary>${UI_EMOJI.link} <strong>Change Correlation</strong> (${correlations.length} function${correlations.length > 1 ? "s" : ""} changed)</summary>`,
    "",
    "| Changed Function | File | Failing Tests | Confidence |",
    "| :--- | :--- | :--- | :--- |",
    ...tableRows,
    ...moreLine,
    "",
    "</details>",
    "",
  ];
};

const findCorrelationForTest = (
  testName: string,
  correlations: readonly LLMChangeCorrelation[]
): LLMChangeCorrelation | undefined =>
  correlations.find(
    (correlation) =>
      correlation.correlation !== "none" &&
      correlation.failingTests.some(
        (test: string) => test === testName || testName.includes(test) || test.includes(testName)
      )
  );

const buildCrossReferenceLine = (
  testName: string,
  correlations: readonly LLMChangeCorrelation[]
): string[] => {
  const match = findCorrelationForTest(testName, correlations);
  if (!match) {
    return [];
  }
  const lineRef = match.changedLine ? `:${match.changedLine}` : "";
  return [
    `  ${UI_EMOJI.location} Likely caused by changes to \`${match.changedFunction}()\` in ${match.changedFile}${lineRef}`,
  ];
};

// ==================== Recommended Actions ====================

export const buildActionsSection = (
  testFailures: readonly TestFailureInfo[],
  recommendedActions: ReadonlyArray<{
    readonly description: string;
    readonly priority: string | number;
  }>
): string[] => {
  const prioritizedActions = buildPrioritizedActions(recommendedActions);
  if (prioritizedActions.length > 0) {
    return [`**${UI_EMOJI.tools} Recommended Actions:**`, "", ...prioritizedActions, ""];
  }

  const consolidatedActions = generateConsolidatedActions(testFailures, recommendedActions);
  if (consolidatedActions.length === 0) {
    return [];
  }

  return [
    `**${UI_EMOJI.tools} Recommended Actions:**`,
    "",
    ...consolidatedActions.map((action) => `- [ ] ${action}`),
    "",
  ];
};

export const buildFooterSection = (feedbackLinks?: FeedbackLinks): string[] => {
  const feedbackSection = feedbackLinks
    ? [
        "---",
        `**Was this helpful?** [${UI_EMOJI.thumbsUp} Yes](${feedbackLinks.correctUrl}) | [${UI_EMOJI.thumbsDown} No](${feedbackLinks.incorrectUrl})`,
        "",
      ]
    : [];

  return [...feedbackSection, "---", `${UI_EMOJI.robot} *Generated by KenchiOps DevOps Assistant*`];
};

/**
 * Build a single failure section.
 * Includes confidence badge, dependency changes, and build config changes.
 */
export const buildFailureSection = (failure: AggregatedFailures["failures"][number]): string[] => {
  const correlations = failure.changeCorrelations ?? [];
  const confidenceBadge = getConfidenceBadge(failure.confidence);

  const summaryLine = failure.testFailures?.length
    ? buildTestFailureSummary(failure.testFailures, failure.parsedTestSummary)
    : `> ${failure.identifiedCause ?? failure.analysis ?? "Unknown error"}`;

  const testFailuresSection = failure.testFailures?.length
    ? buildTestFailuresSection(
        failure.testFailures,
        failure.testCommand,
        failure.parsedTestSummary,
        correlations
      )
    : [];

  const lintErrorsSection = failure.lintErrors?.length
    ? buildLintErrorsSection(failure.lintErrors)
    : [];

  const correlationSection = buildChangeCorrelationSection(correlations);

  const dependencySection = failure.detectedDependencyChanges?.length
    ? buildDependencyChangesSection(failure.detectedDependencyChanges)
    : [];

  const buildConfigSection = failure.detectedBuildConfigChanges?.length
    ? buildBuildConfigChangesSection(failure.detectedBuildConfigChanges)
    : [];

  const actionsSection = buildActionsSection(
    failure.testFailures ?? [],
    failure.recommendedActions ?? []
  );

  return [
    `### ${UI_EMOJI.failure} ${failure.checkName} (${confidenceBadge})`,
    "",
    summaryLine,
    "",
    ...testFailuresSection,
    ...lintErrorsSection,
    ...correlationSection,
    ...dependencySection,
    ...buildConfigSection,
    ...actionsSection,
  ];
};

// ==================== Comment Builder ====================

/**
 * Build consolidated PR comment from aggregated failures.
 * Renders each failure as its own section with per-analysis recommended actions.
 */
export const buildConsolidatedPRComment = (
  aggregation: AggregatedFailures,
  feedbackLinks?: FeedbackLinks
): string => {
  const failureSections = aggregation.failures.flatMap((failure) => buildFailureSection(failure));

  const sections = [
    ...buildHeaderSection(aggregation),
    ...failureSections,
    ...buildFooterSection(feedbackLinks),
  ];

  return sections.join("\n");
};
