/**
 * CI Failure Formatting Utilities
 *
 * Formats CI failure analysis into Slack Block Kit blocks
 * and attachments for rich, branded notifications.
 *
 * This is a barrel export that re-exports from focused modules:
 * - ciFailureHelpers.ts: Resolver functions and priority emoji
 * - ciFailureBlocks.ts: Block creator functions
 */

import {
  resolveAnnotations,
  resolveDependencyChanges,
  resolveBuildConfigChanges,
} from "./ciFailureHelpers.js";
import {
  createBrandedHeaderBlock,
  createSummaryBlock,
  createWhyBlock,
  createSecondaryFindingsBlock,
  createRecommendedBlock,
  createErrorsBlock,
  createConfidenceBlock,
  createDivider,
  createFooterBlock,
  createActionsBlock,
} from "./ciFailureBlocks.js";
import type { MessageAttachment } from "@slack/types";
import { getConfidenceColor, UI_EMOJI } from "@kenchi/shared";
import type {
  SlackBlock,
  CIFailureAnalysis,
  CIAnnotation,
  TestFailure,
} from "../types/slackTypes.js";

// ==================== Inline Helper ====================

/**
 * Collect error messages from annotations and test failures.
 */
const collectCIErrors = (
  annotations: readonly CIAnnotation[],
  testFailures?: readonly TestFailure[]
): readonly string[] => {
  const errors: string[] = [];

  // Collect from annotations (failure level indicates errors)
  annotations
    .filter((annotation) => annotation.level === "failure")
    .forEach((annotation) => {
      errors.push(annotation.message);
    });

  // Collect from test failures
  testFailures?.forEach((failure) => {
    const message = failure.error ?? failure.testName ?? "Test failed";
    errors.push(message);
  });

  return errors;
};

// Re-export helper functions
export { getPriorityEmoji } from "./ciFailureHelpers.js";
export type {
  CIDependencyChange,
  CIBuildConfigChange,
  CIRecommendedAction,
} from "./ciFailureHelpers.js";

// Re-export Slack's MessageAttachment type for consumers
export type { MessageAttachment } from "@slack/types";

// ==================== Public API ====================

/**
 * Formats CI failure analysis into rich Slack Block Kit blocks.
 *
 * Structure:
 * - Header: KenchiOps CI Failure Detected
 * - Summary: repo-name pipeline failed on test
 * - Why: Bullet points explaining the failure
 * - Recommended: Action items
 * - Errors: (if any)
 * - Confidence: percentage and label
 * - Footer: metadata
 *
 * @param analysis - The CI failure analysis data
 * @returns Array of Slack blocks
 */
export const formatCIFailureBlocks = (analysis: CIFailureAnalysis): SlackBlock[] => {
  const annotations = resolveAnnotations(analysis);
  const dependencyChanges = resolveDependencyChanges(analysis);
  const buildConfigChanges = resolveBuildConfigChanges(analysis);

  // Collect errors from annotations and test failures
  const errors = collectCIErrors(annotations, analysis.testFailures);

  // Build blocks array, filtering out nulls
  const blocks: SlackBlock[] = [
    createBrandedHeaderBlock(),
    createSummaryBlock(analysis),
    createDivider(),
    createWhyBlock(analysis, annotations, dependencyChanges, buildConfigChanges),
    createSecondaryFindingsBlock(analysis),
    createRecommendedBlock(analysis),
    createErrorsBlock(errors),
    createDivider(),
    createConfidenceBlock(analysis.confidence),
    createFooterBlock(analysis),
    createActionsBlock(analysis),
  ].filter((block): block is SlackBlock => block !== null);

  return blocks;
};

/**
 * Creates Slack attachments with colored border for the analysis.
 *
 * Color is based on confidence level:
 * - Green for high confidence (>=0.7)
 * - Yellow for medium confidence (>=0.5)
 * - Red for low confidence (<0.5)
 *
 * The colored side border provides at-a-glance severity indication.
 *
 * @param analysis - The CI failure analysis data
 * @returns Array of message attachments
 */
export const createAnalysisAttachments = (analysis: CIFailureAnalysis): MessageAttachment[] => {
  const color = getConfidenceColor(analysis.confidence);
  const analysisText = analysis.analysis || analysis.full_analysis?.summary;
  const cause =
    analysis.identified_cause ??
    analysis.full_analysis?.identifiedCause ??
    analysisText ??
    "CI failure analysis";

  return [
    {
      color,
      fallback: `${UI_EMOJI.failure} CI Failure in ${analysis.repository}: ${cause}`,
      blocks: formatCIFailureBlocks(analysis),
    },
  ];
};
