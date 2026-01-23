/**
 * Rate Limiting Storage Backends
 *
 * Redis-based and in-memory storage implementations for rate limiting.
 *
 * Features:
 * - Redis store with Lua script for atomic operations
 * - In-memory fallback with memory exhaustion protection
 * - Deterministic cleanup to avoid probabilistic issues
 * - Consistent key validation across all store operations
 * - Strict prefix validation to prevent glob injection
 *
 * @module rateLimit/stores
 */

import crypto from "crypto";
import { ExternalServiceError, ValidationError, getErrorMessage } from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import { REDIS_SCAN, RATE_LIMIT_LUA_SCRIPT } from "../constants/index.js";
import { getRedisClient } from "../queue/redisClient.js";
import {
  VALID_RATE_LIMIT_KEY_PATTERN,
  MAX_RATE_LIMIT_KEY_LENGTH,
  MAX_RATE_LIMIT_COUNT,
  MAX_MEMORY_STORE_ENTRIES,
  MAX_REQUEST_COUNT,
  CLEANUP_INTERVAL_REQUESTS,
  STORE_FULL_BACKOFF_MS,
  MAX_KEY_PREFIX_LENGTH,
  RATE_LIMIT_NAMESPACE,
  VALID_KEY_PREFIX_PATTERN,
  REDIS_GLOB_CHARS,
  KEY_LOG_HASH_LENGTH,
  MIN_WINDOW_MS,
  MAX_TTL_MS,
  MIN_MAX_REQUESTS,
  type RateLimitStore,
  type RateLimitInfo,
  type RateLimitEntry,
  type RateLimitLuaResult,
} from "./types.js";

const logger = createLogger("rate-limiter");

/** Maximum keys to delete per Redis DEL command to avoid large argument lists */
const DEL_BATCH_SIZE = 100;

/** Threshold for warning about large resetAll deletions (potential misconfiguration) */
const LARGE_DELETION_THRESHOLD = 10000;

// ==================== Shared Utilities ====================

/** Clamps reset time to prevent integer overflow */
const safeResetTime = (baseTime: number, windowMs: number): number =>
  Math.min(baseTime + windowMs, Number.MAX_SAFE_INTEGER);

/** Builds rate limit info from current count */
const buildRateLimitInfo = (current: number, max: number, resetTime: number): RateLimitInfo => ({
  current,
  remaining: Math.max(0, max - current),
  resetTime,
});

/** Redis error factory for consistent error messages */
const redisError = (message: string): ExternalServiceError =>
  new ExternalServiceError("redis", message);

/** Validation error factory for configuration errors */
const configError = (message: string): ValidationError => new ValidationError(message);

// ==================== Validation Utilities ====================

/**
 * Validates windowMs parameter.
 * SECURITY: Prevents weird edge cases like 0, negative, NaN, or excessive TTL.
 */
const validateWindowMs = (windowMs: number): void => {
  if (!Number.isFinite(windowMs)) {
    throw configError("windowMs must be a finite number");
  }
  if (!Number.isInteger(windowMs)) {
    throw configError("windowMs must be an integer");
  }
  if (windowMs < MIN_WINDOW_MS) {
    throw configError(`windowMs must be at least ${MIN_WINDOW_MS}ms`);
  }
  if (windowMs > MAX_TTL_MS) {
    throw configError(`windowMs must not exceed ${MAX_TTL_MS}ms`);
  }
};

/**
 * Validates max parameter.
 * SECURITY: Prevents 0/negative/NaN limits that could cause bypass or overflow.
 */
const validateMax = (max: number): void => {
  if (!Number.isFinite(max)) {
    throw configError("max must be a finite number");
  }
  if (!Number.isInteger(max)) {
    throw configError("max must be an integer");
  }
  if (max < MIN_MAX_REQUESTS) {
    throw configError(`max must be at least ${MIN_MAX_REQUESTS}`);
  }
  if (max > MAX_RATE_LIMIT_COUNT) {
    logger.warn("Rate limit max is unusually high", { max, threshold: MAX_RATE_LIMIT_COUNT });
  }
};

/**
 * Validates key format and length for rate limit operations.
 * SECURITY: Prevents injection attacks and memory DoS via huge keys.
 *
 * NOTE: Throws ValidationError (not ExternalServiceError) because invalid keys
 * are caller input errors, not Redis failures.
 */
const validateKey = (key: string, prefixLength: number = 0): void => {
  // Defensive: ensure prefixLength is valid
  if (!Number.isInteger(prefixLength) || prefixLength < 0) {
    throw configError("prefixLength must be a non-negative integer");
  }

  // Check key pattern
  if (!VALID_RATE_LIMIT_KEY_PATTERN.test(key)) {
    throw configError("Invalid rate limit key format");
  }

  // Check composed key length (prefix + key)
  const composedLength = prefixLength + key.length;
  if (composedLength > MAX_RATE_LIMIT_KEY_LENGTH) {
    throw configError(
      `Composed rate limit key exceeds max length of ${MAX_RATE_LIMIT_KEY_LENGTH} ` +
        `(prefix: ${prefixLength}, key: ${key.length})`
    );
  }
};

/**
 * Validates key prefix for Redis operations.
 * SECURITY: Prevents glob injection in resetAll() which uses prefix + "*".
 */
const validateKeyPrefix = (prefix: string): void => {
  // Check length
  if (prefix.length > MAX_KEY_PREFIX_LENGTH) {
    throw configError(`Key prefix exceeds max length of ${MAX_KEY_PREFIX_LENGTH}`);
  }

  // Check for glob metacharacters (injection prevention)
  for (const char of REDIS_GLOB_CHARS) {
    if (prefix.includes(char)) {
      throw configError(`Key prefix contains forbidden glob character: ${char}`);
    }
  }

  // Check pattern (alphanumeric, colons, underscores, hyphens only)
  if (!VALID_KEY_PREFIX_PATTERN.test(prefix)) {
    throw configError("Key prefix contains invalid characters");
  }

  // Must start with rate limit namespace
  if (!prefix.startsWith(RATE_LIMIT_NAMESPACE)) {
    throw configError(`Key prefix must start with "${RATE_LIMIT_NAMESPACE}"`);
  }

  // Must end with colon (prevents key collisions)
  if (!prefix.endsWith(":")) {
    throw configError("Key prefix must end with ':'");
  }
};

// ==================== Logging Utilities ====================

/**
 * Computes SHA-256 hash prefix for privacy-safe key logging.
 * SECURITY: Never logs raw keys which may contain PII (IPs, tenant IDs, etc.).
 */
const hashKeyForLog = (key: string): string =>
  crypto.createHash("sha256").update(key).digest("hex").slice(0, KEY_LOG_HASH_LENGTH);

// ==================== Redis Utilities ====================

/**
 * Coerces a Lua result value to a finite number.
 * Redis clients (ioredis, node-redis) may return numbers or strings depending on config.
 *
 * SECURITY: Rejects empty strings (Number("") === 0) and non-finite values (Infinity).
 */
const coerceToNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    // Reject empty/whitespace strings (Number("") === 0 would mask bugs)
    if (value.trim() === "") {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Validates and parses Lua script result.
 * SECURITY: Validates types, ranges, and upper bounds to prevent type confusion and corruption.
 *
 * NOTE: Accepts both number and string outputs for Redis client compatibility.
 * ioredis typically returns numbers, but configuration/transformers can vary.
 */
const parseLuaResult = (result: unknown, windowMs: number): RateLimitLuaResult => {
  const isValidArray = Array.isArray(result) && result.length >= 2;
  if (!isValidArray) {
    throw redisError("Rate limit Lua script returned invalid result");
  }

  const [currentRaw, ttlRaw] = result as unknown[];

  // Coerce to numbers (handles both string and number from Redis)
  const currentNum = coerceToNumber(currentRaw);
  const ttlNum = coerceToNumber(ttlRaw);

  if (currentNum === null || ttlNum === null) {
    throw redisError("Rate limit Lua script returned non-numeric values");
  }

  if (!Number.isFinite(currentNum) || !Number.isFinite(ttlNum)) {
    throw redisError("Rate limit Lua script returned non-finite values");
  }

  const current = Math.floor(currentNum);
  const ttl = Math.floor(ttlNum);

  if (current < 0) {
    throw redisError("Rate limit current count is negative");
  }

  // Sanity check: unreasonably large count indicates corrupt state
  if (current > MAX_RATE_LIMIT_COUNT) {
    throw redisError("Rate limit current count is unreasonably large");
  }

  // Clamp TTL to reasonable bounds (can't be more than requested window)
  // Log anomalies for debugging
  if (ttl <= 0) {
    logger.debug("TTL missing/invalid from Lua result; defaulting to windowMs", { ttl, windowMs });
  } else if (ttl > windowMs) {
    logger.debug("TTL clamped to windowMs", { originalTtl: ttl, windowMs });
  }
  const clampedTtl = ttl > 0 ? Math.min(ttl, windowMs) : windowMs;

  return { current, ttl: clampedTtl };
};

/**
 * Validates Redis client has required eval capability.
 */
const validateRedisClient = (redis: ReturnType<typeof getRedisClient>): void => {
  if (typeof redis.eval !== "function") {
    throw redisError("Redis client does not support eval command");
  }
};

/**
 * Deletes keys in batches to avoid large argument lists.
 * SAFETY: Chunks DEL commands to prevent client/server issues with large multi-bulk commands.
 */
const batchDeleteKeys = async (
  redis: ReturnType<typeof getRedisClient>,
  keys: string[]
): Promise<number> => {
  let totalDeleted = 0;

  for (let i = 0; i < keys.length; i += DEL_BATCH_SIZE) {
    const batch = keys.slice(i, i + DEL_BATCH_SIZE);
    const deleted = await redis.del(...batch);
    totalDeleted += typeof deleted === "number" ? deleted : 0;
  }

  return totalDeleted;
};

/**
 * Iteratively scans and deletes Redis keys matching a pattern.
 * Uses cursor-based SCAN for memory-efficient iteration.
 * Batches DEL commands for operational safety.
 */
const scanAndDeleteKeys = async (
  redis: ReturnType<typeof getRedisClient>,
  pattern: string
): Promise<number> => {
  let cursor: string = REDIS_SCAN.INITIAL_CURSOR;
  let isFirstIteration = true;
  let totalDeleted = 0;

  while (isFirstIteration || cursor !== REDIS_SCAN.INITIAL_CURSOR) {
    isFirstIteration = false;

    const [nextCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      REDIS_SCAN.BATCH_SIZE
    );

    if (keys.length > 0) {
      totalDeleted += await batchDeleteKeys(redis, keys);
    }

    cursor = nextCursor;
  }

  return totalDeleted;
};

// ==================== Redis Store ====================

/**
 * Redis-based rate limit store using sliding window counter.
 * Uses Lua script for atomic increment + expire operations.
 *
 * SECURITY:
 * - Validates keyPrefix to prevent glob injection in resetAll()
 * - Validates composed key length (prefix + key)
 * - Validates windowMs and max parameters
 */
export class RedisRateLimitStore implements RateLimitStore {
  private readonly keyPrefix: string;
  private readonly prefixLength: number;
  private readonly max: number;

  constructor(keyPrefix: string, max: number) {
    validateKeyPrefix(keyPrefix);
    validateMax(max);
    this.keyPrefix = keyPrefix;
    this.prefixLength = keyPrefix.length;
    this.max = max;
  }

  async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    validateKey(key, this.prefixLength);
    validateWindowMs(windowMs);

    const redis = getRedisClient();
    validateRedisClient(redis);

    const redisKey = `${this.keyPrefix}${key}`;

    try {
      const result = await redis.eval(RATE_LIMIT_LUA_SCRIPT, 1, redisKey, windowMs.toString());
      const { current, ttl } = parseLuaResult(result, windowMs);

      return buildRateLimitInfo(current, this.max, safeResetTime(Date.now(), ttl));
    } catch (caught) {
      // Rethrow known error types without wrapping
      if (caught instanceof ValidationError || caught instanceof ExternalServiceError) {
        throw caught;
      }

      // Unexpected Redis error - wrap with context
      logger.error("Redis rate limit increment failed", {
        keyPrefix: this.keyPrefix,
        keyHash: hashKeyForLog(key),
        windowMs,
        error: getErrorMessage(caught),
      });

      throw redisError("Failed to increment rate limit");
    }
  }

  async reset(key: string): Promise<void> {
    validateKey(key, this.prefixLength);

    try {
      await getRedisClient().del(`${this.keyPrefix}${key}`);
    } catch (caught) {
      // Rethrow known error types without wrapping
      if (caught instanceof ValidationError || caught instanceof ExternalServiceError) {
        throw caught;
      }

      logger.error("Redis rate limit reset failed", {
        keyPrefix: this.keyPrefix,
        keyHash: hashKeyForLog(key),
        error: getErrorMessage(caught),
      });

      throw redisError("Failed to reset rate limit");
    }
  }

  async resetAll(): Promise<void> {
    try {
      const deleted = await scanAndDeleteKeys(getRedisClient(), `${this.keyPrefix}*`);

      // Warn if unexpectedly large deletion (potential misconfigured prefix)
      if (deleted > LARGE_DELETION_THRESHOLD) {
        logger.warn("Large rate-limit resetAll deletion", {
          keyPrefix: this.keyPrefix,
          keysDeleted: deleted,
          threshold: LARGE_DELETION_THRESHOLD,
        });
      } else {
        logger.info("Rate limit resetAll completed", {
          keyPrefix: this.keyPrefix,
          keysDeleted: deleted,
        });
      }
    } catch (caught) {
      // Rethrow known error types without wrapping
      if (caught instanceof ValidationError || caught instanceof ExternalServiceError) {
        throw caught;
      }

      logger.error("Redis rate limit resetAll failed", {
        keyPrefix: this.keyPrefix,
        error: getErrorMessage(caught),
      });

      throw redisError("Failed to reset all rate limits");
    }
  }
}

// ==================== In-Memory Store ====================

/** Determines if an entry is still valid (not expired) */
const isEntryValid = (entry: RateLimitEntry, now: number): boolean => now <= entry.resetTime;

/** Determines if cleanup should run */
const shouldRunCleanup = (requestCount: number, storeSize: number): boolean =>
  requestCount % CLEANUP_INTERVAL_REQUESTS === 0 || storeSize >= MAX_MEMORY_STORE_ENTRIES;

/** Determines if store can accept new keys */
const canAcceptNewKey = (storeSize: number): boolean => storeSize < MAX_MEMORY_STORE_ENTRIES;

/**
 * In-memory rate limit store for fallback when Redis is unavailable.
 * Includes protection against memory exhaustion attacks via max entry limit.
 * Uses deterministic cleanup to avoid probabilistic timing issues.
 *
 * BEHAVIOR WHEN FULL:
 * When the store reaches MAX_MEMORY_STORE_ENTRIES, new keys are rejected
 * (rate limited) while existing keys can continue to increment. This is
 * a security-first design that prevents memory exhaustion under attack.
 *
 * SECURITY:
 * - Validates key format and length
 * - Validates windowMs and max parameters
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly max: number;
  private requestCount = 0;

  constructor(max: number) {
    validateMax(max);
    this.max = max;
  }

  async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    validateKey(key);
    validateWindowMs(windowMs);

    const now = Date.now();
    this.advanceRequestCounter();

    if (shouldRunCleanup(this.requestCount, this.store.size)) {
      this.cleanup(now);
    }

    const existing = this.store.get(key);

    // Existing valid window - increment
    if (existing && isEntryValid(existing, now)) {
      existing.count++;
      return buildRateLimitInfo(existing.count, this.max, existing.resetTime);
    }

    // Store full and this is a new key - deny to prevent DoS
    // Use short backoff to allow faster recovery
    const isNewKey = !existing;
    if (isNewKey && !canAcceptNewKey(this.store.size)) {
      logger.warn("Rate limit store full - rejecting new key", {
        reason: "store_full_new_key_rejected",
        keyHash: hashKeyForLog(key),
        storeSize: this.store.size,
        maxEntries: MAX_MEMORY_STORE_ENTRIES,
      });

      const backoffMs = Math.min(windowMs, STORE_FULL_BACKOFF_MS);
      return buildRateLimitInfo(this.max + 1, this.max, safeResetTime(now, backoffMs));
    }

    // Create new window (replacing expired or new entry)
    const resetTime = safeResetTime(now, windowMs);
    this.store.set(key, { count: 1, resetTime });
    return buildRateLimitInfo(1, this.max, resetTime);
  }

  async reset(key: string): Promise<void> {
    validateKey(key);
    this.store.delete(key);
  }

  async resetAll(): Promise<void> {
    const entriesCleared = this.store.size;
    this.store.clear();
    this.requestCount = 0;
    logger.debug("In-memory rate limit store cleared", { entriesCleared });
  }

  /** Advances request counter with overflow protection */
  private advanceRequestCounter(): void {
    this.requestCount = (this.requestCount + 1) % MAX_REQUEST_COUNT;
  }

  /** Removes expired entries from the store (allocation-free) */
  private cleanup(now: number): void {
    for (const [key, entry] of this.store) {
      if (!isEntryValid(entry, now)) {
        this.store.delete(key);
      }
    }
  }
}

// ==================== Factory Functions ====================

/** Creates a Redis rate limit store */
export const createRedisStore = (keyPrefix: string, max: number): RedisRateLimitStore =>
  new RedisRateLimitStore(keyPrefix, max);

/** Creates an in-memory rate limit store */
export const createMemoryStore = (max: number): InMemoryRateLimitStore =>
  new InMemoryRateLimitStore(max);
