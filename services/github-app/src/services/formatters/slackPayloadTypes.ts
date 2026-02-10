/**
 * Types for Slack Block Kit payload formatting.
 *
 * @module formatters/slackPayloadTypes
 */

// ==================== Slack Block Kit Types ====================

/**
 * Slack block element for buttons.
 */
export interface SlackBlockElement {
  readonly type: "button";
  readonly text: { readonly type: "plain_text"; readonly text: string };
  readonly url?: string;
  readonly action_id?: string;
  readonly value?: string;
}

/**
 * Slack block structure for Block Kit.
 */
export interface SlackBlock {
  readonly type: "header" | "section" | "divider" | "actions" | "context";
  readonly text?: { readonly type: "mrkdwn" | "plain_text"; readonly text: string };
  readonly fields?: ReadonlyArray<{ readonly type: "mrkdwn"; readonly text: string }>;
  readonly elements?: readonly SlackBlockElement[];
}

/**
 * Slack payload structure.
 */
export interface SlackPayload {
  readonly text: string;
  readonly blocks: readonly SlackBlock[];
}
