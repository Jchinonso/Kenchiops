/**
 * Slack-specific type definitions for the Slack bot service.
 * These types extend the shared Event types with Slack-specific structures.
 */

import type { Event, EventType, EventPayload } from "@kenchi/shared";

/**
 * Slack command payload structure.
 * Extends EventPayload by including index signature for compatibility.
 */
export interface SlackCommandPayload {
  readonly command: string;
  readonly user_id: string;
  readonly channel_id: string;
  readonly team_id?: string;
  readonly response_url?: string;
  readonly [key: string]: unknown;
}

/**
 * Slack mention payload structure.
 * Extends EventPayload by including index signature for compatibility.
 */
export interface SlackMentionPayload {
  readonly query: string;
  readonly channel: string;
  readonly user: string;
  readonly thread_ts?: string;
  readonly [key: string]: unknown;
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
export type SlackEventType = "SLACK_COMMAND" | "SLACK_MENTION";

/**
 * Extended Event type for Slack events
 */
export interface SlackEvent extends Omit<Event, "type" | "payload"> {
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
 * Slack action status types
 */
export type SlackActionStatus = "pending" | "in_progress" | "completed" | "failed";

// ==================== HTTP Endpoint Types ====================

/**
 * Slack attachment for colored side borders and rich formatting.
 */
export interface SlackAttachment {
  readonly color?: string;
  readonly fallback?: string;
  readonly blocks?: readonly SlackBlock[];
  readonly text?: string;
  readonly pretext?: string;
  readonly author_name?: string;
  readonly title?: string;
  readonly fields?: readonly {
    readonly title: string;
    readonly value: string;
    readonly short?: boolean;
  }[];
}

/**
 * CI Annotation from GitHub check run.
 */
export interface CIAnnotation {
  readonly path: string;
  readonly startLine: number;
  readonly endLine?: number;
  readonly level: "notice" | "warning" | "failure";
  readonly message: string;
  readonly title?: string;
}

/**
 * Test failure parsed from CI logs.
 */
export interface TestFailure {
  readonly testName: string;
  readonly file?: string;
  readonly error: string;
}

/**
 * PR metadata for context.
 */
export interface PRContext {
  readonly number: number;
  readonly title: string;
  readonly author: string;
  readonly branch: string;
  readonly baseBranch: string;
  readonly labels?: readonly string[];
  readonly isDraft?: boolean;
}

/**
 * Workflow timing information.
 */
export interface WorkflowContext {
  readonly name: string;
  readonly jobName?: string;
  readonly duration?: string;
  readonly conclusion?: string;
}

/**
 * CI Failure analysis data structure from CI failure.
 * Extended to include enriched context for better formatting.
 */
export interface CIFailureAnalysis {
  readonly repository: string;
  readonly confidence: number;
  readonly analysis: string;
  readonly identified_cause?: string;
  readonly recommended_actions?: readonly {
    readonly priority: string;
    readonly description: string;
    readonly actionType?: string;
  }[];
  // Enriched context
  readonly checkName?: string;
  readonly headSha?: string;
  readonly annotations?: readonly CIAnnotation[];
  readonly testFailures?: readonly TestFailure[];
  readonly prContext?: PRContext;
  readonly workflowContext?: WorkflowContext;
  readonly dependencyChanges?: readonly {
    readonly type: "added" | "removed" | "updated";
    readonly name: string;
    readonly oldVersion?: string;
    readonly newVersion?: string;
  }[];
}

/**
 * Request body structure for POST /slack/message endpoint.
 * Used by CI failure to post messages to Slack channels.
 * Supports plain text, Block Kit blocks, and attachments.
 *
 * Channel resolution:
 * 1. Explicit channel ID/name if provided
 * 2. Bot's active channel (fallback)
 */
export interface SlackMessageRequest {
  readonly channel?: string;
  readonly message?: string;
  readonly thread_ts?: string;
  readonly blocks?: readonly SlackBlock[];
  readonly attachments?: readonly SlackAttachment[];
  readonly analysis?: CIFailureAnalysis;
}

/**
 * Consolidated CI failure payload metadata
 */
export interface ConsolidatedMetadata {
  readonly repository: string;
  readonly commitSha: string;
  readonly failureCount: number;
  readonly checkNames: readonly string[];
  readonly avgConfidence: number;
  readonly isConsolidated: true;
}

/**
 * Pre-built consolidated Slack payload from GitHub App
 */
export interface ConsolidatedSlackPayload {
  readonly blocks: readonly SlackBlock[];
  readonly text: string;
  readonly metadata: ConsolidatedMetadata;
}

/**
 * Request body for consolidated CI failure messages.
 * Used when GitHub App aggregates multiple failures into one message.
 */
export interface ConsolidatedMessageRequest {
  readonly consolidated: true;
  readonly payload: ConsolidatedSlackPayload;
  readonly repository: string;
  readonly installation_id: number;
  readonly commit_sha: string;
  readonly failure_count: number;
  readonly channel?: string;
}

/**
 * Response structure for POST /slack/message endpoint.
 */
export interface SlackMessagePostResponse {
  readonly status: "sent" | "error";
  readonly channel?: string;
  readonly timestamp?: string;
  readonly thread_ts?: string;
  readonly error?: string;
}

/**
 * Request body structure for POST /slack/broadcast endpoint.
 * Used to broadcast messages to all channels the bot is a member of.
 */
export interface SlackBroadcastRequest {
  readonly message: string;
}

/**
 * Channel result in broadcast response.
 */
export interface SlackBroadcastChannelResult {
  readonly name: string;
  readonly id: string;
  readonly status: "sent" | "failed";
  readonly error?: string;
}

/**
 * Response structure for POST /slack/broadcast endpoint.
 */
export interface SlackBroadcastResponse {
  readonly status: "sent" | "partial" | "error";
  readonly channelsCount: number;
  readonly successCount: number;
  readonly failedCount: number;
  readonly channels?: readonly SlackBroadcastChannelResult[];
  readonly error?: string;
}
