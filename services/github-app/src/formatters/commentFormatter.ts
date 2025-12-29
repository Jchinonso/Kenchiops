/**
 * GitHub Comment Formatting Utilities
 *
 * Formats CI failure analysis into rich GitHub PR comments
 * with branded styling, structured sections, and emojis.
 */

import {
  // UI Helpers
  collectCIErrors,
  getConfidenceLabel,
  truncateText,
  pluralize,
  getRepoName,
  getFirstSentence,
  buildTruncatedList,
  // Constants
  DISPLAY_DEFAULTS,
  UI_EMOJI,
  PRIORITY_EMOJI_MAP,
  DEPENDENCY_EMOJI_MAP,
  CONFIDENCE_BADGE_THRESHOLDS,
  GITHUB_COMMENT_DISPLAY,
  GITHUB_COMMENT_TEMPLATES,
  // Types
  type CIAnnotation,
  type CITestFailure,
} from "@kenchi/shared";

/**
 * Analysis data structure for GitHub comments.
 */
export interface AnalysisData {
  readonly summary?: string;
  readonly analysis?: string;
  readonly identified_cause?: string;
  readonly confidence: number;
  readonly recommended_actions?: ReadonlyArray<{
    readonly priority: string;
    readonly description: string;
  }>;
  readonly repository: string;
  readonly checkName?: string;
  readonly headSha?: string;
  readonly annotations?: ReadonlyArray<CIAnnotation>;
  readonly testFailures?: ReadonlyArray<CITestFailure>;
  readonly prContext?: {
    readonly number: number;
    readonly title: string;
    readonly author: string;
    readonly branch: string;
  };
  readonly workflowContext?: {
    readonly name: string;
    readonly duration?: string;
  };
  readonly dependencyChanges?: ReadonlyArray<{
    readonly type: "added" | "removed" | "updated";
    readonly name: string;
    readonly oldVersion?: string;
    readonly newVersion?: string;
  }>;
}

// ============================================================================
// Static Content (uses shared UI_EMOJI and templates)
// ============================================================================

const HEADER = GITHUB_COMMENT_TEMPLATES.FAILURE_HEADER(UI_EMOJI.failure);
const SUCCESS_HEADER = GITHUB_COMMENT_TEMPLATES.SUCCESS_HEADER(UI_EMOJI.success);
const FOOTER = GITHUB_COMMENT_TEMPLATES.FOOTER(UI_EMOJI.robot);

// ============================================================================
// Helper Functions
// ============================================================================

const getFailureAnnotations = (annotations?: ReadonlyArray<CIAnnotation>): CIAnnotation[] =>
  annotations?.filter((annotation) => annotation.level === "failure") ?? [];

const getPriorityEmoji = (priority: string): string =>
  PRIORITY_EMOJI_MAP[priority.toLowerCase()] ?? UI_EMOJI.priorityDefault;

const getDependencyEmoji = (type: string): string =>
  DEPENDENCY_EMOJI_MAP[type] ?? UI_EMOJI.depUpdated;

const getConfidenceBadge = (confidence: number): string =>
  CONFIDENCE_BADGE_THRESHOLDS.find((threshold) => confidence >= threshold.min)?.emoji ??
  UI_EMOJI.confidenceVeryLow;

// ============================================================================
// Item Formatters
// ============================================================================

const formatTestFailure = (failure: CITestFailure): string => {
  const location = failure.file ? ` in \`${failure.file}\`` : "";
  return `- ${UI_EMOJI.failure} \`${truncateText(failure.testName, GITHUB_COMMENT_DISPLAY.MAX_TEST_NAME_LENGTH)}\`${location}`;
};

const formatAnnotation = (annotation: CIAnnotation): string =>
  `- ${UI_EMOJI.location} \`${annotation.path}:${annotation.startLine}\` — ${truncateText(annotation.message, GITHUB_COMMENT_DISPLAY.MAX_ANNOTATION_MESSAGE_LENGTH)}`;

const formatDependencyChange = (
  dependencyChange: NonNullable<AnalysisData["dependencyChanges"]>[number]
): string => {
  const icon = getDependencyEmoji(dependencyChange.type);
  const version =
    dependencyChange.oldVersion && dependencyChange.newVersion
      ? ` (${dependencyChange.oldVersion} → ${dependencyChange.newVersion})`
      : dependencyChange.newVersion
        ? ` (${dependencyChange.newVersion})`
        : "";
  return `- ${icon} \`${dependencyChange.name}\`${version}`;
};

const formatAction = (action: { priority: string; description: string }, index: number): string =>
  `${index + 1}. ${getPriorityEmoji(action.priority)} ${action.description}`;

const formatError = (errorMessage: string): string =>
  truncateText(errorMessage, GITHUB_COMMENT_DISPLAY.MAX_ERROR_LINE_LENGTH);

const formatImpact = (impactMessage: string): string => `- ${UI_EMOJI.warning} ${impactMessage}`;

// ============================================================================
// Section Builders
// ============================================================================

const buildSummaryLine = (analysis: AnalysisData): string => {
  const repoName = getRepoName(analysis.repository);
  const checkName = analysis.checkName ?? "CI";
  const firstTest = analysis.testFailures?.[0]?.testName;
  const testInfo = firstTest
    ? ` on test \`${truncateText(firstTest, GITHUB_COMMENT_DISPLAY.MAX_SUMMARY_TEST_LENGTH)}\``
    : "";

  return `${UI_EMOJI.package} **${repoName}** ${checkName} pipeline failed${testInfo}\n`;
};

const buildCauseQuote = (analysis: AnalysisData): string => {
  const cause = analysis.identified_cause ?? getFirstSentence(analysis.analysis ?? "");
  return cause ? `> ${cause}\n` : "";
};

const buildTestFailuresSubsection = (testFailures: ReadonlyArray<CITestFailure>): string[] => {
  if (testFailures.length === 0) return [];

  const count = testFailures.length;
  return [
    `\n**Test Failures:** ${count} ${pluralize(count, "test")} failed\n`,
    ...buildTruncatedList(
      testFailures,
      formatTestFailure,
      GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS,
      "failures"
    ),
    "",
  ];
};

const buildAnnotationsSubsection = (failureAnnotations: CIAnnotation[]): string[] => {
  if (failureAnnotations.length === 0) return [];

  return [
    `**Error Locations:**\n`,
    ...buildTruncatedList(
      failureAnnotations,
      formatAnnotation,
      GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS,
      "errors"
    ),
    "",
  ];
};

const buildDependencySubsection = (
  deps: NonNullable<AnalysisData["dependencyChanges"]>
): string[] => {
  if (deps.length === 0) return [];

  return [
    `**Dependency Changes:** ${deps.length} change(s)\n`,
    ...buildTruncatedList(
      deps,
      formatDependencyChange,
      GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS,
      "changes"
    ),
    "",
  ];
};

const buildEvidenceSection = (
  analysis: AnalysisData,
  failureAnnotations: CIAnnotation[]
): string => {
  const lines: string[] = [
    `### ${UI_EMOJI.search} Evidence\n`,
    buildCauseQuote(analysis),
    ...buildTestFailuresSubsection(analysis.testFailures ?? []),
    ...buildAnnotationsSubsection(failureAnnotations),
    ...buildDependencySubsection(analysis.dependencyChanges ?? []),
  ];

  return lines.join("\n");
};

const buildImpactSection = (analysis: AnalysisData, failureAnnotations: CIAnnotation[]): string => {
  const testCount = analysis.testFailures?.length ?? 0;
  const errorCount = failureAnnotations.length;

  const impactConditions: Array<{ condition: boolean; message: string }> = [
    { condition: testCount > 0, message: `${testCount} ${pluralize(testCount, "test")} failing` },
    {
      condition: errorCount > 0,
      message: `${errorCount} ${pluralize(errorCount, "error")} detected`,
    },
    { condition: !!analysis.checkName, message: `\`${analysis.checkName}\` workflow blocked` },
    { condition: !!analysis.prContext, message: "PR cannot be merged until resolved" },
  ];

  const impacts = impactConditions
    .filter(({ condition }) => condition)
    .map(({ message }) => formatImpact(message));

  const finalImpacts = impacts.length > 0 ? impacts : [formatImpact("CI pipeline blocked")];

  return [`### ${UI_EMOJI.impact} Impact\n`, ...finalImpacts, ""].join("\n");
};

const buildRecommendationSection = (analysis: AnalysisData): string => {
  const actions = analysis.recommended_actions ?? [];
  if (actions.length === 0) return "";

  const actionLines = buildTruncatedList(
    actions,
    formatAction,
    GITHUB_COMMENT_DISPLAY.MAX_ACTIONS,
    "recommendations available"
  );

  // Fix overflow format for recommendations (no dash prefix)
  const fixedLines = actionLines.map((actionLine) =>
    actionLine.startsWith("- _") ? `\n_${actionLine.slice(3)}` : actionLine
  );

  return [`### ${UI_EMOJI.tools} Recommendation\n`, ...fixedLines, ""].join("\n");
};

const buildErrorsSection = (analysis: AnalysisData): string => {
  const errors = collectCIErrors(analysis.annotations, analysis.testFailures, {
    includeEmoji: false,
  });

  if (errors.length === 0) return "";

  const displayErrors = errors.slice(0, GITHUB_COMMENT_DISPLAY.MAX_ERROR_DETAILS).map(formatError);
  const overflow =
    errors.length > GITHUB_COMMENT_DISPLAY.MAX_ERROR_DETAILS
      ? `\n_...and ${errors.length - GITHUB_COMMENT_DISPLAY.MAX_ERROR_DETAILS} more errors_`
      : "";

  return [
    `### ${UI_EMOJI.list} Error Details\n`,
    "```",
    ...displayErrors,
    "```",
    overflow,
    "",
  ].join("\n");
};

const buildConfidenceSection = (confidence: number): string => {
  const percentage = Math.round(confidence * 100);
  const label = getConfidenceLabel(confidence);
  const badge = getConfidenceBadge(confidence);

  return `${badge} **Analysis Confidence:** ${percentage}% (${label})\n`;
};

const buildMetadataSection = (analysis: AnalysisData): string => {
  const metadataItems: Array<{ condition: boolean; content: string }> = [
    {
      condition: !!analysis.checkName,
      content: `${UI_EMOJI.workflow} **Workflow:** ${analysis.checkName}`,
    },
    {
      condition: !!analysis.headSha,
      content: `${UI_EMOJI.commit} **Commit:** \`${analysis.headSha?.substring(0, DISPLAY_DEFAULTS.SHA_DISPLAY_LENGTH)}\``,
    },
    {
      condition: !!analysis.workflowContext?.duration,
      content: `${UI_EMOJI.timer} **Duration:** ${analysis.workflowContext?.duration}`,
    },
  ];

  const parts = metadataItems.filter(({ condition }) => condition).map(({ content }) => content);

  if (parts.length === 0) return "";

  return `\n<details>\n<summary>${UI_EMOJI.details} Details</summary>\n\n${parts.join(" • ")}\n\n</details>\n`;
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Format analysis into a rich GitHub comment with structured sections.
 */
export const formatGitHubComment = (analysis: AnalysisData): string => {
  const failureAnnotations = getFailureAnnotations(analysis.annotations);

  const sections = [
    HEADER,
    buildSummaryLine(analysis),
    buildEvidenceSection(analysis, failureAnnotations),
    buildImpactSection(analysis, failureAnnotations),
    buildRecommendationSection(analysis),
    buildErrorsSection(analysis),
    buildConfidenceSection(analysis.confidence),
    buildMetadataSection(analysis),
    FOOTER,
  ];

  return sections.filter(Boolean).join("\n");
};

/**
 * Format a "low risk" / "all clear" comment for when confidence is high.
 */
export const formatAllClearComment = (analysis: AnalysisData): string => {
  const repoName = getRepoName(analysis.repository);
  const percentage = Math.round(analysis.confidence * 100);
  const cause = analysis.identified_cause ?? analysis.analysis ?? "No critical issues detected.";

  return [
    SUCCESS_HEADER,
    `${UI_EMOJI.package} **${repoName}** analysis completed successfully.\n`,
    `### ${UI_EMOJI.search} Summary\n`,
    `> ${cause}\n`,
    `${UI_EMOJI.confidenceHigh} **Analysis Confidence:** ${percentage}%\n`,
    FOOTER,
  ].join("\n");
};
