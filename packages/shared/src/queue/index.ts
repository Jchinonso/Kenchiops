/**
 * Queue module - Redis-based message queue and pub/sub.
 */

// Redis client
export {
  getRedisClient,
  getSubscriberClient,
  isRedisHealthy,
  closeRedis,
  type RedisOptions,
} from "./redisClient.js";

// Message queue
export {
  publish,
  subscribe,
  createQueue,
  ciAnalysisQueue,
  slackNotificationQueue,
  githubActionQueue,
  CHANNELS,
  type QueueMessage,
  type ProcessResult,
  type MessageHandler,
  type SubscriptionHandler,
  type QueueConfig,
} from "./messageQueue.js";
