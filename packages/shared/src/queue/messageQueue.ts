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
import { generateEventId, getErrorMessage } from "../core/index.js";
import {
  QUEUE_CONFIG,
  QUEUE_NAMES,
  QUEUE_RETRY_CONFIG,
  QUEUE_VISIBILITY_TIMEOUT,
  PUBSUB_CHANNELS,
  REDIS_LIST_OPS,
  REDIS_STATUS,
} from "../constants/index.js";

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

// ==================== Helper Functions ====================

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
    id: generateEventId(QUEUE_CONFIG.MESSAGE_ID_PREFIX),
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
        error: getErrorMessage(error),
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
    maxRetries = QUEUE_CONFIG.DEFAULT_MAX_RETRIES,
    // visibilityTimeout not used with non-blocking rpoplpush
    deadLetterQueue = `${name}${QUEUE_CONFIG.DEAD_LETTER_SUFFIX}`,
  } = queueConfig;

  const processingQueue = `${name}${QUEUE_CONFIG.PROCESSING_SUFFIX}`;

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
      id: generateEventId(QUEUE_CONFIG.MESSAGE_ID_PREFIX),
      type,
      payload,
      timestamp: new Date().toISOString(),
      retryCount: QUEUE_CONFIG.INITIAL_RETRY_COUNT,
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
   * Processes jobs from the queue (non-blocking)
   * Uses rpoplpush instead of brpoplpush to avoid blocking the Redis connection
   */
  const process = async <T>(handler: MessageHandler<T>): Promise<void> => {
    const client = getRedisClient();

    // Check if Redis is ready
    if (client.status !== REDIS_STATUS.READY) {
      return; // Skip if not ready
    }

    // Move job from main queue to processing queue (atomic, non-blocking)
    const data = await client.rpoplpush(name, processingQueue);

    if (!data) return; // No job available

    const message = deserializeMessage<T>(data);
    const startTime = Date.now();

    try {
      const result = await handler(message);

      if (result.success) {
        // Remove from processing queue
        await client.lrem(processingQueue, REDIS_LIST_OPS.REMOVE_FIRST_MATCH, data);
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
        await client.lrem(processingQueue, REDIS_LIST_OPS.REMOVE_FIRST_MATCH, data);
        await client.lpush(name, serializeMessage(updatedMessage));
        logger.warn("Job retrying", {
          queue: name,
          messageId: message.id,
          retryCount: updatedMessage.retryCount,
          error: result.error,
        });
      } else {
        // Move to dead letter queue
        await client.lrem(processingQueue, REDIS_LIST_OPS.REMOVE_FIRST_MATCH, data);
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
      const errorMessage = getErrorMessage(error);

      if ((message.retryCount ?? 0) < maxRetries) {
        const updatedMessage: QueueMessage<T> = {
          ...message,
          retryCount: (message.retryCount ?? 0) + 1,
        };
        await client.lrem(processingQueue, REDIS_LIST_OPS.REMOVE_FIRST_MATCH, data);
        await client.lpush(name, serializeMessage(updatedMessage));
        logger.warn("Job failed, retrying", {
          queue: name,
          messageId: message.id,
          retryCount: updatedMessage.retryCount,
          error: errorMessage,
        });
      } else {
        await client.lrem(processingQueue, REDIS_LIST_OPS.REMOVE_FIRST_MATCH, data);
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
  name: QUEUE_NAMES.CI_ANALYSIS,
  maxRetries: QUEUE_RETRY_CONFIG.CI_ANALYSIS,
  visibilityTimeout: QUEUE_VISIBILITY_TIMEOUT.CI_ANALYSIS,
});

/**
 * Queue for Slack notification jobs
 */
export const slackNotificationQueue = createQueue({
  name: QUEUE_NAMES.SLACK_NOTIFICATIONS,
  maxRetries: QUEUE_RETRY_CONFIG.SLACK_NOTIFICATION,
  visibilityTimeout: QUEUE_VISIBILITY_TIMEOUT.SLACK_NOTIFICATION,
});

/**
 * Queue for GitHub action jobs (rerun pipeline, post comment, etc.)
 */
export const githubActionQueue = createQueue({
  name: QUEUE_NAMES.GITHUB_ACTIONS,
  maxRetries: QUEUE_RETRY_CONFIG.GITHUB_ACTION,
  visibilityTimeout: QUEUE_VISIBILITY_TIMEOUT.GITHUB_ACTION,
});

// ==================== Event Channels ====================

/**
 * Pre-defined pub/sub channels
 * @deprecated Use PUBSUB_CHANNELS from constants instead
 */
export const CHANNELS = PUBSUB_CHANNELS;
