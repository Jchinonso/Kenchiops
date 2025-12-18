/**
 * Handler for Slack app mentions.
 * Processes @kenchi mentions and returns AI analysis.
 */

import type { AppMentionEvent, SayFn } from '@slack/bolt';
import { logger, OpenAIClient, calculateConfidenceScore, TIME_CONSTANTS } from '@kenchi/shared';
import type { Event, Evidence } from '@kenchi/shared';
import { formatAnalysisMessage, formatErrorMessage } from '../formatters.js';
import type { SlackMentionPayload } from '../types/slackTypes.js';

/**
 * Extracts query from mention text by removing bot mentions.
 * 
 * @param text - Full mention text
 * @returns Extracted query string
 */
function extractQueryFromMention(text: string): string {
  return text.replace(/<@[^>]+>/g, '').trim();
}

/**
 * Creates an Event from a Slack mention.
 * 
 * @param event - Slack app mention event
 * @returns Event object
 */
function createEventFromMention(event: AppMentionEvent): Event {
  const query = extractQueryFromMention(event.text);

  return {
    id: `evt_mention_${Date.now()}_${event.user}`,
    type: 'MANUAL_TRIGGER',
    source: 'slack',
    timestamp: new Date(parseFloat(event.ts) * TIME_CONSTANTS.MILLISECONDS_PER_SECOND).toISOString(),
    severity: 'medium',
    title: 'Slack Mention Analysis',
    payload: {
      query,
      channel: event.channel,
      user: event.user,
      thread_ts: event.thread_ts,
    } as SlackMentionPayload,
    metadata: {
      triggeredBy: event.user,
    },
  };
}

/**
 * Creates minimal evidence for mention analysis.
 * 
 * @param eventId - Event ID
 * @returns Evidence object
 */
function createMinimalEvidence(eventId: string): Evidence {
  return {
    eventId,
    collectedAt: new Date().toISOString(),
    logs: [],
  };
}

/**
 * Creates feedback buttons for the analysis response.
 * 
 * @param eventId - Event ID for tracking
 * @param threadTs - Thread timestamp
 * @returns Slack Block Kit blocks
 */
function createFeedbackButtons(eventId: string, threadTs: string): unknown[] {
  return [
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
}

/**
 * Handles app mention events.
 * 
 * @param event - Slack app mention event
 * @param say - Function to send messages
 */
export async function handleAppMention(
  event: AppMentionEvent,
  say: SayFn
): Promise<void> {
  logger.info('Bot mentioned', {
    text: event.text,
    user: event.user,
    channel: event.channel,
  });

  try {
    const analysisEvent = createEventFromMention(event);
    const evidence = createMinimalEvidence(analysisEvent.id);

    const openaiClient = new OpenAIClient();
    const analysis = await openaiClient.analyzeIncident(analysisEvent, evidence);
    const confidenceResult = calculateConfidenceScore(analysis, evidence);

    logger.info('Mention analysis completed', {
      eventId: analysisEvent.id,
      confidence: confidenceResult.finalScore,
    });

    const blocks = formatAnalysisMessage(analysis, confidenceResult);

    await say({
      blocks: blocks as never,
      thread_ts: event.ts,
    });

    const feedbackBlocks = createFeedbackButtons(analysisEvent.id, event.ts);
    await say({
      blocks: feedbackBlocks as never,
      thread_ts: event.ts,
    });
  } catch (error) {
    logger.error('Error processing app mention', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    await say({
      blocks: formatErrorMessage(error instanceof Error ? error : new Error('Unknown error')) as never,
      thread_ts: event.ts,
    });
  }
}

