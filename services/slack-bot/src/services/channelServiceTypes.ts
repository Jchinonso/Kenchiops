/**
 * Channel Service Types
 *
 * Type definitions for Slack channel resolution and lookup.
 */

import type { SlackApp } from "../types/slackTypes.js";

/**
 * Slack client type (derived from SlackApp)
 */
export type SlackClient = SlackApp["client"];

/**
 * Channel information from Slack API.
 */
export interface SlackChannel {
  readonly id?: string;
  readonly name?: string;
  readonly is_member?: boolean;
}
