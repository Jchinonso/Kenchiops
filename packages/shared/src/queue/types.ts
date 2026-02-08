/**
 * Type definitions for the queue module.
 *
 * All interfaces and type aliases for Redis-based message queue,
 * pub/sub, and Slack notification processing.
 *
 * @module queue/types
 */

import type { AggregatedFailures } from "../aggregation/types.js";

// ==================== Redis Client Types ====================

/**
 * Redis connection options
 */
export interface RedisOptions {
  /** Redis URL (redis://host:port) */
  readonly url?: string;
  /** Maximum retry attempts */
  readonly maxRetries?: number;
  /** Enable offline queue (buffer commands while disconnected) */
  readonly enableOfflineQueue?: boolean;
  /** Connection timeout in milliseconds */
  readonly connectTimeout?: number;
}

// ==================== Message Queue Types ====================

/**
 * Message payload structure
 */
export interface QueueMessage<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly payload: T;
  readonly timestamp: string;
  readonly retryCount?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Job processing result
 */
export interface ProcessResult {
  readonly success: boolean;
  readonly error?: string;
  readonly shouldRetry?: boolean;
}

/**
 * Message handler function
 */
export type MessageHandler<T = unknown> = (message: QueueMessage<T>) => Promise<ProcessResult>;

/**
 * Subscription handler for pub/sub
 */
export type SubscriptionHandler<T = unknown> = (message: QueueMessage<T>) => Promise<void>;

/**
 * Queue configuration
 */
export interface QueueConfig {
  /** Queue name */
  readonly name: string;
  /** Maximum retry attempts before moving to dead letter queue */
  readonly maxRetries?: number;
  /** Visibility timeout in seconds (how long a job is hidden while processing) */
  readonly visibilityTimeout?: number;
  /** Dead letter queue name (default: {name}:dead) */
  readonly deadLetterQueue?: string;
}

/**
 * Queue statistics snapshot
 */
export interface QueueStats {
  readonly pending: number;
  readonly processing: number;
  readonly dead: number;
}

/**
 * Queue manager interface
 */
export interface QueueManager {
  readonly name: string;
  readonly enqueue: <T>(
    type: string,
    payload: T,
    metadata?: Record<string, unknown>
  ) => Promise<string>;
  readonly process: <T>(handler: MessageHandler<T>) => Promise<void>;
  readonly getStats: () => Promise<QueueStats>;
  readonly clear: () => Promise<void>;
}

// ==================== Slack Notification Types ====================

/**
 * Slack notification job types
 */
export type SlackNotificationType =
  | "consolidated_ci_failure"
  | "single_ci_failure"
  | "action_result"
  | "system_alert";

/**
 * Base notification payload
 */
export interface BaseNotificationPayload {
  readonly type: SlackNotificationType;
  readonly repository: string;
  readonly installationId: number;
  readonly timestamp: string;
}

/**
 * Consolidated CI failure notification payload
 */
export interface ConsolidatedCIFailurePayload extends BaseNotificationPayload {
  readonly type: "consolidated_ci_failure";
  readonly aggregation: AggregatedFailures;
  readonly slackPayload: {
    readonly blocks: readonly unknown[];
    readonly text: string;
    readonly metadata?: Record<string, unknown>;
  };
}

/**
 * Action result notification payload
 */
export interface ActionResultPayload extends BaseNotificationPayload {
  readonly type: "action_result";
  readonly actionId: string;
  readonly actionType: string;
  readonly success: boolean;
  readonly message: string;
  readonly channelId?: string;
  readonly threadTs?: string;
}

/**
 * System alert notification payload
 */
export interface SystemAlertPayload extends BaseNotificationPayload {
  readonly type: "system_alert";
  readonly severity: "info" | "warning" | "error" | "critical";
  readonly title: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Union type for all notification payloads
 */
export type SlackNotificationPayload =
  | ConsolidatedCIFailurePayload
  | ActionResultPayload
  | SystemAlertPayload;

/**
 * Notification handler function type
 */
export type NotificationHandler = (
  payload: SlackNotificationPayload
) => Promise<{ success: boolean; error?: string }>;

// ==================== Worker Types ====================

/**
 * Worker configuration options for queue processing
 */
export interface WorkerOptions {
  /** Poll interval in milliseconds between queue checks */
  readonly pollIntervalMs?: number;
  /** Maximum number of concurrent workers */
  readonly maxConcurrent?: number;
}
