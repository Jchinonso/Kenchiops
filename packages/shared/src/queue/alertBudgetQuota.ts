/**
 * Alert Budget Quota Enforcement
 *
 * Provides real-time per-tenant alert budget checks using Redis counters.
 * Budgets are plan-based and cover daily analyses, active streams, and windows.
 *
 * Design:
 * - Analyses: Redis key `kenchi:alert-budget:{tenantId}:analyses:{dayBucket}` (INCR + EXPIRE)
 * - Active streams: Redis key `kenchi:alert-budget:{tenantId}:active-streams` (INCR/DECR)
 * - Windows: Redis key `kenchi:alert-budget:{tenantId}:windows:{dayBucket}` (INCR + EXPIRE)
 * - Fail-open: if Redis is unavailable, all checks return `allowed: true`
 *
 * @module queue/alertBudgetQuota
 */

import { getRedisClient } from "./redisClient.js";
import { createLogger, withTimeout, getErrorMessage } from "../core/index.js";
import {
  ALERT_BUDGET_BY_PLAN,
  ALERT_BUDGET_DEFAULT_PLAN,
  ALERT_BUDGET_REDIS_TTL,
  REDIS_STATUS,
  REDIS_TIMEOUTS,
} from "../constants/index.js";
import type { AlertBudgetConfig } from "./alertBudgetQuotaTypes.js";
import type { QuotaCheckResult } from "./tenantQuotaTypes.js";
import type { RequestContext } from "../core/types.js";

export type { AlertBudgetConfig } from "./alertBudgetQuotaTypes.js";

const logger = createLogger("alert-budget-quota");

// ==================== Redis Key Builders ====================

const buildAnalysesKey = (tenantId: string, dayBucket: string): string =>
  `kenchi:alert-budget:${tenantId}:analyses:${dayBucket}`;

const buildActiveStreamsKey = (tenantId: string): string =>
  `kenchi:alert-budget:${tenantId}:active-streams`;

const buildWindowsKey = (tenantId: string, dayBucket: string): string =>
  `kenchi:alert-budget:${tenantId}:windows:${dayBucket}`;

/**
 * Get the current day bucket string (YYYY-MM-DD) in UTC.
 */
const getCurrentDayBucket = (): string => new Date().toISOString().slice(0, 10);

// ==================== Plan Lookup ====================

/**
 * Get the alert budget configuration for a given plan tier.
 * Falls back to the free plan if plan is unknown.
 */
export const getAlertBudgetForPlan = (planId: string): AlertBudgetConfig => {
  const budgets = ALERT_BUDGET_BY_PLAN as Readonly<Record<string, AlertBudgetConfig>>;
  return budgets[planId] ?? budgets[ALERT_BUDGET_DEFAULT_PLAN];
};

// ==================== Fail-Open Helpers ====================

const failOpen = (operation: string, error: unknown, context: RequestContext): QuotaCheckResult => {
  logger.warn("Alert budget check failed open (Redis unavailable)", {
    provider: "redis",
    operation,
    error: getErrorMessage(error),
    ...context,
  });
  return { allowed: true };
};

const isRedisReady = (): boolean => {
  try {
    const client = getRedisClient();
    return client.status === REDIS_STATUS.READY;
  } catch {
    return false;
  }
};

/**
 * Helper: checks if a limit value means "unlimited" (0 = unlimited).
 */
const isUnlimited = (limit: number): boolean => limit === 0;

// ==================== Analysis Quota ====================

/**
 * Check whether the tenant has remaining daily analysis budget.
 * Returns `allowed: true` if under limit or if limit is unlimited (0).
 */
export const checkAlertAnalysisQuota = async (
  tenantId: string,
  planId: string | undefined,
  context: RequestContext
): Promise<QuotaCheckResult> => {
  try {
    const config = getAlertBudgetForPlan(planId ?? ALERT_BUDGET_DEFAULT_PLAN);

    if (isUnlimited(config.maxAnalysesPerDay)) {
      return { allowed: true };
    }

    if (!isRedisReady()) {
      return { allowed: true };
    }

    const client = getRedisClient();
    const dayBucket = getCurrentDayBucket();
    const key = buildAnalysesKey(tenantId, dayBucket);

    const currentRaw = await withTimeout(client.get(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);
    const current = currentRaw !== null ? parseInt(currentRaw, 10) : 0;

    if (current >= config.maxAnalysesPerDay) {
      return {
        allowed: false,
        reason: `Daily analysis limit reached (${current}/${config.maxAnalysesPerDay})`,
        currentUsage: current,
        limit: config.maxAnalysesPerDay,
      };
    }

    return {
      allowed: true,
      currentUsage: current,
      limit: config.maxAnalysesPerDay,
    };
  } catch (error) {
    return failOpen("checkAlertAnalysisQuota", error, context);
  }
};

/**
 * Increment the daily analysis counter for a tenant.
 * Sets TTL on first write to ensure automatic cleanup.
 */
export const incrementAlertAnalysisCount = async (
  tenantId: string,
  context: RequestContext
): Promise<void> => {
  try {
    if (!isRedisReady()) {
      return;
    }

    const client = getRedisClient();
    const dayBucket = getCurrentDayBucket();
    const key = buildAnalysesKey(tenantId, dayBucket);

    const current = await withTimeout(client.incr(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    // First write to this bucket -- set expiry
    if (current === 1) {
      await withTimeout(
        client.expire(key, ALERT_BUDGET_REDIS_TTL),
        REDIS_TIMEOUTS.CACHE_OPERATION_MS
      );
    }
  } catch (error) {
    logger.warn("Failed to increment alert analysis counter", {
      provider: "redis",
      operation: "incrementAlertAnalysisCount",
      error: getErrorMessage(error),
      ...context,
    });
  }
};

// ==================== Active Stream Quota ====================

/**
 * Check whether the tenant has capacity for another active stream.
 * Returns `allowed: true` if under limit or if limit is unlimited (0).
 */
export const checkActiveStreamQuota = async (
  tenantId: string,
  planId: string,
  context: RequestContext
): Promise<QuotaCheckResult> => {
  try {
    const config = getAlertBudgetForPlan(planId);

    if (isUnlimited(config.maxActiveStreams)) {
      return { allowed: true };
    }

    if (!isRedisReady()) {
      return { allowed: true };
    }

    const client = getRedisClient();
    const key = buildActiveStreamsKey(tenantId);

    const currentRaw = await withTimeout(client.get(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);
    const current = currentRaw !== null ? parseInt(currentRaw, 10) : 0;

    if (current >= config.maxActiveStreams) {
      return {
        allowed: false,
        reason: `Active stream limit reached (${current}/${config.maxActiveStreams})`,
        currentUsage: current,
        limit: config.maxActiveStreams,
      };
    }

    return {
      allowed: true,
      currentUsage: current,
      limit: config.maxActiveStreams,
    };
  } catch (error) {
    return failOpen("checkActiveStreamQuota", error, context);
  }
};

/**
 * Increment the active stream gauge for a tenant.
 * No TTL -- streams are decremented explicitly when closed.
 */
export const incrementActiveStreamCount = async (
  tenantId: string,
  context: RequestContext
): Promise<void> => {
  try {
    if (!isRedisReady()) {
      return;
    }

    const client = getRedisClient();
    const key = buildActiveStreamsKey(tenantId);

    await withTimeout(client.incr(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);
  } catch (error) {
    logger.warn("Failed to increment active stream counter", {
      provider: "redis",
      operation: "incrementActiveStreamCount",
      error: getErrorMessage(error),
      ...context,
    });
  }
};

/**
 * Decrement the active stream gauge for a tenant.
 * Floors at 0 to avoid negative drift from missed increments.
 */
export const decrementActiveStreamCount = async (
  tenantId: string,
  context: RequestContext
): Promise<void> => {
  try {
    if (!isRedisReady()) {
      return;
    }

    const client = getRedisClient();
    const key = buildActiveStreamsKey(tenantId);

    const result = await withTimeout(client.decr(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    // Floor at 0 to avoid negative drift from missed increments
    if (result < 0) {
      await withTimeout(client.set(key, "0"), REDIS_TIMEOUTS.CACHE_OPERATION_MS);
    }
  } catch (error) {
    logger.warn("Failed to decrement active stream counter", {
      provider: "redis",
      operation: "decrementActiveStreamCount",
      error: getErrorMessage(error),
      ...context,
    });
  }
};

// ==================== Window Quota ====================

/**
 * Check whether the tenant has remaining daily window budget.
 * Returns `allowed: true` if under limit or if limit is unlimited (0).
 */
export const checkWindowQuota = async (
  tenantId: string,
  planId: string,
  context: RequestContext
): Promise<QuotaCheckResult> => {
  try {
    const config = getAlertBudgetForPlan(planId);

    if (isUnlimited(config.maxWindowsPerDay)) {
      return { allowed: true };
    }

    if (!isRedisReady()) {
      return { allowed: true };
    }

    const client = getRedisClient();
    const dayBucket = getCurrentDayBucket();
    const key = buildWindowsKey(tenantId, dayBucket);

    const currentRaw = await withTimeout(client.get(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);
    const current = currentRaw !== null ? parseInt(currentRaw, 10) : 0;

    if (current >= config.maxWindowsPerDay) {
      return {
        allowed: false,
        reason: `Daily window limit reached (${current}/${config.maxWindowsPerDay})`,
        currentUsage: current,
        limit: config.maxWindowsPerDay,
      };
    }

    return {
      allowed: true,
      currentUsage: current,
      limit: config.maxWindowsPerDay,
    };
  } catch (error) {
    return failOpen("checkWindowQuota", error, context);
  }
};

/**
 * Increment the daily window counter for a tenant.
 * Sets TTL on first write to ensure automatic cleanup.
 */
export const incrementWindowCount = async (
  tenantId: string,
  context: RequestContext
): Promise<void> => {
  try {
    if (!isRedisReady()) {
      return;
    }

    const client = getRedisClient();
    const dayBucket = getCurrentDayBucket();
    const key = buildWindowsKey(tenantId, dayBucket);

    const current = await withTimeout(client.incr(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    // First write to this bucket -- set expiry
    if (current === 1) {
      await withTimeout(
        client.expire(key, ALERT_BUDGET_REDIS_TTL),
        REDIS_TIMEOUTS.CACHE_OPERATION_MS
      );
    }
  } catch (error) {
    logger.warn("Failed to increment window counter", {
      provider: "redis",
      operation: "incrementWindowCount",
      error: getErrorMessage(error),
      ...context,
    });
  }
};
