/**
 * Handler for Slack message events.
 * Currently logs messages for future implementation.
 */

import { logger } from '@kenchi/shared';
import type { MessageEvent } from '@slack/bolt';

/**
 * Type guard to check if message has text property.
 * 
 * @param message - Slack message event
 * @returns True if message has text property
 */
function hasText(message: MessageEvent): message is MessageEvent & { text: string } {
  return 'text' in message && typeof message.text === 'string';
}

/**
 * Handles Slack message events.
 * Currently only logs messages - future implementation will analyze and respond.
 * 
 * @param message - Slack message event
 */
export async function handleMessage(message: MessageEvent): Promise<void> {
  // Skip bot messages to avoid loops
  if (message.subtype === 'bot_message') {
    return;
  }

  if (!hasText(message)) {
    return;
  }

  logger.debug('Slack message received', {
    text: message.text,
    user: 'user' in message ? message.user : undefined,
    channel: 'channel' in message ? message.channel : undefined,
  });

  // TODO: Check if message mentions the bot or is in a monitored channel
  // TODO: Use OpenAI to analyze message and generate response
  // TODO: Validate confidence before responding
}

