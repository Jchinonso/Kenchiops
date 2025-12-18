/**
 * Handlers for Slack action button interactions.
 * Processes approve/reject actions and feedback buttons.
 */

import type { ButtonAction, SayFn } from '@slack/bolt';
import { logger, UI_CONSTANTS } from '@kenchi/shared';
import { formatProgressUpdate } from '../formatters.js';
import type { SlackActionValue } from '../types/slackTypes.js';

/**
 * Parses action value from Slack button action.
 * 
 * @param action - Slack button action
 * @returns Parsed action value
 * @throws {Error} If value cannot be parsed
 */
function parseActionValue(action: ButtonAction): SlackActionValue {
  if (!action.value) {
    throw new Error('Action value is missing');
  }
  try {
    return JSON.parse(action.value) as SlackActionValue;
  } catch (error) {
    throw new Error(`Failed to parse action value: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Handles action approval.
 * 
 * @param action - Slack button action
 * @param ack - Acknowledge function
 * @param say - Function to send messages
 * @param messageTs - Message timestamp for threading
 */
export async function handleActionApproval(
  action: ButtonAction,
  ack: () => Promise<void>,
  say: SayFn | undefined,
  messageTs?: string
): Promise<void> {
  await ack();

  const actionId = action.action_id;
  logger.info('Action approved', { action_id: actionId });

  try {
    const value = parseActionValue(action);

    if (!say) {
      logger.warn('Say function not available for action approval');
      return;
    }

    await say({
      blocks: formatProgressUpdate(value.actionId, 'in_progress', 'Action approved and executing...') as never,
      ...(messageTs && { thread_ts: messageTs }),
    });

    // TODO: Execute the actual action here
    // For now, just mark as completed after timeout
    setTimeout(async () => {
      if (say) {
        await say({
          blocks: formatProgressUpdate(value.actionId, 'completed', 'Action completed successfully') as never,
          ...(messageTs && { thread_ts: messageTs }),
        });
      }
    }, UI_CONSTANTS.ACTION_TIMEOUT_MS);
  } catch (error) {
    logger.error('Error handling action approval', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Handles action rejection.
 * 
 * @param action - Slack button action
 * @param ack - Acknowledge function
 * @param say - Function to send messages
 * @param messageTs - Message timestamp for threading
 */
export async function handleActionRejection(
  action: ButtonAction,
  ack: () => Promise<void>,
  say: SayFn | undefined,
  messageTs?: string
): Promise<void> {
  await ack();

  const actionId = action.action_id;
  logger.info('Action rejected', { action_id: actionId });

  try {
    const value = parseActionValue(action);

    if (!say) {
      logger.warn('Say function not available for action rejection');
      return;
    }

    await say({
      blocks: formatProgressUpdate(value.actionId, 'failed', 'Action rejected by user') as never,
      ...(messageTs && { thread_ts: messageTs }),
    });
  } catch (error) {
    logger.error('Error handling action rejection', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Handles positive feedback.
 * 
 * @param action - Slack button action
 * @param ack - Acknowledge function
 */
export async function handlePositiveFeedback(
  action: ButtonAction,
  ack: () => Promise<void>
): Promise<void> {
  await ack();

  const eventId = action.value;
  logger.info('Positive feedback received', { event_id: eventId });

  // TODO: Store feedback in database/metrics
}

/**
 * Handles negative feedback.
 * 
 * @param action - Slack button action
 * @param ack - Acknowledge function
 */
export async function handleNegativeFeedback(
  action: ButtonAction,
  ack: () => Promise<void>
): Promise<void> {
  await ack();

  const eventId = action.value;
  logger.info('Negative feedback received', { event_id: eventId });

  // TODO: Store feedback in database/metrics
}

