/**
 * Slack-specific type definitions for the Slack bot service.
 * These types extend the shared Event types with Slack-specific structures.
 */

import type { Event, EventType, EventSeverity } from '@kenchi/shared';

/**
 * Slack command payload structure
 */
export interface SlackCommandPayload {
  readonly command: string;
  readonly user_id: string;
  readonly channel_id: string;
  readonly team_id?: string;
  readonly response_url?: string;
}

/**
 * Slack mention payload structure
 */
export interface SlackMentionPayload {
  readonly query: string;
  readonly channel: string;
  readonly user: string;
  readonly thread_ts?: string;
}

/**
 * Slack action button value structure
 */
export interface SlackActionValue {
  readonly eventId: string;
  readonly actionId: string;
}

/**
 * Slack event types
 */
export type SlackEventType = 'SLACK_COMMAND' | 'SLACK_MENTION';

/**
 * Extended Event type for Slack events
 */
export interface SlackEvent extends Omit<Event, 'type' | 'payload'> {
  readonly type: EventType | SlackEventType;
  readonly payload: EventPayload | SlackCommandPayload | SlackMentionPayload;
}

/**
 * Slack Block Kit block types
 */
export interface SlackBlock {
  readonly type: string;
  readonly [key: string]: unknown;
}

/**
 * Slack message response structure
 */
export interface SlackMessageResponse {
  readonly blocks?: readonly SlackBlock[];
  readonly text?: string;
  readonly response_type?: 'ephemeral' | 'in_channel';
  readonly thread_ts?: string;
}

/**
 * Slack action status types
 */
export type SlackActionStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

