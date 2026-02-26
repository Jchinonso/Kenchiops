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

// Message queue (factories and pub/sub)
export { publish, subscribe, createQueue, CHANNELS } from "./messageQueue.js";

// Pre-defined queue instances
export { ciAnalysisQueue, slackNotificationQueue, githubActionQueue } from "./queueInstances.js";

// Slack notification processor
export {
  enqueueConsolidatedNotification,
  enqueueActionResultNotification,
  enqueueSystemAlert,
  startSlackNotificationWorker,
  getSlackNotificationQueueStats,
} from "./slackNotificationProcessor.js";

// Fair scheduler (weighted round-robin per-tenant queuing)
export { createFairQueue } from "./fairScheduler.js";

export type { FairQueueConfig, FairQueueManager } from "./fairSchedulerTypes.js";

// Per-tenant resource quotas
export {
  getQuotaForPlan,
  checkQueueDepthQuota,
  incrementQueueDepth,
  decrementQueueDepth,
  recordProcessingTime,
  checkProcessingTimeQuota,
} from "./tenantQuota.js";

export type { TenantQuotaConfig, QuotaCheckResult } from "./tenantQuotaTypes.js";
