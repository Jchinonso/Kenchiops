/**
 * Slack Block Types
 *
 * Type definitions for Slack Block Kit structures.
 * Used across all Slack content block builders.
 */

/**
 * Slack text block structure
 */
export interface SlackTextBlock {
  readonly type: "section" | "header" | "divider" | "context";
  readonly text?: {
    readonly type: "mrkdwn" | "plain_text";
    readonly text: string;
    readonly emoji?: boolean;
  };
  readonly fields?: ReadonlyArray<{
    readonly type: "mrkdwn" | "plain_text";
    readonly text: string;
  }>;
  readonly elements?: ReadonlyArray<{
    readonly type: "mrkdwn" | "plain_text";
    readonly text: string;
  }>;
  readonly accessory?: SlackButtonElement;
}

/**
 * Slack button element structure
 */
export interface SlackButtonElement {
  readonly type: "button";
  readonly text: {
    readonly type: "plain_text";
    readonly text: string;
    readonly emoji: boolean;
  };
  readonly style?: "primary" | "danger";
  readonly value: string;
  readonly action_id: string;
}

/**
 * Slack actions block structure
 */
export interface SlackActionsBlock {
  readonly type: "actions";
  readonly block_id?: string;
  readonly elements: readonly SlackButtonElement[];
}

/**
 * Union type for all Slack block types
 */
export type SlackBlock = SlackTextBlock | SlackActionsBlock;

/**
 * Consolidated test failure data for display
 */
export interface ConsolidatedTestFailure {
  readonly testName: string;
  readonly file?: string;
  readonly line?: number;
}

/**
 * Consolidated annotation data for display
 */
export interface ConsolidatedAnnotation {
  readonly path: string;
  readonly line: number;
  readonly message: string;
  readonly suggestedFix?: string;
}

/**
 * RAG feedback button value payload.
 * Serialized as JSON in button value for feedback recording.
 */
export interface RAGFeedbackButtonValue {
  readonly analysisId: string;
  readonly knowledgeDocId: string;
  readonly similarity: number;
  readonly rank: number;
}
