/**
 * Feedback Handler Types
 *
 * Type definitions for Slack feedback button interactions.
 */

/**
 * Type for Slack respond function
 */
export type RespondFunction = (message: {
  text: string;
  replace_original?: boolean;
  response_type?: "in_channel" | "ephemeral";
}) => Promise<void>;

/**
 * Type alias for Slack ack function
 */
export type AckFunction = () => Promise<void>;

/**
 * RAG feedback button value payload (matches slackContentBlocks.ts)
 */
export interface RAGFeedbackButtonValue {
  readonly analysisId: string;
  readonly knowledgeDocId: string;
  readonly similarity: number;
  readonly rank: number;
}
