/**
 * Failover Rate Limit Store
 *
 * A standalone RateLimitStore implementation that wraps RedisRateLimitStore
 * with InMemoryRateLimitStore fallback. Mirrors the failover logic from
 * the Express-coupled RateLimiter class but is decoupled from HTTP concerns.
 *
 * Failover behavior:
 * - Starts with Redis as primary store
 * - On Redis failure, marks failed and falls back to in-memory
 * - Retries Redis with exponential backoff (initial -> max delay)
 * - On successful reconnect, restores Redis and resets backoff
 * - Prevents concurrent retry attempts with isRetrying flag
 *
 * @module rateLimit/failoverStore
 */

import { ExternalServiceError, getErrorMessage } from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import { HTTP_RESILIENCE_DEFAULTS } from "../constants/index.js";
import { getRedisClient } from "../queue/redisClient.js";
import { RedisRateLimitStore, InMemoryRateLimitStore } from "./stores.js";
import {
  REDIS_RETRY_CONFIG,
  type FailoverState,
  type RateLimitStore,
  type RateLimitInfo,
} from "./types.js";

const logger = createLogger("failover-store");

// ==================== Timeout Helper ====================

/**
 * Increment the rate limit store with a timeout guard.
 * Mirrors the incrementWithTimeout pattern from the RateLimiter class.
 * Rejects with ExternalServiceError if the store doesn't respond in time.
 */
const incrementWithTimeout = async (
  store: RateLimitStore,
  key: string,
  windowMs: number
): Promise<RateLimitInfo> => {
  // let: timeout handle needs to be cleared in finally
  let timeoutHandle: NodeJS.Timeout | null = null; // let: cleared in finally
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new ExternalServiceError("rate-limit-store", "Rate limit check timeout")),
        HTTP_RESILIENCE_DEFAULTS.RATE_LIMIT_CHECK_TIMEOUT_MS
      );
    });
    return await Promise.race([store.increment(key, windowMs), timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

// ==================== State Machine Transitions ====================

/** Creates initial failover state */
const createInitialState = (): FailoverState => ({
  useRedis: true,
  redisFailedAt: 0,
  redisRetryDelay: REDIS_RETRY_CONFIG.INITIAL_DELAY_MS,
  isRetrying: false,
});

/** Marks Redis as failed — mutation: state machine transition */
const markFailed = (state: FailoverState): void => {
  Object.assign(state, { useRedis: false, redisFailedAt: Date.now() });
};

/** Marks Redis as restored — mutation: state machine transition */
const markRestored = (state: FailoverState): void => {
  Object.assign(state, { useRedis: true, redisRetryDelay: REDIS_RETRY_CONFIG.INITIAL_DELAY_MS });
};

/** Increases backoff delay after a failed retry — mutation: state machine transition */
const increaseBackoff = (state: FailoverState): void => {
  Object.assign(state, {
    redisRetryDelay: Math.min(
      state.redisRetryDelay * REDIS_RETRY_CONFIG.BACKOFF_MULTIPLIER,
      REDIS_RETRY_CONFIG.MAX_DELAY_MS
    ),
    redisFailedAt: Date.now(),
  });
};

/** Sets the isRetrying flag — mutation: state machine transition */
const setRetrying = (state: FailoverState, value: boolean): void => {
  Object.assign(state, { isRetrying: value });
};

/** Determines whether enough time has elapsed to retry Redis */
const shouldRetryRedis = (state: FailoverState): boolean => {
  if (state.useRedis || state.isRetrying) {
    return false;
  }
  const timeSinceFailure = Date.now() - state.redisFailedAt;
  return timeSinceFailure >= state.redisRetryDelay;
};

/**
 * Attempts to reconnect to Redis.
 * Returns true on success, false otherwise.
 * Increases backoff on both exception AND non-ready status paths.
 */
const tryReconnectRedis = (state: FailoverState, keyPrefix: string): boolean => {
  setRetrying(state, true);
  try {
    const redis = getRedisClient();
    if (redis.status !== "ready") {
      increaseBackoff(state);
      return false;
    }

    logger.info("Redis connection restored for rate limiting", { keyPrefix });
    markRestored(state);
    return true;
  } catch (error: unknown) {
    increaseBackoff(state);
    logger.debug("Redis retry failed, next attempt scheduled", {
      keyPrefix,
      delay: state.redisRetryDelay,
      error: getErrorMessage(error),
    });
    return false;
  } finally {
    setRetrying(state, false);
  }
};

/** Checks if Redis is currently ready; marks failed if not */
const checkRedisHealth = (state: FailoverState, keyPrefix: string): boolean => {
  try {
    const redis = getRedisClient();
    if (redis.status === "ready") {
      return true;
    }

    logger.warn("Redis not ready, falling back to in-memory rate limiting", {
      keyPrefix,
      status: redis.status,
    });
  } catch (error: unknown) {
    logger.warn("Redis connection lost, falling back to in-memory rate limiting", {
      keyPrefix,
      error: getErrorMessage(error),
    });
  }

  markFailed(state);
  return false;
};

/** Returns the currently active store based on failover state */
const getActiveStore = (
  state: FailoverState,
  keyPrefix: string,
  redisStore: RateLimitStore,
  memoryStore: RateLimitStore
): RateLimitStore => {
  // Try to reconnect to Redis with exponential backoff
  if (!state.useRedis && shouldRetryRedis(state)) {
    const restored = tryReconnectRedis(state, keyPrefix);
    if (restored) {
      return redisStore;
    }
  }

  // Check if current Redis connection is still healthy
  if (state.useRedis) {
    const healthy = checkRedisHealth(state, keyPrefix);
    if (healthy) {
      return redisStore;
    }
  }

  return memoryStore;
};

/**
 * Rate limit store with automatic Redis-to-memory failover and reconnection.
 *
 * Uses Redis as the primary store for distributed rate limiting across
 * multiple server instances. Falls back to in-memory store when Redis
 * is unavailable, with exponential backoff retry to restore Redis usage.
 */
export class FailoverRateLimitStore implements RateLimitStore {
  private readonly redisStore: RedisRateLimitStore;
  private readonly memoryStore: InMemoryRateLimitStore;
  private readonly keyPrefix: string;
  private readonly state: FailoverState;

  constructor(keyPrefix: string, max: number) {
    this.keyPrefix = keyPrefix;
    this.state = createInitialState();
    this.redisStore = new RedisRateLimitStore(keyPrefix, max);
    this.memoryStore = new InMemoryRateLimitStore(max);
  }

  async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    const store = getActiveStore(this.state, this.keyPrefix, this.redisStore, this.memoryStore);
    return incrementWithTimeout(store, key, windowMs);
  }

  async reset(key: string): Promise<void> {
    const store = getActiveStore(this.state, this.keyPrefix, this.redisStore, this.memoryStore);
    return store.reset(key);
  }

  async resetAll(): Promise<void> {
    const store = getActiveStore(this.state, this.keyPrefix, this.redisStore, this.memoryStore);
    return store.resetAll();
  }
}

/**
 * Creates a FailoverRateLimitStore with the given key prefix and max count.
 *
 * @param keyPrefix - Redis key prefix (must start with "rl:" and end with ":")
 * @param max - Maximum number of requests allowed per window
 */
export const createFailoverStore = (keyPrefix: string, max: number): FailoverRateLimitStore =>
  new FailoverRateLimitStore(keyPrefix, max);
