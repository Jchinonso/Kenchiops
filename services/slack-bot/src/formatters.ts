/**
 * Block Kit formatters for Slack messages.
 * Converts LLM analysis results into rich, interactive Slack messages.
 */

import {
  UI_CONSTANTS,
  SLACK_STATUS_EMOJI,
  getConfidenceEmoji,
  getConfidenceLabelParenthesized,
  type LLMAnalysisResult,
  type ActionProposal,
  type ConfidenceScoreResult,
} from "@kenchi/shared";
import type { SlackBlock } from "./types/slackTypes.js";

// ==================== Block Factory Functions ====================

/**
 * Create a header block with plain text.
 */
const createHeaderBlock = (text: string): SlackBlock => ({
  type: "header",
  text: { type: "plain_text", text, emoji: true },
});

/**
 * Create a section block with mrkdwn text.
 */
const createSectionBlock = (text: string): SlackBlock => ({
  type: "section",
  text: { type: "mrkdwn", text },
});

/**
 * Create a section block with mrkdwn fields.
 */
const createFieldsBlock = (fields: readonly string[]): SlackBlock => ({
  type: "section",
  fields: fields.map((text) => ({ type: "mrkdwn" as const, text })),
});

/**
 * Create a context block with mrkdwn text.
 */
const createContextBlock = (text: string): SlackBlock => ({
  type: "context",
  elements: [{ type: "mrkdwn", text }],
});

/**
 * Create a divider block.
 */
const createDividerBlock = (): SlackBlock => ({ type: "divider" });

/**
 * Formats an LLM analysis result as a Slack Block Kit message.
 *
 * @param analysis - The LLM analysis result
 * @param confidence - The confidence score result
 * @returns Slack Block Kit blocks array (mutable for Slack Bolt compatibility)
 */
export const formatAnalysisMessage = (
  analysis: LLMAnalysisResult,
  confidence: ConfidenceScoreResult
): SlackBlock[] => {
  const confidenceEmoji = getConfidenceEmoji(confidence.finalScore);
  const confidencePercent = (confidence.finalScore * UI_CONSTANTS.PERCENTAGE_MULTIPLIER).toFixed(0);

  const blocks: SlackBlock[] = [
    // Header with confidence indicator
    createHeaderBlock(`${confidenceEmoji} Incident Analysis`),

    // Confidence score section
    createFieldsBlock([
      `*Confidence:* ${confidencePercent}% ${getConfidenceLabelParenthesized(confidence.finalScore)}`,
      `*Gating:* ${confidence.gatingDecision.replace("_", " ")}`,
    ]),

    createDividerBlock(),

    // Summary section
    createSectionBlock(`*Summary*\n${analysis.summary}`),
  ];

  // Identified cause (if available)
  if (analysis.identifiedCause) {
    blocks.push(createSectionBlock(`*Root Cause*\n${analysis.identifiedCause}`));
  }

  // Impact assessment (if available)
  if (analysis.impactAssessment) {
    const impact = analysis.impactAssessment;
    blocks.push(
      createFieldsBlock([
        `*Scope:* ${impact.scope}`,
        `*Impact:* ${impact.businessImpact}`,
        `*Affected Users:* ${impact.affectedUsers}`,
      ])
    );
  }

  // Recommended actions
  if (analysis.recommendedActions && analysis.recommendedActions.length > 0) {
    blocks.push(createDividerBlock());
    blocks.push(createSectionBlock("*Recommended Actions*"));

    const actionsToShow = analysis.recommendedActions.slice(0, UI_CONSTANTS.MAX_ACTIONS_TO_DISPLAY);
    const actionBlocks = actionsToShow.map((action) =>
      createSectionBlock(
        `• *${action.actionType}* (Priority: ${action.priority})\n  ${action.description}`
      )
    );
    blocks.push(...actionBlocks);
  }

  // Uncertainties (if any)
  if (analysis.uncertainties && analysis.uncertainties.length > 0) {
    blocks.push(createDividerBlock());
    blocks.push(
      createSectionBlock(
        `*Uncertainties*\n${analysis.uncertainties.map((uncertainty) => `• ${uncertainty}`).join("\n")}`
      )
    );
  }

  // Footer with metadata
  const footerText = `Analysis by ${analysis.llmModel || "AI"} • ${new Date(analysis.analyzedAt).toLocaleString()} • Event: ${analysis.eventId}`;
  blocks.push(createContextBlock(footerText));

  return blocks;
};

/**
 * Formats action buttons for approval workflow.
 *
 * @param actions - Array of action proposals
 * @param eventId - Event ID for tracking
 * @returns Slack Block Kit blocks with action buttons (mutable for Slack Bolt compatibility)
 */
/**
 * Create an action button block.
 */
const createActionButtonsBlock = (eventId: string, actionId: string): SlackBlock => ({
  type: "actions",
  elements: [
    {
      type: "button",
      text: { type: "plain_text", text: "✓ Approve Action", emoji: true },
      style: "primary",
      value: JSON.stringify({ eventId, actionId }),
      action_id: `approve_action_${actionId}`,
    },
    {
      type: "button",
      text: { type: "plain_text", text: "✗ Reject", emoji: true },
      style: "danger",
      value: JSON.stringify({ eventId, actionId }),
      action_id: `reject_action_${actionId}`,
    },
  ],
});

export const formatActionButtons = (
  actions: readonly ActionProposal[],
  eventId: string
): SlackBlock[] => {
  if (actions.length === 0) {
    return [];
  }

  const actionsToShow = actions.slice(0, UI_CONSTANTS.MAX_ACTIONS_TO_DISPLAY);
  const approvalActions = actionsToShow.filter((action) => action.safetyLevel !== "safe");

  if (approvalActions.length === 0) {
    return [];
  }

  return [
    createDividerBlock(),
    createSectionBlock("*Actions require approval*"),
    ...approvalActions.map((action) => createActionButtonsBlock(eventId, action.id)),
  ];
};

/**
 * Formats an error message for Slack.
 *
 * @param error - The error object
 * @returns Slack Block Kit blocks (mutable for Slack Bolt compatibility)
 */
export const formatErrorMessage = (error: Error): SlackBlock[] => [
  createSectionBlock(":warning: *Error occurred*"),
  createSectionBlock(`\`\`\`${error.message}\`\`\``),
  createContextBlock("Please try again or contact support if the issue persists."),
];

/**
 * Formats a progress update message.
 *
 * @param actionId - Action identifier
 * @param status - Current status
 * @param message - Status message
 * @returns Slack Block Kit blocks (mutable for Slack Bolt compatibility)
 */
export const formatProgressUpdate = (
  actionId: string,
  status: "pending" | "in_progress" | "completed" | "failed",
  message: string
): SlackBlock[] => [
  createSectionBlock(`${SLACK_STATUS_EMOJI[status]} *Action ${actionId}*\n${message}`),
];
