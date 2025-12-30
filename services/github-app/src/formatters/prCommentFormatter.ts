/**
 * PR Comment Formatter
 *
 * Formats aggregated CI failures into GitHub PR comments.
 * Produces clean, organized markdown output with consolidated failure details
 * and recommended actions.
 */

import {
  shouldExcludePath,
  EXCLUDED_PATH_PATTERNS,
  UI_EMOJI,
  ANNOTATION_LEVEL_EMOJI_MAP,
  deduplicateByKey,
  type AggregatedFailures,
  type AnalyzedFailure,
  type CodeAnnotation,
  type RecommendedAction,
} from "@kenchi/shared";
import {
  DISPLAY_LIMITS,
  getPriorityEmoji,
  calculateAverageConfidence,
  mergeRecommendedActions,
} from "./formatterUtils.js";

// ==================== Types ====================

interface ConsolidatedTestFailure {
  readonly testName: string;
  readonly file?: string;
  readonly line?: number;
}

interface ConsolidatedAnnotation {
  readonly path: string;
  readonly line: number;
  readonly message: string;
  readonly level: CodeAnnotation["level"];
  readonly title?: string;
}

// ==================== Pure Helper Functions ====================

/**
 * Consolidate test failures across checks using Map-based deduplication
 */
const consolidateTestFailures = (failures: readonly AnalyzedFailure[]): ConsolidatedTestFailure[] =>
  deduplicateByKey(
    failures.flatMap((failure) => failure.testFailures ?? []),
    (testFailure) => `${testFailure.testName}|${testFailure.file ?? ""}`
  );

/**
 * Consolidate annotations across checks using Map-based deduplication.
 * Excludes test files since those are where tests run, not where fixes are needed.
 */
const consolidateAnnotations = (failures: readonly AnalyzedFailure[]): ConsolidatedAnnotation[] =>
  deduplicateByKey(
    failures
      .flatMap((failure) => failure.annotations)
      .filter((annotation) => !shouldExcludePath(annotation.path, EXCLUDED_PATH_PATTERNS)),
    (annotation) => `${annotation.path}:${annotation.line}`
  ).map((annotation) => ({
    path: annotation.path,
    line: annotation.line,
    message: annotation.message,
    level: annotation.level,
    title: annotation.title,
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
 * Format a single annotation as markdown
 */
const formatAnnotation = (annotation: ConsolidatedAnnotation): string => {
  const icon = ANNOTATION_LEVEL_EMOJI_MAP[annotation.level] ?? UI_EMOJI.info;
  const title = annotation.title ? `**${annotation.title}**: ` : "";
  return `  - ${icon} \`${annotation.path}:${annotation.line}\` - ${title}${annotation.message}`;
};

/**
 * Format a recommended action as markdown
 */
const formatAction = (action: RecommendedAction, index: number): string =>
  `${index + 1}. ${getPriorityEmoji(action.priority)} ${action.description}`;

/**
 * Format a test failure for display
 */
const formatTestFailure = (testFailure: ConsolidatedTestFailure): string => {
  const filePath = testFailure.file
    ? testFailure.line
      ? `${testFailure.file}:${testFailure.line}`
      : testFailure.file
    : null;
  const file = filePath ? ` (\`${filePath}\`)` : "";
  return `  - \`${testFailure.testName}\`${file}`;
};

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
 * Build consolidated test failures section
 */
const buildTestFailuresSection = (testFailures: readonly ConsolidatedTestFailure[]): string[] => {
  if (testFailures.length === 0) {
    return [];
  }

  const displayLimit = DISPLAY_LIMITS.annotationsPerCheck;
  const displayTests = testFailures.slice(0, displayLimit);
  const lines = [
    `### ${UI_EMOJI.test} Failed Tests (${testFailures.length})`,
    "",
    ...displayTests.map(formatTestFailure),
  ];

  if (testFailures.length > displayLimit) {
    lines.push(`  - ... and ${testFailures.length - displayLimit} more tests`);
  }

  lines.push("");
  return lines;
};

/**
 * Build consolidated affected files section
 */
const buildAnnotationsSection = (annotations: readonly ConsolidatedAnnotation[]): string[] => {
  if (annotations.length === 0) {
    return [];
  }

  const displayLimit = DISPLAY_LIMITS.annotationsPerCheck;
  const displayAnnotations = annotations.slice(0, displayLimit);
  const lines = [
    `### ${UI_EMOJI.location} Affected Files`,
    "",
    ...displayAnnotations.map(formatAnnotation),
  ];

  if (annotations.length > displayLimit) {
    lines.push(`  - ... and ${annotations.length - displayLimit} more locations`);
  }

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

// ==================== Public API ====================

/**
 * Build consolidated PR comment body from aggregated failures.
 * Creates a comprehensive markdown summary with deduplicated failure details.
 */
export const buildConsolidatedPRComment = (aggregation: AggregatedFailures): string => {
  const { failures, commitSha, prContext } = aggregation;
  const avgConfidence = calculateAverageConfidence(failures);
  const mergedActions = mergeRecommendedActions(failures);

  // Pre-compute consolidated data (O(n) with Map-based deduplication)
  const testFailures = consolidateTestFailures(failures);
  const annotations = consolidateAnnotations(failures);
  const causes = extractUniqueCauses(failures);

  // Build all sections
  const lines: string[] = [
    ...buildHeader(commitSha, failures.length, avgConfidence, prContext),
    "",
    "---",
    ...buildCheckNamesSection(failures),
    ...buildRootCauseSection(causes),
    ...buildTestFailuresSection(testFailures),
    ...buildAnnotationsSection(annotations),
    ...buildActionsSection(mergedActions),
    "---",
    "*Generated by KenchiOps DevOps Assistant*",
  ];

  return lines.join("\n");
};
