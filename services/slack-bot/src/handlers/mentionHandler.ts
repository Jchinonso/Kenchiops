/**
 * Handler for Slack app mentions.
 * Processes @kenchi mentions and returns AI analysis.
 */

import type { AppMentionEvent, SayFn, SayArguments } from '@slack/bolt';
import { createLogger, TIME_CONSTANTS } from '@kenchi/shared';
import { formatAnalysisMessage, formatErrorMessage } from '../formatters.js';
import {
  createEventFromMention,
  performAnalysis,
} from '../services/analysisService.js';
import type { SlackBlock } from '../types/slackTypes.js';

// Type for Slack blocks compatible with Bolt
type SlackBlocks = NonNullable<SayArguments['blocks']>;

const logger = createLogger('slack-bot');

/**
 * Extracts query from mention text by removing bot mentions.
 */
const extractQueryFromMention = (text: string): string =>
  text.replace(/<@[^>]+>/g, '').trim();

/**
 * Creates feedback buttons for the analysis response.
 */
const createFeedbackButtons = (eventId: string): SlackBlock[] => [
  {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '👍 Helpful',
          emoji: true,
        },
        style: 'primary',
        value: eventId,
        action_id: 'feedback_helpful',
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '👎 Not helpful',
          emoji: true,
        },
        value: eventId,
        action_id: 'feedback_not_helpful',
      },
    ],
  },
];

/**
 * Handles app mention events.
 *
 * @param event - Slack app mention event
 * @param say - Function to send messages
 */
export const handleAppMention = async (
  event: AppMentionEvent,
  say: SayFn
): Promise<void> => {
  logger.info('Bot mentioned', {
    text: event.text,
    user: event.user,
    channel: event.channel,
  });

  try {
    const query = extractQueryFromMention(event.text);
    const timestamp = new Date(
      parseFloat(event.ts) * TIME_CONSTANTS.MILLISECONDS_PER_SECOND
    ).toISOString();

    // Ensure user is defined (required for analysis)
    const userId = event.user ?? 'unknown';

    const analysisEvent = createEventFromMention(
      userId,
      event.channel,
      query,
      event.thread_ts ?? event.ts
    );

    // Override timestamp with actual event timestamp
    const eventWithCorrectTime = {
      ...analysisEvent,
      timestamp,
    };

    const { analysis, confidence } = await performAnalysis(eventWithCorrectTime);

    logger.info('Mention analysis completed', {
      eventId: analysisEvent.id,
      confidence: confidence.finalScore,
    });

    const blocks = formatAnalysisMessage(analysis, confidence);

    await say({
      blocks: blocks as SlackBlocks,
      thread_ts: event.ts,
    });

    const feedbackBlocks = createFeedbackButtons(analysisEvent.id);
    await say({
      blocks: feedbackBlocks as SlackBlocks,
      thread_ts: event.ts,
    });
  } catch (error) {
    logger.error('Error processing app mention', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    const errorBlocks = formatErrorMessage(
      error instanceof Error ? error : new Error('Unknown error')
    );

    await say({
      blocks: errorBlocks as SlackBlocks,
      thread_ts: event.ts,
    });
  }
};
