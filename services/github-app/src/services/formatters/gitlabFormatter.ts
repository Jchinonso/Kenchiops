/**
 * GitLab MR Comment Formatter
 *
 * Builds GitLab-compatible Merge Request comments from aggregated CI failures.
 * Uses GitLab Flavored Markdown (no <details> HTML, standard blockquotes).
 * Simpler than the GitHub formatter since GitLab has no check annotations.
 *
 * @module services/formatters/gitlabFormatter
 */

import {
  SHORT_COMMIT_SHA_LENGTH,
  UI_EMOJI,
  KENCHI_BRANDING,
  type AggregatedFailures,
  type AnalyzedFailure,
} from "@kenchi/shared";
import { getConfidenceBadge } from "./enrichedSectionBuilders.js";

// ==================== Section Builders ====================

/**
 * Build the header section with commit info and failure count.
 */
const buildHeader = (aggregation: AggregatedFailures): readonly string[] => {
  const shortSha = aggregation.commitSha.substring(0, SHORT_COMMIT_SHA_LENGTH);
  const lines: readonly string[] = [
    `## ${UI_EMOJI.failure} CI Failure Analysis`,
    "",
    `**Commit:** \`${shortSha}\` | **Failed Jobs:** ${aggregation.failures.length}`,
    "",
  ];

  const contextLines = buildContextLines(aggregation);

  return [...lines, ...contextLines];
};

/**
 * Build optional PR/workflow context lines.
 */
const buildContextLines = (aggregation: AggregatedFailures): readonly string[] => {
  const { prContext, workflowContext } = aggregation;

  if (!prContext && !workflowContext) {
    return [];
  }

  const parts: string[] = [];

  if (prContext) {
    parts.push(
      `${UI_EMOJI.branch} **Branch:** \`${prContext.branch}\` → \`${prContext.baseBranch}\``
    );
    parts.push(`${UI_EMOJI.user} **Author:** ${prContext.author}`);
  }

  if (workflowContext) {
    parts.push(`${UI_EMOJI.workflow} **Pipeline:** ${workflowContext.name}`);
    if (workflowContext.duration) {
      parts.push(`${UI_EMOJI.timer} **Duration:** ${workflowContext.duration}`);
    }
  }

  return [...parts, ""];
};

/**
 * Build the test summary line if test data is available.
 */
const buildTestSummaryLine = (failure: AnalyzedFailure): readonly string[] => {
  const summary = failure.parsedTestSummary;
  if (!summary) {
    return [];
  }

  const { passed, failed, total } = summary;
  const skipped = total - passed - failed;
  const skippedPart = skipped > 0 ? `, ${skipped} skipped` : "";

  return [`**Tests:** ${passed} passed, ${failed} failed${skippedPart}`, ""];
};

/**
 * Build the recommended actions list for a failure.
 */
const buildRecommendedActions = (failure: AnalyzedFailure): readonly string[] => {
  if (failure.recommendedActions.length === 0) {
    return [];
  }

  return [
    "**Recommended Actions:**",
    ...failure.recommendedActions.map((action) => `- ${action.description}`),
    "",
  ];
};

/**
 * Build a single failure analysis section.
 */
const buildFailureSection = (failure: AnalyzedFailure): readonly string[] => [
  `### ${UI_EMOJI.warning} ${failure.checkName}`,
  "",
  `**Confidence:** ${getConfidenceBadge(failure.confidence)}`,
  "",
  ...buildTestSummaryLine(failure),
  failure.analysis,
  "",
  ...buildRecommendedActions(failure),
  "---",
  "",
];

/**
 * Build the footer with KenchiOps branding.
 */
const buildFooter = (): readonly string[] => [
  `> ${UI_EMOJI.robot} *Powered by [${KENCHI_BRANDING.APP_NAME}](${KENCHI_BRANDING.PROJECT_URL}) — ${KENCHI_BRANDING.TAGLINE}*`,
];

// ==================== Main Export ====================

/**
 * Build a GitLab MR comment from aggregated CI failure analysis.
 *
 * Produces clean GitLab Flavored Markdown with:
 * - Header with commit SHA and failure count
 * - Per-failure sections with confidence, test summary, analysis, and actions
 * - Footer with KenchiOps branding
 */
export const buildGitLabMRComment = (aggregation: AggregatedFailures): string => {
  const sections = [
    ...buildHeader(aggregation),
    ...aggregation.failures.flatMap(buildFailureSection),
    ...buildFooter(),
  ];

  return sections.join("\n");
};
