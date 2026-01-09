/**
 * Rate Limiting Storage Backends
 *
 * Redis-based and in-memory storage implementations for rate limiting.
 *
 * Features:
 * - Redis store with Lua script for atomic operations
 * - In-memory fallback with memory exhaustion protection
 * - Deterministic cleanup to avoid probabilistic issues
 *
 * @module http/rateLimitStores
 */

import { ExternalServiceError, getErrorMessage } from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import { REDIS_SCAN } from "../constants/index.js";
import { getRedisClient } from "../queue/redisClient.js";
import {
  VALID_RATE_LIMIT_KEY_PATTERN,
  MAX_MEMORY_STORE_ENTRIES,
  MAX_REQUEST_COUNT,
  CLEANUP_INTERVAL_REQUESTS,
  type RateLimitStore,
  type RateLimitInfo,
  type RateLimitEntry,
} from "./rateLimitTypes.js";

const logger = createLogger("rate-limiter");

// ==================== Lua Script ====================

/**
 * Lua script for atomic rate limit increment.
 * SECURITY: Prevents TTL race condition by atomically incrementing and setting expiry.
 *
 * Returns: [current_count, ttl_in_ms]
 */
const RATE_LIMIT_LUA_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

// ==================== Redis Store ====================

/**
 * Recursively scans and deletes Redis keys matching a pattern.
 * Uses cursor-based SCAN for memory-efficient iteration.
 *
 * @param redis - Redis client instance
 * @param pattern - Key pattern to match
 * @param cursor - Current scan cursor
 */
const scanAndDeleteKeys = async (
  redis: ReturnType<typeof getRedisClient>,
  pattern: string,
  cursor: string
): Promise<void> => {
  const [nextCursor, keys] = await redis.scan(
    cursor,
    "MATCH",
    pattern,
    "COUNT",
    REDIS_SCAN.BATCH_SIZE
  );

  if (keys.length > 0) {
    await redis.del(...keys);
  }

  // Continue recursively until cursor returns to initial position
  if (nextCursor !== REDIS_SCAN.INITIAL_CURSOR) {
    return scanAndDeleteKeys(redis, pattern, nextCursor);
  }
};

/**
 * Redis-based rate limit store using sliding window counter.
 * Uses Lua script for atomic increment + expire operations.
 */
export class RedisRateLimitStore implements RateLimitStore {
  private readonly keyPrefix: string;
  private readonly max: number;

  constructor(keyPrefix: string, max: number) {
    this.keyPrefix = keyPrefix;
    this.max = max;
  }

  async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    // SECURITY: Validate key format to prevent Redis injection attacks
    if (!VALID_RATE_LIMIT_KEY_PATTERN.test(key)) {
      throw new ExternalServiceError("redis", "Invalid rate limit key format");
    }

    const redis = getRedisClient();

    // SECURITY: Verify Redis client supports eval command
    if (typeof redis.eval !== "function") {
      throw new ExternalServiceError("redis", "Redis client does not support eval command");
    }

    const redisKey = `${this.keyPrefix}${key}`;

    // Use Lua script for atomic increment + expire (prevents TTL race condition)
    const result = await redis.eval(RATE_LIMIT_LUA_SCRIPT, 1, redisKey, windowMs.toString());

    if (!result || !Array.isArray(result) || result.length < 2) {
      throw new ExternalServiceError("redis", "Rate limit Lua script returned invalid result");
    }

    const [currentRaw, ttlRaw] = result as unknown[];

    // SECURITY: Validate Lua result types to prevent type confusion attacks
    if (typeof currentRaw !== "number" || typeof ttlRaw !== "number") {
      throw new ExternalServiceError("redis", "Rate limit Lua script returned non-numeric values");
    }

    // SECURITY: Validate values are finite numbers (not NaN or Infinity)
    if (!Number.isFinite(currentRaw) || !Number.isFinite(ttlRaw)) {
      throw new ExternalServiceError("redis", "Rate limit Lua script returned non-finite values");
    }

    const current = Math.floor(currentRaw);
    const ttl = Math.floor(ttlRaw);

    // SECURITY: Validate current count is non-negative (INCR always returns positive)
    if (current < 0) {
      throw new ExternalServiceError("redis", "Rate limit current count is negative");
    }

    // TTL can be -1 (no expiry) or -2 (key doesn't exist) from PTTL
    // If negative, use windowMs as fallback (key will expire on next INCR)
    const ttlMs = ttl > 0 ? Math.min(ttl, windowMs) : windowMs;
    const resetTime = Math.min(Date.now() + ttlMs, Number.MAX_SAFE_INTEGER);

    return {
      current,
      remaining: Math.max(0, this.max - current),
      resetTime,
    };
  }

  async reset(key: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${this.keyPrefix}${key}`);
  }

  async resetAll(): Promise<void> {
    const redis = getRedisClient();
    const pattern = `${this.keyPrefix}*`;

    // Use recursive SCAN for efficient key iteration
    await scanAndDeleteKeys(redis, pattern, REDIS_SCAN.INITIAL_CURSOR);
  }
}

// ==================== In-Memory Store ====================

/**
 * In-memory rate limit store for fallback when Redis is unavailable.
 * Includes protection against memory exhaustion attacks via max entry limit.
 * Uses deterministic cleanup to avoid probabilistic timing issues.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private store: Map<string, RateLimitEntry> = new Map();
  private readonly max: number;
  private requestCount = 0;

  constructor(max: number) {
    this.max = max;
  }

  async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    const now = Date.now();
    // SECURITY: Use modulo to prevent integer overflow on long-running servers
    this.requestCount = (this.requestCount + 1) % MAX_REQUEST_COUNT;

    // Deterministic cleanup every N requests (avoids probabilistic issues)
    const shouldCleanup =
      this.requestCount % CLEANUP_INTERVAL_REQUESTS === 0 ||
      this.store.size >= MAX_MEMORY_STORE_ENTRIES;

    if (shouldCleanup) {
      this.cleanup(now);
    }

    // Check existing record first (handles existing keys even at capacity)
    const record = this.store.get(key);

    if (record && now <= record.resetTime) {
      // Existing valid window - increment count
      record.count++;
      return {
        current: record.count,
        remaining: Math.max(0, this.max - record.count),
        resetTime: record.resetTime,
      };
    }

    // Need new window - check capacity for new keys only
    if (this.store.size >= MAX_MEMORY_STORE_ENTRIES && !record) {
      // Store full and this is a new key - deny to prevent DoS
      // Existing keys can still be updated (no cascading DoS)
      logger.warn("Rate limit store full - rejecting new key", { key: key.slice(0, 30) });
      const resetTime = Math.min(now + windowMs, Number.MAX_SAFE_INTEGER);
      return { current: this.max + 1, remaining: 0, resetTime };
    }

    // Create new window (replacing expired or new entry)
    // SECURITY: Clamp resetTime to prevent integer overflow
    const resetTime = Math.min(now + windowMs, Number.MAX_SAFE_INTEGER);
    this.store.set(key, { count: 1, resetTime });
    return { current: 1, remaining: this.max - 1, resetTime };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  async resetAll(): Promise<void> {
    this.store.clear();
    this.requestCount = 0;
  }

  private cleanup(now: number): void {
    const keysToDelete: string[] = [];
    this.store.forEach((entry, entryKey) => {
      if (entry.resetTime < now) {
        keysToDelete.push(entryKey);
      }
    });
    keysToDelete.forEach((keyToDelete) => this.store.delete(keyToDelete));
  }
}

/**
 * Creates a Redis rate limit store.
 *
 * @param keyPrefix - Prefix for Redis keys
 * @param max - Maximum requests per window
 * @returns RedisRateLimitStore instance
 */
export const createRedisStore = (keyPrefix: string, max: number): RedisRateLimitStore => {
  try {
    return new RedisRateLimitStore(keyPrefix, max);
  } catch (error) {
    logger.warn("Failed to create Redis rate limit store", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Creates an in-memory rate limit store.
 *
 * @param max - Maximum requests per window
 * @returns InMemoryRateLimitStore instance
 */
export const createMemoryStore = (max: number): InMemoryRateLimitStore =>
  new InMemoryRateLimitStore(max);
