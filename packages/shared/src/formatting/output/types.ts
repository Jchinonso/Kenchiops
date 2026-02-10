/**
 * Output Formatter Types
 *
 * Type definitions for GitHub and Slack output formatters.
 * Includes context, comment, and message structures.
 *
 * @module formatting/output/types
 */

// ==================== Output Context ====================

/**
 * Context for output formatting.
 */
export interface OutputContext {
  readonly repository: string;
  readonly commitSha: string;
  readonly checkName: string;
  readonly prNumber?: number;
  readonly branchName?: string;
  readonly baseBranch?: string;
  readonly failedChecks?: readonly string[];
  readonly passedChecks?: readonly string[];
}

// ==================== GitHub Types ====================

/**
 * GitHub comment output structure.
 */
export interface GitHubCommentOutput {
  readonly body: string;
}

// ==================== Slack Types ====================

/**
 * Slack text element.
 */
export interface SlackTextElement {
  readonly type: "mrkdwn" | "plain_text";
  readonly text: string;
}

/**
 * Slack block element (button).
 */
export interface SlackBlockElement {
  readonly type: "button";
  readonly text: { readonly type: "plain_text"; readonly text: string };
  readonly url?: string;
  readonly style?: "primary" | "danger";
}

/**
 * Slack block structure.
 */
export interface SlackBlock {
  readonly type: "header" | "section" | "divider" | "actions" | "context";
  readonly text?: SlackTextElement;
  readonly fields?: readonly SlackTextElement[];
  readonly elements?: readonly (SlackBlockElement | SlackTextElement)[];
}

/**
 * Slack message output structure.
 */
export interface SlackMessageOutput {
  readonly text: string;
  readonly blocks: readonly SlackBlock[];
}
