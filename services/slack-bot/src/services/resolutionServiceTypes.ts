/**
 * Resolution Service Types
 *
 * Type definitions for CI failure thread tracking and resolution detection.
 */

/**
 * Slack API message element type (from conversations.replies response)
 */
export interface SlackAPIMessage {
  readonly ts?: string;
  readonly user?: string;
  readonly username?: string;
  readonly text?: string;
  readonly thread_ts?: string;
  readonly bot_id?: string;
  readonly reactions?: ReadonlyArray<{
    readonly name?: string;
    readonly count?: number;
    readonly users?: readonly string[];
  }>;
}

/**
 * Information stored about a CI failure thread
 */
export interface CIFailureThreadInfo {
  readonly channelId: string;
  readonly channelName?: string;
  readonly threadTs: string;
  readonly repository: string;
  readonly tenantId?: string;
  readonly commitSha: string;
  readonly checkNames: readonly string[];
  readonly errorMessage?: string;
  readonly trackedAt: Date;
}

/**
 * Payload for tracking a CI failure thread
 */
export interface TrackCIFailureThreadInput {
  readonly channelId: string;
  readonly channelName?: string;
  readonly threadTs: string;
  readonly repository: string;
  readonly tenantId?: string;
  readonly commitSha: string;
  readonly checkNames: readonly string[];
  readonly errorMessage?: string;
}
