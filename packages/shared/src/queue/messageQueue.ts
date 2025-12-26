/**
 * Message Queue Module
 *
 * Provides reliable message queue and pub/sub functionality using Redis.
 * Supports:
 * - Pub/Sub for real-time event broadcasting
 * - Reliable job queue with acknowledgment
 * - Dead letter queue for failed jobs
 *
 * @module queue/messageQueue
 */

import { getRedisClient, getSubscriberClient } from "./redisClient.js";
import { createLogger } from "../core/logger.js";

const logger = createLogger("message-queue");

// ==================== Types ====================

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

// ==================== Constants ====================

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_VISIBILITY_TIMEOUT = 30; // seconds
const PROCESSING_SUFFIX = ":processing";

// ==================== Helper Functions ====================

/**
 * Generates a unique message ID
 */
const generateMessageId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `msg_${timestamp}_${random}`;
};

/**
 * Serializes a message for storage
 */
const serializeMessage = <T>(message: QueueMessage<T>): string => JSON.stringify(message);

/**
 * Deserializes a stored message
 */
const deserializeMessage = <T>(data: string): QueueMessage<T> =>
  JSON.parse(data) as QueueMessage<T>;

// ==================== Pub/Sub Functions ====================

/**
 * Publishes a message to a channel
 */
export const publish = async <T>(
  channel: string,
  type: string,
  payload: T,
  metadata?: Record<string, unknown>
): Promise<string> => {
  const client = getRedisClient();
  const message: QueueMessage<T> = {
    id: generateMessageId(),
    type,
    payload,
    timestamp: new Date().toISOString(),
    metadata,
  };

  const serialized = serializeMessage(message);
  await client.publish(channel, serialized);

  logger.debug("Message published", {
    channel,
    messageId: message.id,
    type,
  });

  return message.id;
};

/**
 * Subscribes to a channel
 */
export const subscribe = async <T>(
  channel: string,
  handler: SubscriptionHandler<T>
): Promise<() => Promise<void>> => {
  const subscriber = getSubscriberClient();

  const messageHandler = async (_channel: string, data: string): Promise<void> => {
    try {
      const message = deserializeMessage<T>(data);
      await handler(message);
    } catch (error) {
      logger.error("Error processing subscription message", {
        channel,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  subscriber.on("message", messageHandler);
  await subscriber.subscribe(channel);

  logger.info("Subscribed to channel", { channel });

  // Return unsubscribe function
  return async () => {
    subscriber.off("message", messageHandler);
    await subscriber.unsubscribe(channel);
    logger.info("Unsubscribed from channel", { channel });
  };
};

// ==================== Job Queue Functions ====================

/**
 * Creates a queue manager for reliable job processing
 */
export const createQueue = (queueConfig: QueueConfig) => {
  const {
    name,
    maxRetries = DEFAULT_MAX_RETRIES,
    visibilityTimeout = DEFAULT_VISIBILITY_TIMEOUT,
    deadLetterQueue = `${name}:dead`,
  } = queueConfig;

  const processingQueue = `${name}${PROCESSING_SUFFIX}`;

  /**
   * Adds a job to the queue
   */
  const enqueue = async <T>(
    type: string,
    payload: T,
    metadata?: Record<string, unknown>
  ): Promise<string> => {
    const client = getRedisClient();
    const message: QueueMessage<T> = {
      id: generateMessageId(),
      type,
      payload,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      metadata,
    };

    await client.lpush(name, serializeMessage(message));

    logger.debug("Job enqueued", {
      queue: name,
      messageId: message.id,
      type,
    });

    return message.id;
  };

  /**
   * Processes jobs from the queue
   */
  const process = async <T>(handler: MessageHandler<T>): Promise<void> => {
    const client = getRedisClient();

    // Move job from main queue to processing queue (atomic)
    const data = await client.brpoplpush(name, processingQueue, visibilityTimeout);

    if (!data) return; // No job available

    const message = deserializeMessage<T>(data);
    const startTime = Date.now();

    try {
      const result = await handler(message);

      if (result.success) {
        // Remove from processing queue
        await client.lrem(processingQueue, 1, data);
        logger.info("Job completed", {
          queue: name,
          messageId: message.id,
          duration: Date.now() - startTime,
        });
      } else if (result.shouldRetry !== false && (message.retryCount ?? 0) < maxRetries) {
        // Retry: update retry count and move back to main queue
        const updatedMessage: QueueMessage<T> = {
          ...message,
          retryCount: (message.retryCount ?? 0) + 1,
        };
        await client.lrem(processingQueue, 1, data);
        await client.lpush(name, serializeMessage(updatedMessage));
        logger.warn("Job retrying", {
          queue: name,
          messageId: message.id,
          retryCount: updatedMessage.retryCount,
          error: result.error,
        });
      } else {
        // Move to dead letter queue
        await client.lrem(processingQueue, 1, data);
        await client.lpush(deadLetterQueue, data);
        logger.error("Job moved to dead letter queue", {
          queue: name,
          messageId: message.id,
          retryCount: message.retryCount,
          error: result.error,
        });
      }
    } catch (error) {
      // Unexpected error - retry if possible
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if ((message.retryCount ?? 0) < maxRetries) {
        const updatedMessage: QueueMessage<T> = {
          ...message,
          retryCount: (message.retryCount ?? 0) + 1,
        };
        await client.lrem(processingQueue, 1, data);
        await client.lpush(name, serializeMessage(updatedMessage));
        logger.warn("Job failed, retrying", {
          queue: name,
          messageId: message.id,
          retryCount: updatedMessage.retryCount,
          error: errorMessage,
        });
      } else {
        await client.lrem(processingQueue, 1, data);
        await client.lpush(deadLetterQueue, data);
        logger.error("Job failed, moved to dead letter queue", {
          queue: name,
          messageId: message.id,
          error: errorMessage,
        });
      }
    }
  };

  /**
   * Gets queue statistics
   */
  const getStats = async (): Promise<{
    pending: number;
    processing: number;
    dead: number;
  }> => {
    const client = getRedisClient();
    const [pending, processing, dead] = await Promise.all([
      client.llen(name),
      client.llen(processingQueue),
      client.llen(deadLetterQueue),
    ]);
    return { pending, processing, dead };
  };

  /**
   * Clears all jobs from the queue (use with caution)
   */
  const clear = async (): Promise<void> => {
    const client = getRedisClient();
    await Promise.all([client.del(name), client.del(processingQueue), client.del(deadLetterQueue)]);
    logger.warn("Queue cleared", { queue: name });
  };

  return {
    enqueue,
    process,
    getStats,
    clear,
    name,
  };
};

// ==================== Pre-defined Queues ====================

/**
 * Queue for CI analysis jobs (async processing)
 */
export const ciAnalysisQueue = createQueue({
  name: "kenchi:ci-analysis",
  maxRetries: 3,
  visibilityTimeout: 60,
});

/**
 * Queue for Slack notification jobs
 */
export const slackNotificationQueue = createQueue({
  name: "kenchi:slack-notifications",
  maxRetries: 5,
  visibilityTimeout: 30,
});

/**
 * Queue for GitHub action jobs (rerun pipeline, post comment, etc.)
 */
export const githubActionQueue = createQueue({
  name: "kenchi:github-actions",
  maxRetries: 3,
  visibilityTimeout: 120,
});

// ==================== Event Channels ====================

/**
 * Pre-defined pub/sub channels
 */
export const CHANNELS = {
  /** CI failure events */
  CI_FAILURES: "kenchi:events:ci-failures",
  /** Action execution events */
  ACTION_EVENTS: "kenchi:events:actions",
  /** System health events */
  HEALTH_EVENTS: "kenchi:events:health",
} as const;
