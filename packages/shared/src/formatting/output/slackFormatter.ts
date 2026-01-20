/**
 * Slack Message Formatter
 *
 * Formats LLM analysis results for Slack messages.
 * Rich block-based formatting with emojis and actionable buttons.
 *
 * @module formatting/output/slackFormatter
 */

import type { LLMAnalysisResult } from "../../core/types.js";
import {
  SHORT_COMMIT_SHA_LENGTH,
  UI_CONSTANTS,
  FORMATTER_DISPLAY_LIMITS,
  CATEGORY_EMOJI,
} from "../../constants/index.js";
import type { OutputContext, SlackMessageOutput, SlackBlock, SlackBlockElement } from "./types.js";

// ==================== Helper Functions ====================

/**
 * Get category emoji.
 */
const getCategoryEmoji = (category: string): string =>
  CATEGORY_EMOJI[category] ?? CATEGORY_EMOJI.unknown;

// ==================== Block Formatters ====================

/**
 * Format the header block.
 */
const formatHeader = (context: OutputContext): SlackBlock => ({
  type: "header",
  text: {
    type: "plain_text",
    text: `🔴 CI Failure: ${context.repository}`,
  },
});

/**
 * Format the summary fields block.
 */
const formatSummary = (context: OutputContext, analysis: LLMAnalysisResult): SlackBlock => {
  const shortSha = context.commitSha.substring(0, SHORT_COMMIT_SHA_LENGTH);
  const confidenceScore = analysis.confidenceScore ?? 0;
  const confidencePercent = Math.round(confidenceScore * UI_CONSTANTS.PERCENTAGE_MULTIPLIER);
  const confidenceLevel = analysis.confidence ?? "unknown";
  const categoryEmoji = getCategoryEmoji(analysis.category ?? "unknown");

  return {
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Commit:* \`${shortSha}\`` },
      { type: "mrkdwn", text: `*Check:* ${context.checkName}` },
      { type: "mrkdwn", text: `*Confidence:* ${confidencePercent}% (${confidenceLevel})` },
      { type: "mrkdwn", text: `*Category:* ${categoryEmoji} ${analysis.category ?? "unknown"}` },
    ],
  };
};

/**
 * Format the root cause block.
 */
const formatRootCause = (analysis: LLMAnalysisResult): SlackBlock => {
  const cause = analysis.identifiedCause ?? analysis.summary ?? "Unknown";

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*🔍 Root Cause:*\n${cause}`,
    },
  };
};

/**
 * Format the top issues block.
 */
const formatTopIssues = (analysis: LLMAnalysisResult): SlackBlock | null => {
  const annotations = analysis.codeAnnotations ?? [];
  if (annotations.length === 0) {
    return null;
  }

  const topIssues = annotations.slice(0, FORMATTER_DISPLAY_LIMITS.MAX_TOP_ISSUES_DISPLAY);
  const issueLines = topIssues.map((annotation, index) => {
    const icon = index === 0 ? "🔴" : "🟡";
    const message = annotation.message || annotation.title || "Unknown issue";
    return `${icon} ${message}`;
  });

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Top Issues:*\n${issueLines.join("\n")}`,
    },
  };
};

/**
 * Format the next steps block.
 */
const formatNextSteps = (analysis: LLMAnalysisResult): SlackBlock | null => {
  const steps =
    analysis.nextSteps ?? analysis.recommendedActions?.map((action) => action.description) ?? [];
  if (steps.length === 0) {
    return null;
  }

  const displaySteps = steps.slice(0, FORMATTER_DISPLAY_LIMITS.MAX_QUICK_ACTIONS_DISPLAY);
  const stepText = displaySteps.map((step) => `• ${step}`).join("\n");

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Quick Actions:*\n${stepText}`,
    },
  };
};

/**
 * Format a divider block.
 */
const formatDivider = (): SlackBlock => ({ type: "divider" });

/**
 * Format the action buttons block.
 */
const formatActions = (context: OutputContext): SlackBlock => {
  const prButton: SlackBlockElement | null = context.prNumber
    ? {
        type: "button",
        text: { type: "plain_text", text: "View PR" },
        url: `https://github.com/${context.repository}/pull/${context.prNumber}`,
        style: "primary",
      }
    : null;

  const logsButton: SlackBlockElement = {
    type: "button",
    text: { type: "plain_text", text: "View Logs" },
    url: `https://github.com/${context.repository}/commit/${context.commitSha}/checks`,
  };

  const elements = [prButton, logsButton].filter(
    (element): element is SlackBlockElement => element !== null
  );

  return {
    type: "actions",
    elements,
  };
};

// ==================== Main Formatter ====================

/**
 * Format LLM analysis result as Slack message.
 *
 * @param analysis - The LLM analysis result
 * @param context - Output context with repository info
 * @returns Slack message output
 */
export const formatSlackMessage = (
  analysis: LLMAnalysisResult,
  context: OutputContext
): SlackMessageOutput => {
  const baseBlocks: SlackBlock[] = [
    formatHeader(context),
    formatSummary(context, analysis),
    formatDivider(),
    formatRootCause(analysis),
  ];

  const optionalBlocks = [formatTopIssues(analysis), formatNextSteps(analysis)].filter(
    (block): block is SlackBlock => block !== null
  );

  const footerBlocks: SlackBlock[] = [formatDivider(), formatActions(context)];

  const blocks = [...baseBlocks, ...optionalBlocks, ...footerBlocks];

  // Plain text fallback for notifications
  const cause = analysis.identifiedCause ?? analysis.summary ?? "Unknown error";
  const text = `🔴 CI Failure: ${context.repository} - ${cause}`;

  return { text, blocks };
};
