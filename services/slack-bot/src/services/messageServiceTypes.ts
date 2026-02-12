/**
 * Message Service Types
 *
 * Type definitions for Slack message posting and broadcasting.
 */

import type { SlackBlock } from "../types/slackTypes.js";
import type { MessageAttachment } from "../formatters/ciFailureFormatter.js";

/**
 * Message payload for Slack API
 */
export interface MessagePayload {
  readonly fallbackText: string;
  readonly blocks?: SlackBlock[];
  readonly attachments?: MessageAttachment[];
}
