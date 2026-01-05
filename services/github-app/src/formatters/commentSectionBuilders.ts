/**
 * GitHub Comment Section Builders
 *
 * Functions that build individual sections of GitHub PR comments.
 */

import {
  UI_EMOJI,
  UI_CONSTANTS,
  DISPLAY_DEFAULTS,
  GITHUB_COMMENT_DISPLAY,
  GITHUB_COMMENT_TEMPLATES,
  collectCIErrors,
  getConfidenceLabel,
  truncateText,
  pluralize,
  getRepoName,
  getFirstSentence,
  buildTruncatedList,
  type CIAnnotation,
  type CITestFailure,
  type LLMRecommendedAction,
} from "@kenchi/shared";
import { formatFeedbackLinksContent } from "./formatterUtils.js";
import type {
  AnalysisData,
  DetectedBuildConfigChange,
  DetectedDependencyChange,
  RecommendedAction,
} from "./commentTypes.js";
import {
  getFailureAnnotations,
  getConfidenceBadge,
  formatTestFailure,
  formatAnnotation,
  formatDependencyChange,
  formatBuildConfigChange,
  formatAction,
  formatError,
  formatImpact,
} from "./commentHelpers.js";

// ==================== Line Builders ====================

/**
 * Builds the summary line showing repository and check info.
 */
export const buildSummaryLine = (analysis: AnalysisData): string => {
  const repoName = getRepoName(analysis.repository);
  const checkName = analysis.checkName ?? "CI";
  const firstTest = analysis.testFailures?.[0]?.testName;
  const testInfo = firstTest
    ? ` on test \`${truncateText(firstTest, GITHUB_COMMENT_DISPLAY.MAX_SUMMARY_TEST_LENGTH)}\``
    : "";

  return `${UI_EMOJI.package} **${repoName}** ${checkName} pipeline failed${testInfo}\n`;
};

/**
 * Builds the cause quote block with fallback messages.
 */
export const buildCauseQuote = (
  analysis: AnalysisData,
  annotations: readonly CIAnnotation[]
): string => {
  const analysisSentence = getFirstSentence(analysis.analysis ?? "");
  const cause =
    analysis.identified_cause ??
    analysis.full_analysis?.identifiedCause ??
    (analysisSentence || analysis.summary || "");

  // If no meaningful cause identified, provide context about the failure
  if (!cause) {
    const hasAnnotations = annotations.length > 0;
    const hasTestFailures = (analysis.testFailures?.length ?? 0) > 0;

    if (hasTestFailures) {
      return "> Test failures detected. See details below for specific failing tests.\n";
    }
    if (hasAnnotations) {
      return "> CI check failed. See error locations below for details.\n";
    }
    return "> CI check failed. Unable to determine specific root cause from available logs.\n";
  }

  return `> ${cause}\n`;
};

// ==================== Subsection Builders ====================

/**
 * Builds the test failures subsection.
 */
export const buildTestFailuresSubsection = (testFailures: readonly CITestFailure[]): string[] => {
  if (testFailures.length === 0) {
    return [];
  }

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

/**
 * Builds the annotations subsection.
 */
export const buildAnnotationsSubsection = (failureAnnotations: CIAnnotation[]): string[] => {
  if (failureAnnotations.length === 0) {
    return [];
  }

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

/**
 * Builds the dependency changes subsection.
 */
export const buildDependencySubsection = (
  deps: readonly DetectedDependencyChange[] | NonNullable<AnalysisData["dependencyChanges"]>
): string[] => {
  if (deps.length === 0) {
    return [];
  }

  return [
    `**Dependency Changes:** ${deps.length} change(s)\n`,
    ...buildTruncatedList(
      deps as ReadonlyArray<
        DetectedDependencyChange | NonNullable<AnalysisData["dependencyChanges"]>[number]
      >,
      formatDependencyChange,
      GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS,
      "changes"
    ),
    "",
  ];
};

/**
 * Builds the build config changes subsection.
 */
export const buildBuildConfigSubsection = (
  changes: readonly DetectedBuildConfigChange[]
): string[] => {
  if (changes.length === 0) {
    return [];
  }

  return [
    `**Build Config Changes:** ${changes.length} change(s)\n`,
    ...buildTruncatedList(
      changes,
      formatBuildConfigChange,
      GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS,
      "changes"
    ),
    "",
  ];
};

// ==================== Main Section Builders ====================

/**
 * Builds the evidence section combining cause, test failures, annotations,
 * and dependency/config changes.
 */
export const buildEvidenceSection = (
  analysis: AnalysisData,
  annotations: readonly CIAnnotation[],
  failureAnnotations: CIAnnotation[]
): string => {
  // Prefer AI-extracted dependency changes, fallback to legacy
  const depChanges =
    analysis.detectedDependencyChanges && analysis.detectedDependencyChanges.length > 0
      ? analysis.detectedDependencyChanges
      : analysis.full_analysis?.detectedDependencyChanges &&
          analysis.full_analysis.detectedDependencyChanges.length > 0
        ? analysis.full_analysis.detectedDependencyChanges
        : (analysis.dependencyChanges ?? []);
  const buildChanges =
    analysis.detectedBuildConfigChanges && analysis.detectedBuildConfigChanges.length > 0
      ? analysis.detectedBuildConfigChanges
      : analysis.full_analysis?.detectedBuildConfigChanges &&
          analysis.full_analysis.detectedBuildConfigChanges.length > 0
        ? analysis.full_analysis.detectedBuildConfigChanges
        : [];

  const lines: string[] = [
    `### ${UI_EMOJI.search} Evidence\n`,
    buildCauseQuote(analysis, annotations),
    ...buildTestFailuresSubsection(analysis.testFailures ?? []),
    ...buildAnnotationsSubsection(failureAnnotations),
    ...buildDependencySubsection(depChanges),
    ...buildBuildConfigSubsection(buildChanges),
  ];

  return lines.join("\n");
};

/**
 * Builds the secondary findings section from uncertainties.
 */
export const buildSecondaryFindingsSection = (analysis: AnalysisData): string => {
  const findings = analysis.full_analysis?.uncertainties ?? [];
  if (findings.length === 0) {
    return "";
  }

  return [
    `### ${UI_EMOJI.info} Secondary Findings\n`,
    ...buildTruncatedList(
      findings,
      (finding) => `- ${UI_EMOJI.info} ${finding}`,
      GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS,
      "findings"
    ),
    "",
  ].join("\n");
};

/**
 * Builds the impact section showing affected tests, errors, and workflow status.
 */
export const buildImpactSection = (
  analysis: AnalysisData,
  failureAnnotations: CIAnnotation[]
): string => {
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

/**
 * Builds the recommendation section with prioritized actions.
 */
export const buildRecommendationSection = (analysis: AnalysisData): string => {
  // Use union type to handle both RecommendedAction and LLMRecommendedAction
  const actions: ReadonlyArray<RecommendedAction | LLMRecommendedAction> =
    analysis.recommended_actions && analysis.recommended_actions.length > 0
      ? analysis.recommended_actions
      : (analysis.full_analysis?.recommendedActions ?? []);
  if (actions.length === 0) {
    return "";
  }

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

/**
 * Builds the errors section with code block formatting.
 */
export const buildErrorsSection = (
  analysis: AnalysisData,
  annotations: readonly CIAnnotation[]
): string => {
  const errors = collectCIErrors(annotations, analysis.testFailures, {
    includeEmoji: false,
  });

  if (errors.length === 0) {
    return "";
  }

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

/**
 * Builds the confidence section with badge and label.
 */
export const buildConfidenceSection = (confidence: number): string => {
  const percentage = Math.round(confidence * UI_CONSTANTS.PERCENTAGE_MULTIPLIER);
  const label = getConfidenceLabel(confidence);
  const badge = getConfidenceBadge(confidence);

  return `${badge} **Analysis Confidence:** ${percentage}% (${label})\n`;
};

/**
 * Builds the classification line showing category and phase.
 */
export const buildClassificationLine = (analysis: AnalysisData): string | null => {
  const category = analysis.full_analysis?.category;
  const phase = analysis.full_analysis?.phase;
  const parts = [category, phase].filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return `${UI_EMOJI.target} **Classification:** ${parts.join(" / ")}`;
};

/**
 * Builds the collapsible metadata section.
 */
export const buildMetadataSection = (analysis: AnalysisData): string => {
  const classification = buildClassificationLine(analysis);
  const metadataItems: Array<{ condition: boolean; content: string }> = [
    {
      condition: !!classification,
      content: classification ?? "",
    },
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

  if (parts.length === 0) {
    return "";
  }

  return `\n<details>\n<summary>${UI_EMOJI.details} Details</summary>\n\n${parts.join(" • ")}\n\n</details>\n`;
};

/**
 * Builds the feedback section with links.
 */
export const buildFeedbackSection = (analysis: AnalysisData): string => {
  if (!analysis.feedbackLinks) {
    return "";
  }

  const lines = [
    GITHUB_COMMENT_TEMPLATES.SECTION_DIVIDER.trim(),
    ...formatFeedbackLinksContent(analysis.feedbackLinks),
    "",
  ];

  return lines.join("\n");
};

// ==================== Resolver Functions ====================

/**
 * Resolves annotations from analysis data, preferring direct annotations
 * over AI-extracted code annotations.
 */
export const resolveAnnotations = (analysis: AnalysisData): CIAnnotation[] => {
  if (analysis.annotations && analysis.annotations.length > 0) {
    return [...analysis.annotations];
  }

  const aiAnnotations = analysis.full_analysis?.codeAnnotations ?? [];
  return aiAnnotations.map((annotation) => ({
    path: annotation.path,
    startLine: annotation.line,
    level: annotation.level,
    message: annotation.message,
  }));
};

// Re-export getFailureAnnotations for convenience
export { getFailureAnnotations };
