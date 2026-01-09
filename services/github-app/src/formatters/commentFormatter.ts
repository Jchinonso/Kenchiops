/**
 * GitHub Comment Formatting Utilities
 *
 * Formats CI failure analysis into rich GitHub PR comments
 * with branded styling, structured sections, and emojis.
 *
 * This is a barrel export that re-exports from focused modules:
 * - commentTypes.ts: Type definitions and static content
 * - commentHelpers.ts: Helper functions and item formatters
 * - commentSectionBuilders.ts: Section builder functions
 */

import { UI_EMOJI, UI_CONSTANTS, getRepoName } from "@kenchi/shared";
import {
  COMMENT_FOOTER,
  FAILURE_HEADER,
  SUCCESS_HEADER,
  type AnalysisData,
} from "./commentTypes.js";
import {
  buildConfidenceSection,
  buildErrorsSection,
  buildEvidenceSection,
  buildFeedbackSection,
  buildImpactSection,
  buildMetadataSection,
  buildRecommendationSection,
  buildSecondaryFindingsSection,
  buildSummaryLine,
  getFailureAnnotations,
  resolveAnnotations,
} from "./commentSectionBuilders.js";

// Re-export types
export type {
  AnalysisData,
  DetectedDependencyChange,
  DetectedBuildConfigChange,
} from "./commentTypes.js";
export type { RecommendedAction } from "@kenchi/shared";

// ==================== Public API ====================

/**
 * Format analysis into a rich GitHub comment with structured sections.
 *
 * @param analysis - The analysis data to format
 * @returns Formatted GitHub comment markdown
 */
export const formatGitHubComment = (analysis: AnalysisData): string => {
  const annotations = resolveAnnotations(analysis);
  const failureAnnotations = getFailureAnnotations(annotations);

  const sections = [
    FAILURE_HEADER,
    buildSummaryLine(analysis),
    buildEvidenceSection(analysis, annotations, failureAnnotations),
    buildSecondaryFindingsSection(analysis),
    buildImpactSection(analysis, failureAnnotations),
    buildRecommendationSection(analysis),
    buildErrorsSection(analysis, annotations),
    buildConfidenceSection(analysis.confidence),
    buildMetadataSection(analysis),
    buildFeedbackSection(analysis),
    COMMENT_FOOTER,
  ];

  return sections.filter(Boolean).join("\n");
};

/**
 * Format a "low risk" / "all clear" comment for when confidence is high.
 *
 * @param analysis - The analysis data to format
 * @returns Formatted GitHub comment markdown for success case
 */
export const formatAllClearComment = (analysis: AnalysisData): string => {
  const repoName = getRepoName(analysis.repository);
  const percentage = Math.round(analysis.confidence * UI_CONSTANTS.PERCENTAGE_MULTIPLIER);
  const cause =
    analysis.identified_cause ??
    analysis.full_analysis?.identifiedCause ??
    analysis.analysis ??
    analysis.summary ??
    "No critical issues detected.";

  return [
    SUCCESS_HEADER,
    `${UI_EMOJI.package} **${repoName}** analysis completed successfully.\n`,
    `### ${UI_EMOJI.search} Summary\n`,
    `> ${cause}\n`,
    `${UI_EMOJI.confidenceHigh} **Analysis Confidence:** ${percentage}%\n`,
    COMMENT_FOOTER,
  ].join("\n");
};
