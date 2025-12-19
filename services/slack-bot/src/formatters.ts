/**
 * Block Kit formatters for Slack messages.
 * Converts LLM analysis results into rich, interactive Slack messages.
 */

import type {
  LLMAnalysisResult,
  ActionProposal,
  ConfidenceScoreResult,
} from '@kenchi/shared';
import {
  UI_CONFIDENCE_THRESHOLDS,
  UI_CONSTANTS,
} from '@kenchi/shared';
import type { SlackBlock } from './types/slackTypes.js';

/**
 * Formats an LLM analysis result as a Slack Block Kit message.
 *
 * @param analysis - The LLM analysis result
 * @param confidence - The confidence score result
 * @returns Slack Block Kit blocks array (mutable for Slack Bolt compatibility)
 */
export function formatAnalysisMessage(
  analysis: LLMAnalysisResult,
  confidence: ConfidenceScoreResult
): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  // Header with confidence indicator
  const confidenceEmoji = getConfidenceEmoji(confidence.finalScore);
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `${confidenceEmoji} Incident Analysis`,
      emoji: true,
    },
  });

  // Confidence score section
  blocks.push({
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: `*Confidence:* ${(confidence.finalScore * UI_CONSTANTS.PERCENTAGE_MULTIPLIER).toFixed(0)}% ${getConfidenceLabel(confidence.finalScore)}`,
      },
      {
        type: 'mrkdwn',
        text: `*Gating:* ${confidence.gatingDecision.replace('_', ' ')}`,
      },
    ],
  });

  blocks.push({ type: 'divider' });

  // Summary section
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Summary*\n${analysis.summary}`,
    },
  });

  // Identified cause (if available)
  if (analysis.identifiedCause) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Root Cause*\n${analysis.identifiedCause}`,
      },
    });
  }

  // Impact assessment (if available)
  if (analysis.impactAssessment) {
    const impact = analysis.impactAssessment;
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Scope:* ${impact.scope}`,
        },
        {
          type: 'mrkdwn',
          text: `*Impact:* ${impact.businessImpact}`,
        },
        {
          type: 'mrkdwn',
          text: `*Affected Users:* ${impact.affectedUsers}`,
        },
      ],
    });
  }

  // Recommended actions
  if (analysis.recommendedActions && analysis.recommendedActions.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Recommended Actions*',
      },
    });

    for (const action of analysis.recommendedActions.slice(0, UI_CONSTANTS.MAX_ACTIONS_TO_DISPLAY)) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• *${action.actionType}* (Priority: ${action.priority})\n  ${action.description}`,
        },
      });
    }
  }

  // Uncertainties (if any)
  if (analysis.uncertainties && analysis.uncertainties.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Uncertainties*\n${analysis.uncertainties.map((u) => `• ${u}`).join('\n')}`,
      },
    });
  }

  // Footer with metadata
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Analysis by ${analysis.llmModel || 'AI'} • ${new Date(analysis.analyzedAt).toLocaleString()} • Event: ${analysis.eventId}`,
      },
    ],
  });

  return blocks;
}

/**
 * Formats action buttons for approval workflow.
 *
 * @param actions - Array of action proposals
 * @param eventId - Event ID for tracking
 * @returns Slack Block Kit blocks with action buttons (mutable for Slack Bolt compatibility)
 */
export function formatActionButtons(
  actions: readonly ActionProposal[],
  eventId: string
): SlackBlock[] {
  if (actions.length === 0) {
    return [];
  }

  const blocks: SlackBlock[] = [];

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Actions require approval*',
    },
  });

  // Add approve/reject buttons for each high-impact action
  for (const action of actions.slice(0, UI_CONSTANTS.MAX_ACTIONS_TO_DISPLAY)) {
    if (action.safetyLevel !== 'safe') {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: `✓ Approve Action`,
              emoji: true,
            },
            style: 'primary',
            value: JSON.stringify({ eventId, actionId: action.id }),
            action_id: `approve_action_${action.id}`,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✗ Reject',
              emoji: true,
            },
            style: 'danger',
            value: JSON.stringify({ eventId, actionId: action.id }),
            action_id: `reject_action_${action.id}`,
          },
        ],
      });
    }
  }

  return blocks;
}

/**
 * Formats an error message for Slack.
 *
 * @param error - The error object
 * @returns Slack Block Kit blocks (mutable for Slack Bolt compatibility)
 */
export function formatErrorMessage(error: Error): SlackBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: ':warning: *Error occurred*',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `\`\`\`${error.message}\`\`\``,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Please try again or contact support if the issue persists.',
        },
      ],
    },
  ];
}

/**
 * Formats a progress update message.
 *
 * @param actionId - Action identifier
 * @param status - Current status
 * @param message - Status message
 * @returns Slack Block Kit blocks (mutable for Slack Bolt compatibility)
 */
export function formatProgressUpdate(
  actionId: string,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  message: string
): SlackBlock[] {
  const statusEmoji = {
    pending: ':hourglass_flowing_sand:',
    in_progress: ':gear:',
    completed: ':white_check_mark:',
    failed: ':x:',
  };

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${statusEmoji[status]} *Action ${actionId}*\n${message}`,
      },
    },
  ];
}

/**
 * Helper to get confidence emoji based on score.
 */
function getConfidenceEmoji(score: number): string {
  if (score >= UI_CONFIDENCE_THRESHOLDS.VERY_HIGH) return ':large_green_circle:';
  if (score >= UI_CONFIDENCE_THRESHOLDS.HIGH) return ':large_blue_circle:';
  if (score >= UI_CONFIDENCE_THRESHOLDS.MEDIUM) return ':large_yellow_circle:';
  if (score >= UI_CONFIDENCE_THRESHOLDS.LOW) return ':large_orange_circle:';
  return ':red_circle:';
}

/**
 * Helper to get confidence label based on score.
 */
function getConfidenceLabel(score: number): string {
  if (score >= UI_CONFIDENCE_THRESHOLDS.VERY_HIGH) return '(Very High)';
  if (score >= UI_CONFIDENCE_THRESHOLDS.HIGH) return '(High)';
  if (score >= UI_CONFIDENCE_THRESHOLDS.MEDIUM) return '(Medium)';
  if (score >= UI_CONFIDENCE_THRESHOLDS.LOW) return '(Low)';
  return '(Very Low)';
}
