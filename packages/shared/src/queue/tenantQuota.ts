/**
 * Tenant Quota Enforcement
 *
 * Provides real-time per-tenant resource quota checks using Redis counters.
 * Quotas are plan-based and cover queue depth, processing time, and concurrency.
 *
 * Design:
 * - Queue depth: Redis key `kenchi:quota:{tenantId}:queue-depth:{queueName}` (INCR/DECR)
 * - Processing time: Redis key `kenchi:quota:{tenantId}:processing-time:{hourBucket}` (INCRBY + EXPIRE)
 * - Fail-open: if Redis is unavailable, all quota checks return `allowed: true`
 *
 * @module queue/tenantQuota
 */

import { getRedisClient } from "./redisClient.js";
import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/index.js";
import {
  TENANT_QUOTA_BY_PLAN,
  TENANT_QUOTA_DEFAULT_PLAN,
  TENANT_QUOTA_REDIS,
  REDIS_STATUS,
} from "../constants/index.js";
import type { TenantQuotaConfig, QuotaCheckResult } from "./tenantQuotaTypes.js";

export type { TenantQuotaConfig, QuotaCheckResult } from "./tenantQuotaTypes.js";

const logger = createLogger("tenant-quota");

// ==================== Redis Key Builders ====================

const buildQueueDepthKey = (tenantId: string, queueName: string): string =>
  `kenchi:quota:${tenantId}:queue-depth:${queueName}`;

const buildProcessingTimeKey = (tenantId: string, hourBucket: string): string =>
  `kenchi:quota:${tenantId}:processing-time:${hourBucket}`;

/**
 * Get the current hour bucket string (e.g., "2026-02-25T14").
 * Used for hourly processing-time accounting.
 */
const getCurrentHourBucket = (): string => new Date().toISOString().slice(0, 13);

// ==================== Plan Lookup ====================

/**
 * Get the quota configuration for a given plan tier.
 * Falls back to the free plan if plan is unknown.
 */
export const getQuotaForPlan = (planId: string): TenantQuotaConfig => {
  const quotas = TENANT_QUOTA_BY_PLAN as Readonly<Record<string, TenantQuotaConfig>>;
  return quotas[planId] ?? quotas[TENANT_QUOTA_DEFAULT_PLAN];
};

// ==================== Fail-Open Helper ====================

/**
 * Returns an "allowed" result when Redis is unavailable.
 * Fail-open ensures quota system doesn't block processing during Redis outages.
 */
const failOpen = (operation: string, error: unknown): QuotaCheckResult => {
  logger.warn("Quota check failed open (Redis unavailable)", {
    operation,
    error: getErrorMessage(error),
  });
  return { allowed: true };
};

/**
 * Check if Redis client is ready for operations.
 */
const isRedisReady = (): boolean => {
  try {
    const client = getRedisClient();
    return client.status === REDIS_STATUS.READY;
  } catch {
    return false;
  }
};

// ==================== Queue Depth ====================

/**
 * Check whether the tenant has capacity for another queued job.
 */
export const checkQueueDepthQuota = async (
  tenantId: string,
  queueName: string,
  planId?: string
): Promise<QuotaCheckResult> => {
  try {
    if (!isRedisReady()) {
      return { allowed: true };
    }

    const client = getRedisClient();
    const key = buildQueueDepthKey(tenantId, queueName);
    const currentDepth = await client.get(key);
    const current = currentDepth !== null ? parseInt(currentDepth, 10) : 0;
    const config = getQuotaForPlan(planId ?? TENANT_QUOTA_DEFAULT_PLAN);

    if (current >= config.maxQueueDepth) {
      return {
        allowed: false,
        reason: `Queue depth limit reached (${current}/${config.maxQueueDepth})`,
        currentUsage: current,
        limit: config.maxQueueDepth,
      };
    }

    return {
      allowed: true,
      currentUsage: current,
      limit: config.maxQueueDepth,
    };
  } catch (error) {
    return failOpen("checkQueueDepthQuota", error);
  }
};

/**
 * Increment the queue depth counter for a tenant after enqueuing a job.
 */
export const incrementQueueDepth = async (tenantId: string, queueName: string): Promise<void> => {
  try {
    if (!isRedisReady()) {
      return;
    }
    const client = getRedisClient();
    const key = buildQueueDepthKey(tenantId, queueName);
    await client.incr(key);
  } catch (error) {
    logger.warn("Failed to increment queue depth counter", {
      tenantId,
      queueName,
      error: getErrorMessage(error),
    });
  }
};

/**
 * Decrement the queue depth counter for a tenant after a job completes or is removed.
 */
export const decrementQueueDepth = async (tenantId: string, queueName: string): Promise<void> => {
  try {
    if (!isRedisReady()) {
      return;
    }
    const client = getRedisClient();
    const key = buildQueueDepthKey(tenantId, queueName);
    const result = await client.decr(key);
    // Floor at 0 to avoid negative drift from missed increments
    if (result < 0) {
      await client.set(key, "0");
    }
  } catch (error) {
    logger.warn("Failed to decrement queue depth counter", {
      tenantId,
      queueName,
      error: getErrorMessage(error),
    });
  }
};

// ==================== Processing Time ====================

/**
 * Record processing time consumed by a tenant for the current hour.
 */
export const recordProcessingTime = async (tenantId: string, durationMs: number): Promise<void> => {
  try {
    if (!isRedisReady()) {
      return;
    }
    const client = getRedisClient();
    const hourBucket = getCurrentHourBucket();
    const key = buildProcessingTimeKey(tenantId, hourBucket);

    // INCRBY atomically, then set TTL if this is the first increment
    const current = await client.incrby(key, Math.round(durationMs));
    if (current === Math.round(durationMs)) {
      // First write to this bucket -- set expiry
      await client.expire(key, TENANT_QUOTA_REDIS.PROCESSING_TIME_TTL_SECONDS);
    }
  } catch (error) {
    logger.warn("Failed to record processing time", {
      tenantId,
      durationMs,
      error: getErrorMessage(error),
    });
  }
};

/**
 * Check whether the tenant has remaining processing-time budget this hour.
 */
export const checkProcessingTimeQuota = async (
  tenantId: string,
  planId?: string
): Promise<QuotaCheckResult> => {
  try {
    if (!isRedisReady()) {
      return { allowed: true };
    }

    const client = getRedisClient();
    const hourBucket = getCurrentHourBucket();
    const key = buildProcessingTimeKey(tenantId, hourBucket);
    const currentRaw = await client.get(key);
    const current = currentRaw !== null ? parseInt(currentRaw, 10) : 0;
    const config = getQuotaForPlan(planId ?? TENANT_QUOTA_DEFAULT_PLAN);

    if (current >= config.maxProcessingTimePerHourMs) {
      return {
        allowed: false,
        reason: `Processing time limit reached (${current}ms/${config.maxProcessingTimePerHourMs}ms)`,
        currentUsage: current,
        limit: config.maxProcessingTimePerHourMs,
      };
    }

    return {
      allowed: true,
      currentUsage: current,
      limit: config.maxProcessingTimePerHourMs,
    };
  } catch (error) {
    return failOpen("checkProcessingTimeQuota", error);
  }
};
