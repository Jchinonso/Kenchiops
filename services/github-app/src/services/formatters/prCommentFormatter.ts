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
} from "@kenchi/shared";
import { type FeedbackLinks } from "./prCommentTypes.js";
import {
  extractAssertionDiff,
  categorizeFailures,
  generateErrorBreakdownVisual,
  generateConsolidatedActions,
} from "./testFailureHelpers.js";

/**
 * Build the header section of the PR comment.
 */
export const buildHeaderSection = (shortSha: string, failureCount: number): string[] => [
  `## ${UI_EMOJI.failure} CI Failure Analysis`,
  "",
  `| ${UI_EMOJI.info} **Commit** | ${UI_EMOJI.warning} **Failed Checks** |`,
  "| :--- | :--- |",
  `| \`${shortSha}\` | ${failureCount} |`,
  "",
];

/**
 * Build summary line for test failures.
 * Uses deterministic parsedTestSummary count when available, falls back to LLM array length.
 */
export const buildTestFailureSummary = (
  testFailures: readonly TestFailureInfo[],
  parsedTestSummary?: ParsedTestSummary | null
): string => {
  const uniqueFiles = [
    ...new Set(testFailures.map((testFailure) => testFailure.file).filter(Boolean)),
  ];
  const fileCount = uniqueFiles.length;
  // Prefer deterministic regex-parsed count over LLM-generated array length
  const testCount = parsedTestSummary?.failed ?? testFailures.length;

  if (fileCount > 0) {
    const fileList = uniqueFiles
      .slice(0, GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS)
      .map((filePath) => `\`${filePath?.split("/").pop()}\``)
      .join(", ");
    const moreFiles =
      fileCount > GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS
        ? ` and ${fileCount - GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS} more`
        : "";
    return `> ${testCount} test${testCount > 1 ? "s" : ""} failed in ${fileCount} file${fileCount > 1 ? "s" : ""}: ${fileList}${moreFiles}`;
  }
  return `> ${testCount} test${testCount > 1 ? "s" : ""} failed`;
};

/**
 * Build assertion diff lines for a single test failure.
 * Prioritizes LLM-extracted expected/actual values, then falls back to regex extraction.
 */
export const buildAssertionDiffLines = (testFailure: TestFailureInfo): string[] => {
  // Check if LLM provided actual values (not just null placeholders)
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

  // Fallback: Try to extract from error message
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

/**
 * Build a file group section for test failures.
 */
export const buildTestFileGroup = (
  filePath: string,
  fileFailures: readonly TestFailureInfo[]
): string[] => {
  const fileName = filePath.split("/").pop() ?? filePath;
  const failureLines = fileFailures.flatMap((testFailure) => {
    const lineRef = testFailure.line ? `:${testFailure.line}` : "";
    return [
      `${UI_EMOJI.failure} ${testFailure.testName}${lineRef}`,
      ...buildAssertionDiffLines(testFailure),
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

/**
 * Build the test failures section.
 * Works with any test framework - LLM already filters real failures.
 * Uses deterministic parsedTestSummary count when available for the headline.
 *
 * @param testFailures - Array of test failures to display
 * @param testCommand - LLM-generated command to run failing tests locally
 * @param parsedTestSummary - Deterministic test summary from regex parsing (optional)
 */
export const buildTestFailuresSection = (
  testFailures: readonly TestFailureInfo[],
  testCommand?: string,
  parsedTestSummary?: ParsedTestSummary | null
): string[] => {
  if (testFailures.length === 0) {
    return [];
  }

  // Prefer deterministic regex-parsed count over LLM-generated array length
  const headlineCount = parsedTestSummary?.failed ?? testFailures.length;

  // Group failures by file
  const failuresByFile = new Map<string, TestFailureInfo[]>();
  testFailures.forEach((testFailure) => {
    const fileKey = testFailure.file ?? "Unknown file";
    const existing = failuresByFile.get(fileKey) ?? [];
    failuresByFile.set(fileKey, [...existing, testFailure]);
  });

  // Build file group sections
  const fileGroupLines = [...failuresByFile.entries()].flatMap(([filePath, fileFailures]) =>
    buildTestFileGroup(filePath, fileFailures)
  );

  // Build breakdown visual
  const breakdown = categorizeFailures(testFailures);
  const breakdownLines = generateErrorBreakdownVisual(breakdown);

  // Build quick copy test command section using LLM-provided command
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
    `**${UI_EMOJI.warning} ${headlineCount} Test Failure${headlineCount > 1 ? "s" : ""}:**`,
    "",
    ...fileGroupLines,
    ...(breakdownLines.length > 0 ? [...breakdownLines, ""] : []),
    ...testCommandSection,
  ];
};

/**
 * Lint error structure for building sections.
 */
interface LintErrorForDisplay {
  readonly code: string;
  readonly message: string;
  readonly line: number;
  readonly column?: number;
  readonly symbol?: string;
  readonly suggestion?: string;
}

/**
 * Build a file group section for lint errors.
 */
export const buildLintFileGroup = (
  filePath: string,
  fileErrors: readonly LintErrorForDisplay[]
): string[] => {
  const fileName = filePath.split("/").pop() ?? filePath;
  const errorLines = fileErrors.flatMap((lintError) => {
    const location = lintError.column
      ? `${lintError.line}:${lintError.column}`
      : `${lintError.line}`;
    const symbol = lintError.symbol ? ` \`${lintError.symbol}\`` : "";
    const lines = [
      `${UI_EMOJI.failure} [${lintError.code}] ${lintError.message}${symbol}`,
      `   -> ${filePath}:${location}`,
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

/**
 * Lint error with file for section building.
 */
interface LintErrorWithFile extends LintErrorForDisplay {
  readonly file: string;
}

/**
 * Build the lint errors section.
 */
export const buildLintErrorsSection = (lintErrors: readonly LintErrorWithFile[]): string[] => {
  if (lintErrors.length === 0) {
    return [];
  }

  // Group errors by file
  const errorsByFile = new Map<string, LintErrorForDisplay[]>();
  lintErrors.forEach((lintError) => {
    const fileKey = lintError.file ?? "Unknown file";
    const existing = errorsByFile.get(fileKey) ?? [];
    errorsByFile.set(fileKey, [...existing, lintError]);
  });

  const fileGroupLines = [...errorsByFile.entries()].flatMap(([filePath, fileErrors]) =>
    buildLintFileGroup(filePath, fileErrors)
  );

  return [
    `**${UI_EMOJI.warning} ${lintErrors.length} Lint/Compile Error${lintErrors.length > 1 ? "s" : ""}:**`,
    "",
    ...fileGroupLines,
  ];
};

/** Recommended action with description and priority */
interface RecommendedActionInput {
  readonly description: string;
  readonly priority: string | number;
}

/**
 * Build the recommended actions section.
 */
export const buildActionsSection = (
  testFailures: readonly TestFailureInfo[],
  recommendedActions: readonly RecommendedActionInput[]
): string[] => {
  const consolidatedActions = generateConsolidatedActions(
    testFailures.map((testFailure) => ({
      testName: testFailure.testName,
      error: testFailure.error,
      file: testFailure.file,
      line: testFailure.line,
    })),
    recommendedActions
  );

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

/**
 * Build the footer section with feedback links.
 */
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
 * Threads parsedTestSummary for deterministic test count display.
 */
export const buildFailureSection = (failure: AggregatedFailures["failures"][number]): string[] => {
  const summaryLine = failure.testFailures?.length
    ? buildTestFailureSummary(failure.testFailures, failure.parsedTestSummary)
    : `> ${failure.identifiedCause ?? failure.analysis ?? "Unknown error"}`;

  const testFailuresSection = failure.testFailures?.length
    ? buildTestFailuresSection(failure.testFailures, failure.testCommand, failure.parsedTestSummary)
    : [];

  const lintErrorsSection = failure.lintErrors?.length
    ? buildLintErrorsSection(failure.lintErrors)
    : [];

  const actionsSection = buildActionsSection(
    failure.testFailures ?? [],
    failure.recommendedActions ?? []
  );

  return [
    `### ${UI_EMOJI.failure} ${failure.checkName}`,
    "",
    summaryLine,
    "",
    ...testFailuresSection,
    ...lintErrorsSection,
    ...actionsSection,
  ];
};

/**
 * Build consolidated PR comment from aggregated failures.
 */
export const buildConsolidatedPRComment = (
  aggregation: AggregatedFailures,
  feedbackLinks?: FeedbackLinks
): string => {
  const shortSha = aggregation.commitSha.substring(0, SHORT_COMMIT_SHA_LENGTH);

  const sections = [
    ...buildHeaderSection(shortSha, aggregation.failures.length),
    ...aggregation.failures.flatMap(buildFailureSection),
    ...buildFooterSection(feedbackLinks),
  ];

  return sections.join("\n");
};
