/**
 * Queue module - Redis-based message queue and pub/sub.
 */

// Types
export type {
  RedisOptions,
  QueueMessage,
  ProcessResult,
  MessageHandler,
  SubscriptionHandler,
  QueueConfig,
  QueueManager,
  QueueStats,
  SlackNotificationType,
  BaseNotificationPayload,
  ConsolidatedCIFailurePayload,
  ActionResultPayload,
  SystemAlertPayload,
  SlackNotificationPayload,
  NotificationHandler,
  WorkerOptions,
} from "./types.js";

// Redis client
export {
  getRedisClient,
  getSubscriberClient,
  isRedisHealthy,
  waitForRedisConnection,
  closeRedis,
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
} from "./messageQueue.js";

// Slack notification processor
export {
  enqueueConsolidatedNotification,
  enqueueActionResultNotification,
  enqueueSystemAlert,
  startSlackNotificationWorker,
  getSlackNotificationQueueStats,
} from "./slackNotificationProcessor.js";
